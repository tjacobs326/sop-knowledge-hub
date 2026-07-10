import { failure, optionalText, success } from "../_shared/api";
import { requireDb } from "../_shared/admin";
import { getAuthUser } from "../_shared/auth";
import { type D1DatabaseBinding, type PagesFunctionContext } from "../_shared/cloudflare";
import { resolveAuthorizedCreatorSubRole, type CreatorSubRole } from "../_shared/ownership";

interface WorkUser {
  id: string;
  name: string;
  email: string;
  title?: string | null;
  department?: string | null;
  teamId?: string | null;
  accessLevel: string;
}

const requestWorkflowColumns: Record<string, string> = {
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

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function detailUrl(row: Record<string, unknown>) {
  if (row.slug) return `/sops/detail/?slug=${encodeURIComponent(String(row.slug))}`;
  return `/sops/detail/?id=${encodeURIComponent(String(row.id || row.sopId || ""))}`;
}

function normalizeDate(value: unknown) {
  if (!value) return "";
  if (typeof value === "number") return new Date(value * 1000).toISOString().slice(0, 10);
  const raw = String(value);
  if (/^\d+$/.test(raw)) return new Date(Number(raw) * 1000).toISOString().slice(0, 10);
  return raw.slice(0, 10);
}

function normalizeRequest(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title || row.requestedTitle || "Untitled SOP Request",
    status: row.status || "Submitted",
    priority: row.priority || "Medium",
    updatedDate: normalizeDate(row.updatedAt || row.createdAt),
    reviewDate: normalizeDate(row.desiredCompletionAt || row.assignedAt || row.createdAt),
    owner: row.assignedToName || row.assignedDepartment || "Unassigned",
    department: row.assignedDepartment || row.departmentName || "",
    category: row.category || "Uncategorized",
    url: `/admin/review/?request=${encodeURIComponent(String(row.id || ""))}`,
  };
}

function normalizeSop(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title || "Untitled SOP",
    category: row.category || "Uncategorized",
    status: row.status || "Draft",
    owner: row.owner || row.ownerDepartment || "Unassigned",
    reviewDate: normalizeDate(row.reviewDate || row.reviewDueAt || row.dueAt),
    updatedDate: normalizeDate(row.updatedAt || row.createdAt),
    ownerSubRoleId: row.ownerSubRoleId || "",
    ownerSubRole: row.ownerSubRole || "",
    ownerDepartment: row.ownerDepartment || "",
    assignmentType: row.assignmentType || "",
    url: detailUrl(row),
  };
}

function normalizeReview(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title || row.sopTitle || "Untitled Review",
    status: row.status || "Assigned",
    priority: row.priority || "Medium",
    reviewDate: normalizeDate(row.dueDate || row.reviewDate || row.dueAt),
    owner: row.reviewer || row.owner || "Unassigned",
    url: row.sopId
      ? `/sops/detail/?id=${encodeURIComponent(String(row.sopId))}`
      : `/admin/needs-review/?review=${encodeURIComponent(String(row.id || ""))}`,
  };
}

function scopeClause(alias: string, subRole: CreatorSubRole) {
  const clauses = [`${alias}.owner_sub_role_id = ?`];
  const values: unknown[] = [subRole.id];
  if (subRole.teamId) {
    clauses.push(`${alias}.owner_team_id = ?`);
    values.push(subRole.teamId);
  }
  return { sql: `(${clauses.join(" OR ")})`, values };
}

async function ensureRequestWorkflowSchema(db: D1DatabaseBinding) {
  const info = await db.prepare("PRAGMA table_info(sop_requests)").all<{ name: string }>();
  const existing = new Set((info.results || []).map((row) => row.name));
  for (const [column, type] of Object.entries(requestWorkflowColumns)) {
    if (!existing.has(column)) {
      await db.prepare(`ALTER TABLE sop_requests ADD COLUMN ${column} ${type}`).run();
    }
  }
}

async function usersForSubRole(db: D1DatabaseBinding, subRole: CreatorSubRole) {
  const result = await db
    .prepare(
      `SELECT DISTINCT
        users.id,
        users.name,
        users.email,
        users.title,
        users.department,
        users.team_id AS teamId,
        users.access_level AS accessLevel
       FROM users
       LEFT JOIN user_sub_roles ON user_sub_roles.user_id = users.id
       WHERE users.status = 'Active'
        AND COALESCE(users.is_active, 1) = 1
        AND users.access_level IN ('Creator / Reviewer', 'Admin')
        AND (
          user_sub_roles.sub_role_id = ?
          OR users.department = ?
          OR users.team_id = ?
        )
       ORDER BY users.name ASC`,
    )
    .bind(subRole.id, subRole.department, subRole.teamId || "")
    .all<WorkUser>();

  return result.results || [];
}

async function fallbackSubRole(db: D1DatabaseBinding) {
  const row = await db
    .prepare(
      `SELECT id, label, slug, department, team_id AS teamId
       FROM creator_sub_roles
       WHERE status = 'Active'
       ORDER BY sort_order ASC, label ASC
       LIMIT 1`,
    )
    .first<CreatorSubRole>();
  return row || null;
}

async function resolveWorkContext(db: D1DatabaseBinding, context: PagesFunctionContext) {
  const user = await getAuthUser(context);
  if (user?.role === "normal") {
    return {
      response: failure("FORBIDDEN", "My Work is available to Creator / Reviewer and Admin users.", 403),
      user,
      subRole: null,
    };
  }

  const requested = await resolveAuthorizedCreatorSubRole(db, user, context.request, { allowAdminFallback: true });
  const authSelected = user?.selectedSubRole || null;
  const subRole = requested || authSelected || (user?.role === "admin" ? await fallbackSubRole(db) : null);

  if (!subRole) {
    return {
      response: failure("SUB_ROLE_REQUIRED", "Select a Creator / Reviewer department before viewing My Work.", 400),
      user,
      subRole: null,
    };
  }

  if (user?.role === "creator" && !user.subRoles.some((item) => item.id === subRole.id)) {
    return {
      response: failure("FORBIDDEN", "Your account is not assigned to this Creator / Reviewer department.", 403),
      user,
      subRole: null,
    };
  }

  return { response: null, user, subRole };
}

async function querySubmittedRequests(db: D1DatabaseBinding, subRole: CreatorSubRole, selectedUser: WorkUser | null) {
  const clauses = [
    "sop_requests.owner_sub_role_id = ?",
    "sop_requests.assigned_department = ?",
    "sop_requests.assigned_team_id = ?",
  ];
  const values: unknown[] = [subRole.id, subRole.department, subRole.teamId || ""];
  if (selectedUser?.email) {
    clauses.push("lower(sop_requests.submitted_by_email) = lower(?)");
    values.push(selectedUser.email);
  }

  const result = await db
    .prepare(
      `SELECT
        sop_requests.id,
        sop_requests.requested_title AS title,
        sop_requests.department_name AS departmentName,
        sop_requests.submitted_by_email AS submittedByEmail,
        sop_requests.priority,
        sop_requests.status,
        sop_requests.desired_completion_at AS desiredCompletionAt,
        sop_requests.category_name AS category,
        sop_requests.assigned_department AS assignedDepartment,
        assignee.name AS assignedToName,
        sop_requests.created_at AS createdAt,
        sop_requests.updated_at AS updatedAt
       FROM sop_requests
       LEFT JOIN users assignee ON assignee.id = sop_requests.assigned_to
       WHERE ${clauses.map((clause) => `(${clause})`).join(" OR ")}
       ORDER BY sop_requests.updated_at DESC
       LIMIT 100`,
    )
    .bind(...values)
    .all<Record<string, unknown>>();

  return (result.results || []).map(normalizeRequest);
}

async function queryDraftSops(db: D1DatabaseBinding, subRole: CreatorSubRole, selectedUser: WorkUser | null) {
  const scope = scopeClause("sops", subRole);
  const userClause = selectedUser?.id ? "AND (COALESCE(sops.owner_id, sops.owner_user_id) = ? OR sops.created_by_user_id = ? OR ? = '')" : "";
  const values = selectedUser?.id ? [...scope.values, selectedUser.id, selectedUser.id, selectedUser.id] : scope.values;

  const result = await db
    .prepare(
      `SELECT
        sops.id,
        sops.title,
        sops.slug,
        sops.status,
        sops.review_date AS reviewDate,
        sops.review_due_at AS reviewDueAt,
        sops.updated_at AS updatedAt,
        categories.name AS category,
        owner.name AS owner,
        sub_roles.label AS ownerSubRole,
        sub_roles.department AS ownerDepartment,
        sops.owner_sub_role_id AS ownerSubRoleId
       FROM sops
       LEFT JOIN categories ON categories.id = sops.category_id
       LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
       LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id
       WHERE ${scope.sql}
        AND COALESCE(sops.is_active, 1) = 1
        AND sops.status IN ('Draft', 'Needs Revision', 'In Review', 'Approved')
        ${userClause}
       ORDER BY sops.updated_at DESC
       LIMIT 100`,
    )
    .bind(...values)
    .all<Record<string, unknown>>();

  return (result.results || []).map(normalizeSop);
}

async function queryOwnedSops(db: D1DatabaseBinding, subRole: CreatorSubRole) {
  const scope = scopeClause("sops", subRole);
  const result = await db
    .prepare(
      `SELECT
        sops.id,
        sops.title,
        sops.slug,
        sops.status,
        sops.review_date AS reviewDate,
        sops.review_due_at AS reviewDueAt,
        sops.updated_at AS updatedAt,
        categories.name AS category,
        owner.name AS owner,
        sub_roles.label AS ownerSubRole,
        sub_roles.department AS ownerDepartment,
        sops.owner_sub_role_id AS ownerSubRoleId
       FROM sops
       LEFT JOIN categories ON categories.id = sops.category_id
       LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
       LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id
       WHERE ${scope.sql}
        AND COALESCE(sops.is_active, 1) = 1
       ORDER BY sops.updated_at DESC
       LIMIT 100`,
    )
    .bind(...scope.values)
    .all<Record<string, unknown>>();
  return (result.results || []).map(normalizeSop);
}

async function queryAssignments(db: D1DatabaseBinding, subRole: CreatorSubRole, selectedUser: WorkUser | null) {
  const clauses = ["sop_assignments.team_id = ?"];
  const values: unknown[] = [subRole.teamId || ""];
  if (selectedUser?.id) {
    clauses.push("sop_assignments.user_id = ?");
    values.push(selectedUser.id);
  }

  const result = await db
    .prepare(
      `SELECT
        sop_assignments.id,
        sop_assignments.assignment_type AS assignmentType,
        sop_assignments.due_at AS dueAt,
        sops.id AS sopId,
        sops.id,
        sops.title,
        sops.slug,
        sops.status,
        sops.review_date AS reviewDate,
        sops.review_due_at AS reviewDueAt,
        sops.updated_at AS updatedAt,
        categories.name AS category,
        COALESCE(assigned.name, owner.name) AS owner,
        sub_roles.label AS ownerSubRole,
        sub_roles.department AS ownerDepartment,
        sops.owner_sub_role_id AS ownerSubRoleId
       FROM sop_assignments
       JOIN sops ON sops.id = sop_assignments.sop_id
       LEFT JOIN categories ON categories.id = sops.category_id
       LEFT JOIN users assigned ON assigned.id = sop_assignments.user_id
       LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
       LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id
       WHERE sop_assignments.status = 'Active'
        AND (${clauses.join(" OR ")})
       ORDER BY sop_assignments.due_at ASC, sops.updated_at DESC
       LIMIT 100`,
    )
    .bind(...values)
    .all<Record<string, unknown>>();

  return (result.results || []).map(normalizeSop);
}

async function queryReviewItems(db: D1DatabaseBinding, subRole: CreatorSubRole, selectedUser: WorkUser | null) {
  const requestClauses = [
    "sop_requests.owner_sub_role_id = ?",
    "sop_requests.assigned_department = ?",
    "sop_requests.assigned_team_id = ?",
  ];
  const requestValues: unknown[] = [subRole.id, subRole.department, subRole.teamId || ""];
  if (selectedUser?.id) {
    requestClauses.push("sop_requests.assigned_to = ?");
    requestValues.push(selectedUser.id);
  }

  const reviewClauses = ["sop_assignments.team_id = ?"];
  const reviewValues: unknown[] = [subRole.teamId || ""];
  if (selectedUser?.id) {
    reviewClauses.push("sop_assignments.user_id = ?");
    reviewValues.push(selectedUser.id);
  }

  const [requestReviews, assignmentReviews] = await Promise.all([
    db
      .prepare(
        `SELECT
          sop_requests.id,
          sop_requests.requested_title AS title,
          sop_requests.priority,
          sop_requests.status,
          sop_requests.desired_completion_at AS desiredCompletionAt,
          sop_requests.assigned_department AS assignedDepartment,
          assignee.name AS assignedToName,
          sop_requests.created_at AS createdAt,
          sop_requests.updated_at AS updatedAt
         FROM sop_requests
         LEFT JOIN users assignee ON assignee.id = sop_requests.assigned_to
         WHERE sop_requests.status IN (
          'Submitted', 'Under Review', 'Needs More Information', 'Accepted', 'Assigned', 'In Progress', 'Draft Created', 'In Approval'
         )
          AND (${requestClauses.join(" OR ")})
         ORDER BY sop_requests.updated_at DESC
         LIMIT 100`,
      )
      .bind(...requestValues)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT
          sop_assignments.id,
          sop_assignments.assignment_type AS assignmentType,
          sop_assignments.due_at AS dueDate,
          sops.id AS sopId,
          sops.title AS title,
          sops.status,
          sops.review_date AS reviewDate,
          COALESCE(assigned.name, owner.name) AS reviewer
         FROM sop_assignments
         JOIN sops ON sops.id = sop_assignments.sop_id
         LEFT JOIN users assigned ON assigned.id = sop_assignments.user_id
         LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
         WHERE sop_assignments.status = 'Active'
          AND sop_assignments.assignment_type IN ('Reviewer', 'Approver', 'Publisher')
          AND (${reviewClauses.join(" OR ")})
         ORDER BY sop_assignments.due_at ASC, sops.updated_at DESC
         LIMIT 100`,
      )
      .bind(...reviewValues)
      .all<Record<string, unknown>>(),
  ]);

  return [
    ...(requestReviews.results || []).map(normalizeRequest),
    ...(assignmentReviews.results || []).map(normalizeReview),
  ];
}

function uniqueById<T extends { id?: unknown }>(items: T[]) {
  const map = new Map<string, T>();
  items.forEach((item) => {
    const id = String(item.id || "");
    if (id && !map.has(id)) map.set(id, item);
  });
  return Array.from(map.values());
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const db = context.env.DB!;
  await ensureRequestWorkflowSchema(db);

  const resolved = await resolveWorkContext(db, context);
  if (resolved.response || !resolved.subRole) return resolved.response;

  const url = new URL(context.request.url);
  const requestedUserId = optionalText(url.searchParams.get("userId"), 160);
  const users = await usersForSubRole(db, resolved.subRole);
  const selectedUser =
    users.find((user) => user.id === requestedUserId) ||
    users.find((user) => user.id === resolved.user?.id) ||
    users[0] ||
    null;

  const [submittedRequests, draftSops, ownedSops, assignedItems, reviewItems] = await Promise.all([
    querySubmittedRequests(db, resolved.subRole, selectedUser),
    queryDraftSops(db, resolved.subRole, selectedUser),
    queryOwnedSops(db, resolved.subRole),
    queryAssignments(db, resolved.subRole, selectedUser),
    queryReviewItems(db, resolved.subRole, selectedUser),
  ]);

  const today = isoToday();
  const activeReviewItems = uniqueById(reviewItems);
  const assigned = uniqueById([...assignedItems, ...draftSops.filter((sop) => sop.status !== "Published")]);
  const overdueReviews = uniqueById([
    ...ownedSops.filter((sop) => sop.reviewDate && sop.reviewDate < today && sop.status !== "Archived"),
    ...assigned.filter((item) => item.reviewDate && item.reviewDate < today),
    ...activeReviewItems.filter((item) => item.reviewDate && item.reviewDate < today),
  ]);

  return success({
    context: {
      role: resolved.user?.role || "creator",
      accessLevel: selectedUser?.accessLevel || resolved.user?.accessLevel || "Creator / Reviewer",
      selectedUser,
      selectedSubRole: resolved.subRole,
    },
    viewOptions: {
      users,
      subRoles: [resolved.subRole],
    },
    counts: {
      submittedRequests: submittedRequests.length,
      draftSops: draftSops.length,
      assignedToMe: assigned.length,
      needMyReview: activeReviewItems.length,
      overdueReviews: overdueReviews.length,
    },
    sections: {
      submittedRequests,
      draftSops,
      assignedItems: assigned,
      ownedSops,
      reviewItems: activeReviewItems,
      overdueReviews,
    },
  });
};
