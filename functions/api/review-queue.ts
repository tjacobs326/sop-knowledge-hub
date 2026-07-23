import { cacheHeaders, failure, optionalText, readBody, success, unixNow } from "../_shared/api";
import { requireDb, slugify } from "../_shared/admin";
import { hasPermission, requirePermission, type AuthUser, type PermissionName } from "../_shared/auth";
import { newId, type D1DatabaseBinding, type PagesFunctionContext } from "../_shared/cloudflare";
import { resolveRequestedCreatorSubRole, type CreatorSubRole } from "../_shared/ownership";
import { transitionSop, type SopWorkflowAction } from "../_shared/sop-workflow";

interface QueueUser {
  id: string;
  name: string;
  email: string;
  accessLevel: string;
  department?: string | null;
  teamId?: string | null;
}

interface QueueActionPayload {
  id?: string;
  itemType?: "request" | "sop";
  action?: string;
  status?: string;
  assignedTo?: string;
  notes?: string;
  denialReason?: string;
}

type ReviewQueueMode = "personal" | "team" | "admin";

const managedRequestColumns: Record<string, string> = {
  category_id: "TEXT",
  category_name: "TEXT",
  tool_system: "TEXT",
  audience: "TEXT",
  assigned_department: "TEXT",
  assigned_team_id: "TEXT",
  owner_sub_role_id: "TEXT",
  reviewer_notes: "TEXT",
  denial_reason: "TEXT",
  request_notes: "TEXT",
  process_steps: "TEXT",
  routing_reason: "TEXT",
  draft_sop_id: "TEXT",
  related_sop_id: "TEXT",
  submitted_at: "INTEGER",
  reviewed_at: "INTEGER",
  assigned_at: "INTEGER",
  accepted_at: "INTEGER",
  declined_at: "INTEGER",
  approved_at: "INTEGER",
  published_at: "INTEGER",
  closed_at: "INTEGER",
};

const requestStatusByAction: Record<string, string> = {
  review: "Under Review",
  accept: "Accepted",
  decline: "Declined",
  assign: "Assigned",
  "more-info": "Needs More Information",
  revision: "Needs More Information",
  convert: "Draft Created",
  approve: "Approved",
  publish: "Published",
  archive: "Closed",
  close: "Closed",
};

const sopActionByQueueAction: Record<string, SopWorkflowAction> = {
  review: "submit-review",
  submit: "submit-review",
  revision: "request-changes",
  "more-info": "request-changes",
  approve: "approve",
  publish: "publish",
  archive: "archive",
};

const legacyRequestStatusMap: Record<string, string> = {
  new: "Submitted",
  triage: "Under Review",
  assigned: "Assigned",
  drafting: "In Progress",
  in_review: "In Approval",
  needs_revision: "Needs More Information",
  approved: "Approved",
  published: "Published",
  archived: "Closed",
};

function normalizeDate(value: unknown) {
  if (!value) return "";
  if (typeof value === "number") return new Date(value * 1000).toISOString().slice(0, 10);
  const raw = String(value);
  if (/^\d+$/.test(raw)) return new Date(Number(raw) * 1000).toISOString().slice(0, 10);
  return raw.slice(0, 10);
}

function statusKey(status: unknown) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeRequestStatus(status: unknown) {
  const raw = String(status || "").trim();
  return legacyRequestStatusMap[raw.toLowerCase()] || raw || "Submitted";
}

function nowIso() {
  return new Date().toISOString();
}

async function ensureRequestWorkflowSchema(db: D1DatabaseBinding) {
  const info = await db.prepare("PRAGMA table_info(sop_requests)").all<{ name: string }>();
  const existing = new Set((info.results || []).map((row) => row.name));
  for (const [column, type] of Object.entries(managedRequestColumns)) {
    if (!existing.has(column)) {
      await db.prepare(`ALTER TABLE sop_requests ADD COLUMN ${column} ${type}`).run();
    }
  }
}

async function fallbackSubRole(db: D1DatabaseBinding) {
  return await db
    .prepare(
      `SELECT id, label, slug, department, team_id AS teamId
       FROM creator_sub_roles
       WHERE status = 'Active'
       ORDER BY sort_order ASC, label ASC
       LIMIT 1`,
    )
    .first<CreatorSubRole>();
}

async function usersForSubRole(db: D1DatabaseBinding, subRole: CreatorSubRole) {
  const result = await db
    .prepare(
      `SELECT DISTINCT
        users.id,
        users.name,
        users.email,
        users.access_level AS accessLevel,
        users.department,
        users.team_id AS teamId
       FROM users
       LEFT JOIN user_sub_roles ON user_sub_roles.user_id = users.id
       WHERE users.status = 'Active'
        AND COALESCE(users.is_active, 1) = 1
        AND users.access_level IN ('Creator / Reviewer', 'Admin')
        AND (
          user_sub_roles.sub_role_id = ?
          OR users.team_id = ?
          OR users.department = ?
        )
       ORDER BY users.name ASC`,
    )
    .bind(subRole.id, subRole.teamId || "", subRole.department)
    .all<QueueUser>();
  return result.results || [];
}

async function resolveQueueContext(db: D1DatabaseBinding, context: PagesFunctionContext) {
  const auth = await requirePermission(context, "Review SOPs");
  if (auth.response || !auth.user) return { response: auth.response, user: auth.user, subRole: null };

  if (auth.user.role === "normal") {
    return {
      response: failure("FORBIDDEN", "Review Queue is available to Creator / Reviewer and Admin users.", 403),
      user: auth.user,
      subRole: null,
    };
  }

  const requested = await resolveRequestedCreatorSubRole(db, context.request);
  const subRole = requested || auth.user.selectedSubRole || (auth.user.role === "admin" ? await fallbackSubRole(db) : null);
  if (!subRole) {
    return {
      response: failure("SUB_ROLE_REQUIRED", "Select a Creator / Reviewer department before viewing the Review Queue.", 400),
      user: auth.user,
      subRole: null,
    };
  }

  if (auth.user.role === "creator" && !auth.user.subRoles.some((item) => item.id === subRole.id)) {
    return {
      response: failure("FORBIDDEN", "Your account is not assigned to this Creator / Reviewer department.", 403),
      user: auth.user,
      subRole: null,
    };
  }

  return { response: null, user: auth.user, subRole };
}

function teamQueueOption(subRole: CreatorSubRole): QueueUser {
  return {
    id: "team",
    name: `${subRole.department || subRole.label} Team Review Queue`,
    email: "",
    accessLevel: "Team Queue",
    department: subRole.department,
    teamId: subRole.teamId,
  };
}

function adminQueueOption(): QueueUser {
  return {
    id: "admin",
    name: "Admin Review Queue",
    email: "",
    accessLevel: "Admin Queue",
    department: "All departments",
    teamId: null,
  };
}

function queueLabels(mode: ReviewQueueMode, count: number, selectedUser: QueueUser | null, subRole: CreatorSubRole, view: string | null) {
  const isNeedsReview = view === "needs-review";
  const teamName = `${subRole.department || subRole.label} Team Review Queue`;
  const needsReviewTeamName = `${subRole.department || subRole.label} Team Action List`;
  const target = mode === "personal" ? selectedUser?.name || "you" : mode === "admin" ? "Admin Queue" : isNeedsReview ? needsReviewTeamName : teamName;
  const itemWord = count === 1 ? "item" : "items";
  if (isNeedsReview) {
    return {
      heading: mode === "personal" ? "My Action List" : mode === "team" ? "Team Action List" : "Admin Action List",
      description:
        mode === "personal"
          ? "Handle SOP review work assigned directly to you."
          : mode === "team"
            ? "Handle SOP review work currently waiting in your department or team scope."
            : "Handle SOP review work that needs action across authorized backend queues.",
      loadedMessage:
        mode === "admin"
          ? `${count} ${itemWord} need action in ${target}.`
          : `${count} ${itemWord} need action for ${target}.`,
      emptyMessage:
        mode === "personal"
          ? "No items currently need action from you."
          : mode === "team"
            ? `No items currently need action for ${needsReviewTeamName}.`
            : "No items currently need action in the Admin Queue.",
      newLabel: "New",
      needsReviewLabel: mode === "personal" ? "Needs my action" : mode === "team" ? "Needs team action" : "Needs action",
    };
  }
  const reviewItemWord = count === 1 ? "review item" : "review items";
  return {
    heading: mode === "personal" ? "My Review Queue" : mode === "team" ? "Team Review Queue" : "Admin Review Control Center",
    description:
      mode === "personal"
        ? "Review SOP work assigned directly to you."
        : mode === "team"
          ? "Review SOP work assigned to your department or team queue."
          : "Review, assign, approve, publish, and archive backend SOP work across authorized areas.",
    loadedMessage: `${count} ${reviewItemWord} loaded for ${target}.`,
    emptyMessage:
      mode === "personal"
        ? `No review items are assigned directly to ${target}.`
        : mode === "team"
          ? `No review items are assigned to ${teamName}.`
          : "No backend review items are available for the Admin Review Queue.",
    newLabel: "New",
    needsReviewLabel: mode === "personal" ? "Needs my action" : mode === "team" ? "Needs team action" : "Needs action",
  };
}

function requestActions(user: AuthUser) {
  return [
    "view",
    ...(hasPermission(user, "Review SOPs") ? ["review", "accept", "assign", "more-info", "decline", "convert"] : []),
    ...(hasPermission(user, "Approve SOPs") ? ["approve"] : []),
    ...(hasPermission(user, "Publish SOPs") ? ["publish"] : []),
    ...(hasPermission(user, "Archive SOPs") ? ["archive"] : []),
  ];
}

function sopActions(user: AuthUser, status: string) {
  const actions = ["view"];
  if (status === "Draft" || status === "Needs Revision") actions.push("edit");
  if (hasPermission(user, "Review SOPs")) actions.push("assign");
  if (hasPermission(user, "Request Changes") && status === "In Review") actions.push("revision");
  if (hasPermission(user, "Approve SOPs") && status === "In Review") actions.push("approve");
  if (hasPermission(user, "Publish SOPs") && status === "Approved") actions.push("publish");
  if (hasPermission(user, "Archive SOPs")) actions.push("archive");
  return actions;
}

function normalizeRequest(row: Record<string, unknown>, user: AuthUser) {
  const status = normalizeRequestStatus(row.status);
  const itemType = String(row.requestType || "").toLowerCase().includes("template")
    ? "Templates"
    : String(row.requestType || "").toLowerCase().includes("update")
      ? "Updates"
      : "New SOP Requests";
  const source =
    row.departmentName && row.assignedDepartment && row.departmentName !== row.assignedDepartment
      ? "Outside Department Submission"
      : "SOP Request";
  const id = String(row.id || "");
  return {
    id: `request:${id}`,
    originalId: id,
    itemType: "request",
    source,
    filterGroup: itemType,
    title: row.requestedTitle || "Untitled SOP Request",
    submissionType: row.requestType || "Request a new SOP",
    category: row.category || "Uncategorized",
    department: row.departmentName || row.assignedDepartment || "",
    owner: row.ownerSubRole || row.assignedDepartment || "Unassigned",
    submittedBy: row.submittedByName || row.submittedByEmail || "Unknown",
    assignedTo: row.assignedTo || "",
    assignedReviewer: row.assignedToName || row.assignedDepartment || "Unassigned",
    priority: row.priority || "Medium",
    status,
    reviewDate: normalizeDate(row.desiredCompletionAt || row.assignedAt || row.createdAt),
    submittedDate: normalizeDate(row.submittedAt || row.createdAt),
    updatedDate: normalizeDate(row.updatedAt || row.createdAt),
    detailUrl: `/admin/review/?request=${encodeURIComponent(id)}`,
    editUrl: row.draftSopId ? `/create/?edit=draft&id=${encodeURIComponent(String(row.draftSopId))}` : "",
    relatedSopId: row.relatedSopId || row.existingSopId || "",
    draftSopId: row.draftSopId || "",
    reviewerNotes: row.reviewerNotes || "",
    denialReason: row.denialReason || "",
    processSteps: row.processSteps || "",
    availableActions: requestActions(user),
  };
}

function normalizeSop(row: Record<string, unknown>, user: AuthUser) {
  const id = String(row.id || "");
  const status = String(row.status || "In Review");
  return {
    id: `sop:${id}`,
    originalId: id,
    itemType: "sop",
    source: "Internal SOP Creator",
    filterGroup: "Internal Drafts",
    title: row.title || "Untitled SOP",
    submissionType: row.type || "SOP Draft",
    category: row.category || "Uncategorized",
    department: row.ownerDepartment || row.ownerSubRole || "",
    owner: row.owner || row.ownerSubRole || "Unassigned",
    submittedBy: row.createdBy || row.owner || "Unknown",
    assignedTo: row.assignedTo || "",
    assignedReviewer: row.assignedReviewer || "Unassigned",
    priority: row.priority || "Medium",
    status,
    reviewDate: normalizeDate(row.dueAt || row.reviewDate || row.reviewDueAt),
    submittedDate: normalizeDate(row.createdAt),
    updatedDate: normalizeDate(row.updatedAt || row.createdAt),
    detailUrl: row.slug
      ? `/sops/detail/?slug=${encodeURIComponent(String(row.slug))}`
      : `/sops/detail/?id=${encodeURIComponent(id)}`,
    editUrl: `/create/?edit=draft&id=${encodeURIComponent(id)}`,
    assignmentType: row.assignmentType || "",
    reviewerNotes: row.reviewerNotes || "",
    availableActions: sopActions(user, status),
  };
}

async function queryRequests(db: D1DatabaseBinding, subRole: CreatorSubRole, selectedUser: QueueUser | null, user: AuthUser, mode: ReviewQueueMode) {
  const whereSql =
    mode === "personal"
      ? "sop_requests.assigned_to = ?"
      : mode === "team"
        ? `(
            sop_requests.owner_sub_role_id = ?
            OR sop_requests.assigned_department = ?
            OR sop_requests.assigned_team_id = ?
          )`
        : "1 = 1";
  const values: unknown[] =
    mode === "personal" ? [selectedUser!.id] : mode === "team" ? [subRole.id, subRole.department, subRole.teamId || ""] : [];

  const result = await db
    .prepare(
      `SELECT
        sop_requests.id,
        sop_requests.request_type AS requestType,
        sop_requests.requested_title AS requestedTitle,
        sop_requests.department_name AS departmentName,
        sop_requests.submitted_by_name AS submittedByName,
        sop_requests.submitted_by_email AS submittedByEmail,
        sop_requests.priority,
        sop_requests.desired_completion_at AS desiredCompletionAt,
        sop_requests.existing_sop_id AS existingSopId,
        sop_requests.related_sop_id AS relatedSopId,
        sop_requests.draft_sop_id AS draftSopId,
        sop_requests.category_name AS category,
        sop_requests.status,
        sop_requests.assigned_to AS assignedTo,
        assignee.name AS assignedToName,
        sop_requests.assigned_department AS assignedDepartment,
        sop_requests.owner_sub_role_id AS ownerSubRoleId,
        sub_roles.label AS ownerSubRole,
        sop_requests.reviewer_notes AS reviewerNotes,
        sop_requests.denial_reason AS denialReason,
        sop_requests.process_steps AS processSteps,
        sop_requests.submitted_at AS submittedAt,
        sop_requests.assigned_at AS assignedAt,
        sop_requests.created_at AS createdAt,
        sop_requests.updated_at AS updatedAt
       FROM sop_requests
       LEFT JOIN users assignee ON assignee.id = sop_requests.assigned_to
       LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sop_requests.owner_sub_role_id
       WHERE ${whereSql}
       ORDER BY sop_requests.updated_at DESC, sop_requests.created_at DESC
       LIMIT 200`,
    )
    .bind(...values)
    .all<Record<string, unknown>>();

  return (result.results || []).map((row) => normalizeRequest(row, user));
}

async function querySopReviews(db: D1DatabaseBinding, subRole: CreatorSubRole, selectedUser: QueueUser | null, user: AuthUser, mode: ReviewQueueMode) {
  const whereSql =
    mode === "personal"
      ? "assignments.user_id = ?"
      : mode === "team"
        ? `(
            sops.owner_sub_role_id = ?
            OR sops.owner_team_id = ?
            OR assignments.team_id = ?
          )`
        : "1 = 1";
  const values: unknown[] =
    mode === "personal"
      ? [selectedUser!.id]
      : mode === "team"
        ? [subRole.id, subRole.teamId || "", subRole.teamId || ""]
        : [];

  const result = await db
    .prepare(
      `SELECT
        sops.id,
        sops.title,
        sops.slug,
        sops.status,
        sops.type,
        sops.review_date AS reviewDate,
        sops.review_due_at AS reviewDueAt,
        sops.created_at AS createdAt,
        sops.updated_at AS updatedAt,
        categories.name AS category,
        owner.name AS owner,
        creator.name AS createdBy,
        sub_roles.label AS ownerSubRole,
        sub_roles.department AS ownerDepartment,
        assignments.user_id AS assignedTo,
        assignments.assignment_type AS assignmentType,
        assignments.due_at AS dueAt,
        reviewer.name AS assignedReviewer
       FROM sops
       LEFT JOIN categories ON categories.id = sops.category_id
       LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
       LEFT JOIN users creator ON creator.id = sops.created_by_user_id
       LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id
       LEFT JOIN sop_assignments assignments ON assignments.sop_id = sops.id
        AND assignments.status = 'Active'
        AND assignments.assignment_type IN ('Reviewer', 'Approver', 'Publisher')
       LEFT JOIN users reviewer ON reviewer.id = assignments.user_id
       WHERE COALESCE(sops.is_active, 1) = 1
        AND sops.status IN ('In Review', 'Approved')
        AND ${whereSql}
       GROUP BY sops.id
       ORDER BY sops.updated_at DESC, assignments.due_at ASC, sops.title ASC
       LIMIT 200`,
    )
    .bind(...values)
    .all<Record<string, unknown>>();

  return (result.results || []).map((row) => normalizeSop(row, user));
}

function summarize(items: Array<{ status: unknown; priority: unknown }>) {
  const byStatus: Record<string, number> = {};
  items.forEach((item) => {
    const key = statusKey(item.status) || "unknown";
    byStatus[key] = (byStatus[key] || 0) + 1;
  });
  return {
    all: items.length,
    new: items.filter((item) => ["submitted", "assigned", "draft"].includes(statusKey(item.status))).length,
    needsReview: items.filter((item) =>
      [
        "submitted",
        "assigned",
        "draft",
        "under-review",
        "in-review",
        "needs-more-information",
        "needs-revision",
        "accepted",
        "in-progress",
        "draft-created",
        "in-approval",
      ].includes(statusKey(item.status)),
    ).length,
    urgent: items.filter((item) => ["High", "Urgent"].includes(String(item.priority || ""))).length,
    approved: items.filter((item) => statusKey(item.status) === "approved").length,
    published: items.filter((item) => statusKey(item.status) === "published").length,
    archived: items.filter((item) => ["archived", "closed", "declined"].includes(statusKey(item.status))).length,
    byStatus,
  };
}

function needsReviewStatus(status: unknown) {
  return [
    "submitted",
    "assigned",
    "draft",
    "under-review",
    "in-review",
    "needs-more-information",
    "needs-revision",
    "accepted",
    "in-progress",
    "draft-created",
    "in-approval",
    "approved",
  ].includes(statusKey(status));
}

const routeFilters = new Set(["review-needed", "needs-review", "overdue", "urgent", "approved", "published", "archived"]);

type QueueItem = ReturnType<typeof normalizeRequest> | ReturnType<typeof normalizeSop>;

function routeReviewId(value: string) {
  const trimmed = optionalText(value, 180);
  if (!trimmed) return "";
  if (!/^(request|sop):[a-zA-Z0-9_.:-]+$/.test(trimmed)) return "";
  return trimmed;
}

function filterQueueItems(items: QueueItem[], filter: string) {
  const today = new Date().toISOString().slice(0, 10);
  if (filter === "review-needed" || filter === "needs-review") return items.filter((item) => needsReviewStatus(item.status));
  if (filter === "overdue") {
    return items.filter((item) => {
      const reviewDate = String(item.reviewDate || "").slice(0, 10);
      return Boolean(reviewDate && reviewDate < today && needsReviewStatus(item.status));
    });
  }
  if (filter === "urgent") return items.filter((item) => ["High", "Urgent"].includes(String(item.priority || "")));
  if (filter === "approved") return items.filter((item) => statusKey(item.status) === "approved");
  if (filter === "published") return items.filter((item) => statusKey(item.status) === "published");
  if (filter === "archived") return items.filter((item) => ["archived", "closed", "declined"].includes(statusKey(item.status)));
  return items;
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const db = context.env.DB!;
  await ensureRequestWorkflowSchema(db);

  const resolved = await resolveQueueContext(db, context);
  if (resolved.response || !resolved.subRole || !resolved.user) return resolved.response;

  const url = new URL(context.request.url);
  const view = optionalText(url.searchParams.get("view"), 40);
  const requestedFilter = optionalText(url.searchParams.get("filter"), 80);
  if (requestedFilter && !routeFilters.has(requestedFilter)) {
    return failure("VALIDATION_ERROR", "Unsupported review queue filter.", 400, { filter: "Invalid filter" });
  }
  const requestedReviewId = routeReviewId(url.searchParams.get("review") || "");
  if (url.searchParams.get("review") && !requestedReviewId) {
    return failure("VALIDATION_ERROR", "Unsupported review identifier.", 400, { review: "Invalid review id" });
  }
  const requestedScope = optionalText(url.searchParams.get("scope"), 40);
  const requestedUserId = optionalText(url.searchParams.get("userId"), 160);
  const users = await usersForSubRole(db, resolved.subRole);
  const activeUser =
    users.find((user) => user.id === resolved.user?.id || user.email.toLowerCase() === resolved.user?.email.toLowerCase()) || null;
  const personalUsers = resolved.user.role === "admin" ? users : activeUser ? [activeUser] : [];
  const wantsAdmin = requestedScope === "admin" || requestedUserId === "admin";
  if (wantsAdmin && resolved.user.role !== "admin") {
    return failure("FORBIDDEN", "Only admins can view the Admin Review Queue.", 403);
  }
  const selectedUserId = wantsAdmin ? "admin" : requestedUserId || activeUser?.id || "team";
  const mode: ReviewQueueMode = wantsAdmin ? "admin" : selectedUserId === "team" ? "team" : "personal";
  const selectedUser = mode === "personal" ? personalUsers.find((user) => user.id === selectedUserId) || null : null;
  if (mode === "personal" && !selectedUser) {
    return failure("USER_OUT_OF_SCOPE", "The selected reviewer is not available in this Creator / Reviewer scope.", 403);
  }

  // Personal, team, and admin queues must remain separate so counts do not blend individual and department-wide work.
  const [requests, sops] = await Promise.all([
    queryRequests(db, resolved.subRole, selectedUser, resolved.user, mode),
    querySopReviews(db, resolved.subRole, selectedUser, resolved.user, mode),
  ]);
  const allItems = [...requests, ...sops].sort((a, b) => String(b.updatedDate).localeCompare(String(a.updatedDate)));
  // Needs Review is a daily action list; keep personal, team, and admin scopes separate so counts and ownership stay accurate.
  const viewItems = view === "needs-review" ? allItems.filter((item) => needsReviewStatus(item.status)) : allItems;
  const filterItems = requestedFilter ? filterQueueItems(viewItems, requestedFilter) : viewItems;
  const items = requestedReviewId ? filterItems.filter((item) => item.id === requestedReviewId) : filterItems;
  const labels = queueLabels(mode, items.length, selectedUser, resolved.subRole, view);
  const workScopeLabel =
    mode === "personal"
      ? [selectedUser?.accessLevel || resolved.user.accessLevel, selectedUser?.name, selectedUser?.department].filter(Boolean).join(" - ")
      : mode === "admin"
        ? "Admin Review Queue - All departments"
        : `Team Review Queue - ${resolved.subRole.department || resolved.subRole.label}`;
  const canReview = hasPermission(resolved.user, "Review SOPs");
  const canApprove = hasPermission(resolved.user, "Approve SOPs");
  const canPublish = hasPermission(resolved.user, "Publish SOPs");
  const canArchive = hasPermission(resolved.user, "Archive SOPs");
  const canAssign = canReview;
  const canViewAdminQueue = resolved.user.role === "admin";
  const queueOptions = [
    ...(canViewAdminQueue ? [adminQueueOption()] : []),
    teamQueueOption(resolved.subRole),
    ...personalUsers,
  ];

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        context: {
          mode,
          view: view === "needs-review" ? "needs-review" : "queue",
          role: resolved.user.role,
          activeUser: {
            id: resolved.user.id,
            name: resolved.user.name,
            email: resolved.user.email,
            role: resolved.user.role,
            accessLevel: resolved.user.accessLevel,
            department: activeUser?.department || null,
            teamId: activeUser?.teamId || null,
          },
          accessLevel: workScopeLabel,
          workScopeLabel,
          selectedUser,
          selectedSubRole: resolved.subRole,
          canReview,
          canApprove,
          canPublish,
          canArchive,
          canAssign,
          canViewAdminQueue,
          permissions: resolved.user.permissions,
        },
        labels,
        viewOptions: {
          users: queueOptions,
          subRoles: [resolved.subRole],
          scopes: queueOptions.map((option) => ({
            id: option.id,
            label:
              option.id === "admin"
                ? "Admin Action List"
                : option.id === "team"
                  ? `${resolved.subRole.department || resolved.subRole.label} Team Action List`
                  : option.id === activeUser?.id
                    ? "My Action List"
                    : `${option.name} Action List`,
          })),
        },
        counts: summarize(items),
        items,
      },
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders("private"),
        vary: "x-sop-sub-role",
      },
    },
  );
};

async function updateRequest(db: D1DatabaseBinding, payload: QueueActionPayload, actorId: string) {
  const originalId = optionalText(payload.id, 160).replace(/^request:/, "");
  if (!originalId) return failure("VALIDATION_ERROR", "Review item id is required.", 400, { id: "Required" });
  const now = unixNow();
  const action = optionalText(payload.action, 80) || "update";
  const status = optionalText(payload.status, 80) || requestStatusByAction[action] || "Under Review";
  const assignedTo = optionalText(payload.assignedTo, 160) || null;
  const notes = optionalText(payload.notes, 6000);
  const denialReason = optionalText(payload.denialReason, 3000);
  const draftSopId = action === "convert" ? await createDraftFromQueueRequest(db, originalId, actorId) : null;

  await db
    .prepare(
      `UPDATE sop_requests
       SET status = ?,
        assigned_to = COALESCE(?, assigned_to),
        reviewer_notes = COALESCE(NULLIF(?, ''), reviewer_notes),
        denial_reason = CASE WHEN ? = 'Declined' THEN COALESCE(NULLIF(?, ''), denial_reason) ELSE denial_reason END,
        draft_sop_id = COALESCE(?, draft_sop_id),
        reviewed_at = COALESCE(reviewed_at, ?),
        assigned_at = CASE WHEN ? = 'Assigned' THEN COALESCE(assigned_at, ?) ELSE assigned_at END,
        accepted_at = CASE WHEN ? = 'Accepted' THEN COALESCE(accepted_at, ?) ELSE accepted_at END,
        declined_at = CASE WHEN ? = 'Declined' THEN COALESCE(declined_at, ?) ELSE declined_at END,
        approved_at = CASE WHEN ? = 'Approved' THEN COALESCE(approved_at, ?) ELSE approved_at END,
        published_at = CASE WHEN ? = 'Published' THEN COALESCE(published_at, ?) ELSE published_at END,
        closed_at = CASE WHEN ? IN ('Closed', 'Declined') THEN COALESCE(closed_at, ?) ELSE closed_at END,
        updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      status,
      assignedTo,
      notes,
      status,
      denialReason || notes,
      draftSopId,
      now,
      status,
      now,
      status,
      now,
      status,
      now,
      status,
      now,
      status,
      now,
      status,
      now,
      now,
      originalId,
  )
    .run();

  await db
    .prepare(
      `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(newId("audit"), actorId, `review_request_${action}`, "sop_request", originalId, JSON.stringify({ status, assignedTo, notes }), now)
    .run();
  if (action === "publish") {
    await db
      .prepare(
        `UPDATE sops
         SET status = 'Published', published_at = COALESCE(published_at, ?), is_active = 1, updated_at = ?
         WHERE id = (SELECT COALESCE(draft_sop_id, related_sop_id, existing_sop_id) FROM sop_requests WHERE id = ?)`,
      )
      .bind(nowIso(), nowIso(), originalId)
      .run();
  }

  return success({ id: `request:${originalId}`, status, draftSopId }, "Review request updated.");
}

async function createDraftFromQueueRequest(db: D1DatabaseBinding, requestId: string, actorId: string) {
  const request = await db
    .prepare(
      `SELECT
        sop_requests.id,
        sop_requests.requested_title AS requestedTitle,
        sop_requests.description,
        sop_requests.category_id AS categoryId,
        sop_requests.assigned_to AS assignedTo,
        sop_requests.assigned_team_id AS assignedTeamId,
        sop_requests.owner_sub_role_id AS ownerSubRoleId,
        sop_requests.requested_sop_type AS requestedSopType,
        sop_requests.audience,
        sop_requests.tool_system AS toolOrSystem,
        sop_requests.draft_content AS draftContent,
        sop_requests.process_steps AS processSteps,
        sop_requests.draft_sop_id AS draftSopId
       FROM sop_requests
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(requestId)
    .first<Record<string, unknown>>();
  if (!request) return null;
  if (request.draftSopId) return String(request.draftSopId);

  const sopId = newId("sop");
  const versionId = newId("version");
  const title = optionalText(request.requestedTitle || "Untitled SOP Request", 180);
  const description = optionalText(request.description, 4000);
  const processSteps = optionalText(request.processSteps, 20000);
  const baseContent = optionalText(request.draftContent || description || title, 50000);
  const content = [processSteps ? `Requester-provided workflow outline:\n${processSteps}` : "", baseContent]
    .filter(Boolean)
    .join("\n\n");
  const createdAt = nowIso();
  const updatedAt = Math.floor(Date.now() / 1000);
  const metadata = JSON.stringify({
    audience: String(request.audience || "").split(/[\n,|]/).map((item) => item.trim()).filter(Boolean),
    tools: String(request.toolOrSystem || "").split(/[\n,|]/).map((item) => item.trim()).filter(Boolean),
    sourceRequestId: requestId,
  });

  await db
    .prepare(
      `INSERT INTO sops (
        id, title, slug, summary, purpose, category_id, owner_id, owner_user_id,
        owner_team_id, owner_sub_role_id, status, type, current_version_id,
        audience, is_active, created_by_user_id, source_type, visibility, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, 1, ?, 'Database', 'Internal', ?, ?)`,
    )
    .bind(
      sopId,
      title,
      slugify(title, sopId),
      description.slice(0, 1000),
      description,
      request.categoryId || null,
      request.assignedTo || actorId,
      request.assignedTo || actorId,
      request.assignedTeamId || null,
      request.ownerSubRoleId || null,
      request.requestedSopType || "Process",
      versionId,
      request.audience || "",
      actorId,
      createdAt,
      createdAt,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO sop_versions (
        id, sop_id, version_label, version_number, title, summary, purpose,
        body_markdown, content, metadata_json, change_summary, status,
        created_by_user_id, created_by, created_at, updated_at
      ) VALUES (?, ?, '0.1', '0.1', ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?)`,
    )
    .bind(
      versionId,
      sopId,
      title,
      description.slice(0, 1000),
      description,
      content,
      content,
      metadata,
      `Draft created from SOP request ${requestId}.`,
      actorId,
      actorId,
      createdAt,
      updatedAt,
    )
    .run();

  return sopId;
}

async function assignSop(db: D1DatabaseBinding, sopId: string, assignedTo: string, actorId: string, notes: string) {
  const sop = await db
    .prepare("SELECT id, current_version_id AS currentVersionId, owner_team_id AS ownerTeamId, review_date AS reviewDate FROM sops WHERE id = ? LIMIT 1")
    .bind(sopId)
    .first<{ id: string; currentVersionId?: string; ownerTeamId?: string; reviewDate?: string }>();
  if (!sop) return failure("NOT_FOUND", "SOP not found.", 404);

  await db
    .prepare(
      `INSERT INTO sop_assignments (
        id, sop_id, version_id, user_id, team_id, assignment_type, status, assigned_by_user_id, due_at
      ) VALUES (?, ?, ?, ?, ?, 'Reviewer', 'Active', ?, ?)
      ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, status = 'Active', updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(`assignment-reviewer-${sopId}`, sopId, sop.currentVersionId || null, assignedTo || null, sop.ownerTeamId || null, actorId, sop.reviewDate || null)
    .run();

  await db
    .prepare(
      `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(newId("audit"), actorId, "assign_sop_review", "sop", sopId, JSON.stringify({ assignedTo, notes }), unixNow())
    .run();
  return success({ id: `sop:${sopId}`, assignedTo }, "SOP review assigned.");
}

async function updateSop(db: D1DatabaseBinding, payload: QueueActionPayload, actorId: string) {
  const sopId = optionalText(payload.id, 160).replace(/^sop:/, "");
  if (!sopId) return failure("VALIDATION_ERROR", "Review item id is required.", 400, { id: "Required" });
  const action = optionalText(payload.action, 80) || "review";
  const notes = optionalText(payload.notes, 6000);
  const assignedTo = optionalText(payload.assignedTo, 160);

  if (action === "assign") return assignSop(db, sopId, assignedTo, actorId, notes);

  const workflowAction =
    sopActionByQueueAction[action] ||
    (payload.status === "Approved"
      ? "approve"
      : payload.status === "Published"
        ? "publish"
        : payload.status === "Archived"
          ? "archive"
          : payload.status === "Needs Revision"
            ? "request-changes"
            : null);
  if (!workflowAction) return success({ id: `sop:${sopId}` }, "No workflow change was needed.");

  const transition = await transitionSop(db, {
    sopId,
    action: workflowAction,
    actorUserId: actorId,
    notes: notes || `${workflowAction} from Review Queue.`,
  });
  if (!transition) return failure("NOT_FOUND", "SOP not found.", 404);
  return success({ id: `sop:${sopId}`, transition }, "SOP workflow updated.");
}

function permissionForAction(itemType: string, action: string) {
  if (action === "archive") return "Archive SOPs";
  if (action === "publish") return "Publish SOPs";
  if (action === "approve") return "Approve SOPs";
  if (action === "revision" || action === "more-info") return "Request Changes";
  if (itemType === "request" && ["accept", "assign", "decline", "convert", "review"].includes(action)) return "Review SOPs";
  if (itemType === "sop" && ["assign", "review", "submit"].includes(action)) return "Review SOPs";
  return "Review SOPs";
}

async function requestInScope(db: D1DatabaseBinding, id: string, subRole: CreatorSubRole, userId: string) {
  const row = await db
    .prepare(
      `SELECT id
       FROM sop_requests
       WHERE id = ?
        AND (
          owner_sub_role_id = ?
          OR assigned_department = ?
          OR assigned_team_id = ?
          OR assigned_to = ?
        )
       LIMIT 1`,
    )
    .bind(id, subRole.id, subRole.department, subRole.teamId || "", userId)
    .first<{ id: string }>();
  return Boolean(row);
}

async function sopInScope(db: D1DatabaseBinding, id: string, subRole: CreatorSubRole, userId: string) {
  const row = await db
    .prepare(
      `SELECT sops.id
       FROM sops
       LEFT JOIN sop_assignments assignments ON assignments.sop_id = sops.id
        AND assignments.status = 'Active'
       WHERE sops.id = ?
        AND (
          sops.owner_sub_role_id = ?
          OR sops.owner_team_id = ?
          OR assignments.team_id = ?
          OR assignments.user_id = ?
        )
       LIMIT 1`,
    )
    .bind(id, subRole.id, subRole.teamId || "", subRole.teamId || "", userId)
    .first<{ id: string }>();
  return Boolean(row);
}

export const onRequestPut = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const resolved = await resolveQueueContext(context.env.DB!, context);
  if (resolved.response || !resolved.user || !resolved.subRole) return resolved.response;
  const [payload, parseError] = await readBody<QueueActionPayload>(context.request);
  if (parseError) return parseError;

  const action = optionalText(payload?.action, 80) || "review";
  const itemType = payload?.itemType || (String(payload?.id || "").startsWith("request:") ? "request" : "sop");
  const requiredPermission = permissionForAction(itemType, action);
  if (!hasPermission(resolved.user, requiredPermission as PermissionName)) {
    return failure("FORBIDDEN", `You do not have permission to ${action} this review item.`, 403);
  }

  if (payload?.itemType === "request" || String(payload?.id || "").startsWith("request:")) {
    const id = optionalText(payload?.id, 160).replace(/^request:/, "");
    if (!(await requestInScope(context.env.DB!, id, resolved.subRole, resolved.user.id))) {
      return failure("FORBIDDEN", "This request is not assigned to the selected Creator / Reviewer department.", 403);
    }
    return updateRequest(context.env.DB!, payload || {}, resolved.user.id);
  }
  const id = optionalText(payload?.id, 160).replace(/^sop:/, "");
  if (!(await sopInScope(context.env.DB!, id, resolved.subRole, resolved.user.id))) {
    return failure("FORBIDDEN", "This SOP review item is not assigned to the selected Creator / Reviewer department.", 403);
  }
  return updateSop(context.env.DB!, payload || {}, resolved.user.id);
};
