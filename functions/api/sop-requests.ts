import {
  failure,
  isEmail,
  optionalText,
  readBody,
  success,
  unixFromDate,
  unixNow,
} from "../_shared/api";
import { requireDb, slugify } from "../_shared/admin";
import { getAuthUser, requirePermission } from "../_shared/auth";
import { newId, type D1DatabaseBinding, type PagesFunctionContext } from "../_shared/cloudflare";

interface SopRequestPayload {
  id?: string;
  action?: string;
  requestType?: string;
  requestedTitle?: string;
  departmentName?: string;
  submittedByName?: string;
  submittedByEmail?: string;
  roleTitle?: string;
  description?: string;
  priority?: string;
  desiredCompletionAt?: string;
  existingSopId?: string;
  relatedSopId?: string;
  draftSopId?: string;
  draftContent?: string;
  relatedLinks?: string[] | string;
  documentationLocation?: string;
  status?: string;
  assignedTo?: string;
  assignedDepartment?: string;
  reviewerNotes?: string;
  denialReason?: string;
  requestNotes?: string;
  category?: string;
  categoryId?: string;
  toolOrSystem?: string;
  audience?: string;
  bestContactMethod?: string;
  frequency?: string;
  requestedSopType?: string;
}

const requestTypes = new Set([
  "Request a new SOP",
  "Suggest an update",
  "Suggest an update to an existing SOP",
  "Submit a department process",
  "Share a draft SOP for review",
  "Submit a draft SOP",
  "Request a template",
]);

const priorities = new Set(["Low", "Medium", "High", "Urgent"]);
const statuses = new Set([
  "Submitted",
  "Under Review",
  "Needs More Information",
  "Accepted",
  "Declined",
  "Assigned",
  "In Progress",
  "Draft Created",
  "In Approval",
  "Approved",
  "Published",
  "Closed",
]);

const legacyStatusMap: Record<string, string> = {
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

const departmentRouting = [
  {
    department: "Instructional Technology",
    subRoleId: "subrole-instructional-technology-specialist",
    teamId: "team-instructional-technology-specialists",
    terms: ["technology", "tech", "ivanti", "ticket", "d2l", "brightspace", "access", "system", "software"],
  },
  {
    department: "Instructional Design",
    subRoleId: "subrole-instructional-designer",
    teamId: "team-instructional-designers",
    terms: ["instructional design", "design", "course build", "template", "curriculum", "content"],
  },
  {
    department: "Project Management",
    subRoleId: "subrole-project-manager",
    teamId: "team-project-managers",
    terms: ["project", "pmo", "monday", "timeline", "planning"],
  },
  {
    department: "Quality Assurance",
    subRoleId: "subrole-quality-assurance-specialist",
    teamId: "team-quality-assurance-specialists",
    terms: ["quality", "qa", "review", "approval", "checklist", "copyedit"],
  },
  {
    department: "Multimedia",
    subRoleId: "subrole-multimedia",
    teamId: "team-multimedia",
    terms: ["multimedia", "media", "video", "kaltura", "image", "audio", "interactive"],
  },
];

const managedColumns: Record<string, string> = {
  category_id: "TEXT",
  category_name: "TEXT",
  tool_system: "TEXT",
  audience: "TEXT",
  best_contact_method: "TEXT",
  frequency: "TEXT",
  requested_sop_type: "TEXT",
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

function normalizeLinks(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join("\n");
  return optionalText(value, 4000);
}

function normalizeStatus(value: unknown) {
  const raw = String(value || "").trim();
  if (statuses.has(raw)) return raw;
  return legacyStatusMap[raw.toLowerCase()] || "Submitted";
}

function nowStamp() {
  return unixNow();
}

function textIncludesAny(text: string, terms: string[]) {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

async function ensureRequestWorkflowSchema(db: D1DatabaseBinding) {
  const info = await db.prepare("PRAGMA table_info(sop_requests)").all<{ name: string }>();
  const existing = new Set((info.results || []).map((row) => row.name));
  for (const [column, type] of Object.entries(managedColumns)) {
    if (!existing.has(column)) {
      await db.prepare(`ALTER TABLE sop_requests ADD COLUMN ${column} ${type}`).run();
    }
  }
}

async function resolveCategory(db: D1DatabaseBinding, payload: SopRequestPayload) {
  const categoryId = optionalText(payload.categoryId, 160);
  const categoryName = optionalText(payload.category, 180);
  if (!categoryId && !categoryName) return { id: null, name: null, slug: null };

  const row = await db
    .prepare(
      `SELECT id, name, slug
       FROM categories
       WHERE id = ? OR slug = ? OR lower(name) = lower(?)
       LIMIT 1`,
    )
    .bind(categoryId, categoryName, categoryName)
    .first<{ id: string; name: string; slug: string }>();

  return {
    id: row?.id || categoryId || null,
    name: row?.name || categoryName || null,
    slug: row?.slug || null,
  };
}

async function findAssigneeForRoute(db: D1DatabaseBinding, route: (typeof departmentRouting)[number]) {
  const row = await db
    .prepare(
      `SELECT users.id, users.name
       FROM users
       LEFT JOIN user_creator_sub_roles user_sub_roles ON user_sub_roles.user_id = users.id
       WHERE users.status = 'Active'
        AND COALESCE(users.is_active, 1) = 1
        AND (
          users.department = ?
          OR users.team_id = ?
          OR user_sub_roles.sub_role_id = ?
        )
       ORDER BY users.name ASC
       LIMIT 1`,
    )
    .bind(route.department, route.teamId, route.subRoleId)
    .first<{ id: string; name: string }>()
    .catch(() => null);
  return row || null;
}

async function routeRequest(db: D1DatabaseBinding, payload: SopRequestPayload, categoryName: string | null) {
  const haystack = [
    payload.requestType,
    payload.departmentName,
    payload.requestedTitle,
    payload.description,
    payload.toolOrSystem,
    payload.requestedSopType,
    categoryName,
  ]
    .filter(Boolean)
    .join(" ");
  const route = departmentRouting.find((candidate) => textIncludesAny(haystack, candidate.terms)) || departmentRouting[0];
  const assignee = await findAssigneeForRoute(db, route);
  return {
    ...route,
    assignedTo: optionalText(payload.assignedTo, 120) || assignee?.id || null,
    assignedToName: assignee?.name || "",
    routingReason: `Matched ${route.department} from request type, department, category, tool, or keywords.`,
  };
}

function selectRequests(where = "") {
  return `SELECT
    sop_requests.id,
    sop_requests.request_type AS requestType,
    sop_requests.requested_title AS requestedTitle,
    sop_requests.department_name AS departmentName,
    sop_requests.submitted_by_name AS submittedByName,
    sop_requests.submitted_by_email AS submittedByEmail,
    sop_requests.role_title AS roleTitle,
    sop_requests.description,
    sop_requests.priority,
    sop_requests.desired_completion_at AS desiredCompletionAt,
    sop_requests.existing_sop_id AS existingSopId,
    sops.title AS existingSopTitle,
    sop_requests.related_sop_id AS relatedSopId,
    related_sops.title AS relatedSopTitle,
    sop_requests.draft_sop_id AS draftSopId,
    draft_sops.title AS draftSopTitle,
    sop_requests.draft_content AS draftContent,
    sop_requests.related_links AS relatedLinks,
    sop_requests.documentation_location AS documentationLocation,
    sop_requests.category_id AS categoryId,
    sop_requests.category_name AS category,
    sop_requests.tool_system AS toolOrSystem,
    sop_requests.audience,
    sop_requests.best_contact_method AS bestContactMethod,
    sop_requests.frequency,
    sop_requests.requested_sop_type AS requestedSopType,
    sop_requests.status,
    sop_requests.assigned_to AS assignedTo,
    assignee.name AS assignedToName,
    sop_requests.assigned_department AS assignedDepartment,
    sop_requests.assigned_team_id AS assignedTeamId,
    sop_requests.owner_sub_role_id AS ownerSubRoleId,
    sub_roles.label AS ownerSubRole,
    sop_requests.reviewer_notes AS reviewerNotes,
    sop_requests.denial_reason AS denialReason,
    sop_requests.request_notes AS requestNotes,
    sop_requests.routing_reason AS routingReason,
    sop_requests.submitted_at AS submittedAt,
    sop_requests.reviewed_at AS reviewedAt,
    sop_requests.assigned_at AS assignedAt,
    sop_requests.accepted_at AS acceptedAt,
    sop_requests.declined_at AS declinedAt,
    sop_requests.approved_at AS approvedAt,
    sop_requests.published_at AS publishedAt,
    sop_requests.closed_at AS closedAt,
    sop_requests.created_at AS createdAt,
    sop_requests.updated_at AS updatedAt
  FROM sop_requests
  LEFT JOIN sops ON sops.id = sop_requests.existing_sop_id
  LEFT JOIN sops related_sops ON related_sops.id = sop_requests.related_sop_id
  LEFT JOIN sops draft_sops ON draft_sops.id = sop_requests.draft_sop_id
  LEFT JOIN users assignee ON assignee.id = sop_requests.assigned_to
  LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sop_requests.owner_sub_role_id
  ${where}`;
}

function responseMessage(action: string) {
  switch (action) {
    case "accept":
      return "SOP request accepted.";
    case "decline":
      return "SOP request declined.";
    case "assign":
      return "SOP request assigned.";
    case "more-info":
      return "SOP request marked as needing more information.";
    case "convert":
      return "SOP request converted into a draft.";
    case "link":
      return "SOP request linked to an SOP.";
    case "approve":
      return "SOP request approved.";
    case "publish":
      return "SOP request published.";
    case "close":
      return "SOP request closed.";
    default:
      return "SOP request updated.";
  }
}

export const onRequestGet = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  await ensureRequestWorkflowSchema(env.DB!);

  const user = await getAuthUser({ request, env });
  const url = new URL(request.url);
  const email = optionalText(url.searchParams.get("email"), 180);
  const status = optionalText(url.searchParams.get("status"), 80);
  const assignedTo = optionalText(url.searchParams.get("assignedTo"), 120);
  const assignedDepartment = optionalText(url.searchParams.get("assignedDepartment"), 160);
  const category = optionalText(url.searchParams.get("category"), 180);
  const role = user?.role || "normal";

  if (role === "normal" && !email && !user?.email) {
    return failure("FORBIDDEN", "Normal users must filter requests by email.", 403);
  }

  if (!user && !email) {
    return failure("UNAUTHENTICATED", "Sign in or provide the submitter email to view requests.", 401);
  }

  const where: string[] = [];
  const values: unknown[] = [];

  if (role === "normal" || email) {
    where.push("lower(sop_requests.submitted_by_email) = lower(?)");
    values.push(email || user?.email);
  }

  if (status) {
    where.push("sop_requests.status = ?");
    values.push(status);
  }

  if (assignedTo && role !== "normal") {
    where.push("(sop_requests.assigned_to = ? OR assignee.name = ?)");
    values.push(assignedTo, assignedTo);
  }

  if (assignedDepartment && role !== "normal") {
    where.push("sop_requests.assigned_department = ?");
    values.push(assignedDepartment);
  }

  if (category) {
    where.push("(sop_requests.category_id = ? OR sop_requests.category_name = ?)");
    values.push(category, category);
  }

  const result = await env.DB!.prepare(
    `${selectRequests(where.length ? `WHERE ${where.join(" AND ")}` : "")}
     ORDER BY sop_requests.created_at DESC
     LIMIT 250`,
  )
    .bind(...values)
    .all();

  return success({ requests: result.results || [] });
};

export const onRequestPost = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  await ensureRequestWorkflowSchema(env.DB!);

  const [payload, parseError] = await readBody<SopRequestPayload>(request);
  if (parseError) return parseError;

  const fields: Record<string, string> = {};
  const requestType = optionalText(payload?.requestType || "Request a new SOP", 120);
  const requestedTitle = optionalText(payload?.requestedTitle, 180);
  const departmentName = optionalText(payload?.departmentName, 160);
  const submittedByName = optionalText(payload?.submittedByName, 160);
  const submittedByEmail = optionalText(payload?.submittedByEmail, 180);
  const description = optionalText(payload?.description, 8000);
  const category = await resolveCategory(env.DB!, payload || {});
  const route = await routeRequest(env.DB!, payload || {}, category.name);

  if (!requestTypes.has(requestType)) fields.requestType = "Choose a valid submission type.";
  if (!requestedTitle) fields.requestedTitle = "Requested title is required.";
  if (!departmentName) fields.departmentName = "Department name is required.";
  if (!submittedByName) fields.submittedByName = "Submitted by is required.";
  if (!submittedByEmail || !isEmail(submittedByEmail)) fields.submittedByEmail = "Enter a valid email.";
  if (!description) fields.description = "Description is required.";
  if (Object.keys(fields).length) {
    return failure("VALIDATION_ERROR", "Please correct the highlighted fields.", 400, fields);
  }

  const now = nowStamp();
  const id = newId("sop-request");
  const priority = priorities.has(String(payload?.priority)) ? String(payload?.priority) : "Medium";

  await env.DB!.prepare(
    `INSERT INTO sop_requests (
      id, request_type, requested_title, department_name, submitted_by_name,
      submitted_by_email, role_title, description, priority, desired_completion_at,
      existing_sop_id, draft_content, related_links, documentation_location,
      category_id, category_name, tool_system, audience, best_contact_method, frequency,
      requested_sop_type, status, assigned_to, assigned_department, assigned_team_id,
      owner_sub_role_id, reviewer_notes, denial_reason, request_notes, routing_reason,
      submitted_at, assigned_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      requestType,
      requestedTitle,
      departmentName,
      submittedByName,
      submittedByEmail,
      optionalText(payload?.roleTitle, 160),
      description,
      priority,
      unixFromDate(payload?.desiredCompletionAt),
      payload?.existingSopId || null,
      optionalText(payload?.draftContent, 30000),
      normalizeLinks(payload?.relatedLinks),
      optionalText(payload?.documentationLocation, 1000),
      category.id,
      category.name,
      optionalText(payload?.toolOrSystem, 240),
      optionalText(payload?.audience, 500),
      optionalText(payload?.bestContactMethod, 240),
      optionalText(payload?.frequency, 120),
      optionalText(payload?.requestedSopType, 120) || (requestType.includes("template") ? "Template" : "Process"),
      route.assignedTo ? "Assigned" : "Submitted",
      route.assignedTo,
      route.department,
      route.teamId,
      route.subRoleId,
      "",
      "",
      optionalText(payload?.requestNotes, 3000),
      route.routingReason,
      now,
      route.assignedTo ? now : null,
      now,
      now,
    )
    .run();

  await env.DB!.prepare(
    `INSERT INTO audit_logs (id, action, entity_type, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      newId("audit"),
      "submit_request",
      "sop_request",
      id,
      JSON.stringify({ requestType, submittedByEmail, assignedDepartment: route.department }),
      now,
    )
    .run();

  const saved = await env.DB!.prepare(`${selectRequests("WHERE sop_requests.id = ?")}`).bind(id).first();
  return success({ request: saved, trackingUrl: `/my-work/?request=${encodeURIComponent(id)}` }, "SOP request submitted.", 201);
};

export const onRequestPut = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  await ensureRequestWorkflowSchema(env.DB!);
  const auth = await requirePermission({ request, env }, "Review SOPs");
  if (auth.response) return auth.response;

  const [payload, parseError] = await readBody<SopRequestPayload>(request);
  if (parseError) return parseError;
  const id = optionalText(payload?.id, 120);
  if (!id) return failure("VALIDATION_ERROR", "Request id is required.", 400, { id: "Required" });

  const action = optionalText(payload?.action, 80) || "update";
  const result = await updateSopRequest(env.DB!, id, payload || {}, action, auth.user?.id || null);
  return result;
};

async function createDraftFromRequest(db: D1DatabaseBinding, requestId: string, actorId: string | null) {
  const request = await db.prepare(`${selectRequests("WHERE sop_requests.id = ?")}`).bind(requestId).first<Record<string, unknown>>();
  if (!request) throw new Error("Request not found.");
  if (request.draftSopId) return String(request.draftSopId);

  const now = new Date().toISOString();
  const nowUnix = nowStamp();
  const sopId = newId("sop");
  const versionId = newId("version");
  const title = String(request.requestedTitle || "Untitled SOP Request");
  const slug = slugify(title, sopId);
  const content = String(request.draftContent || request.description || title);
  const metadata = JSON.stringify({
    audience: String(request.audience || "")
      .split(/[\n,|]/)
      .map((item) => item.trim())
      .filter(Boolean),
    tools: String(request.toolOrSystem || "")
      .split(/[\n,|]/)
      .map((item) => item.trim())
      .filter(Boolean),
    sourceRequestId: requestId,
  });

  await db
    .prepare(
      `INSERT INTO sops (
        id, title, slug, summary, purpose, category_id, owner_id, owner_user_id,
        owner_team_id, owner_sub_role_id, status, type, current_version_id,
        audience, is_active, created_by_user_id, source_type, visibility, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    )
    .bind(
      sopId,
      title,
      slug,
      String(request.description || "").slice(0, 1000),
      String(request.description || ""),
      request.categoryId || null,
      request.assignedTo || actorId,
      request.assignedTo || actorId,
      request.assignedTeamId || null,
      request.ownerSubRoleId || null,
      "Draft",
      request.requestedSopType || "Process",
      versionId,
      request.audience || "",
      actorId,
      "Database",
      "Internal",
      now,
      now,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO sop_versions (
        id, sop_id, version_label, version_number, title, summary, purpose,
        body_markdown, content, metadata_json, change_summary, status,
        created_by_user_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      versionId,
      sopId,
      "0.1",
      "0.1",
      title,
      String(request.description || "").slice(0, 1000),
      String(request.description || ""),
      content,
      content,
      metadata,
      `Draft created from SOP request ${requestId}.`,
      "Draft",
      actorId,
      actorId,
      now,
      nowUnix,
    )
    .run();

  return sopId;
}

async function updateSopRequest(
  db: D1DatabaseBinding,
  id: string,
  payload: SopRequestPayload,
  action: string,
  actorId: string | null,
) {
  const existing = await db.prepare(`${selectRequests("WHERE sop_requests.id = ?")}`).bind(id).first<Record<string, unknown>>();
  if (!existing) return failure("NOT_FOUND", "SOP request not found.", 404);

  const now = nowStamp();
  let status = normalizeStatus(payload.status || existing.status);
  let draftSopId = optionalText(payload.draftSopId, 120) || String(existing.draftSopId || "") || null;
  let relatedSopId =
    optionalText(payload.relatedSopId || payload.existingSopId, 120) ||
    String(existing.relatedSopId || existing.existingSopId || "") ||
    null;

  if (action === "accept") status = "Accepted";
  if (action === "decline") status = "Declined";
  if (action === "assign") status = "Assigned";
  if (action === "more-info") status = "Needs More Information";
  if (action === "convert") {
    draftSopId = await createDraftFromRequest(db, id, actorId);
    status = "Draft Created";
  }
  if (action === "link" && relatedSopId) status = "In Progress";
  if (action === "approve") status = "Approved";
  if (action === "publish") status = "Published";
  if (action === "close") status = "Closed";

  const assignedTo = optionalText(payload.assignedTo, 120) || String(existing.assignedTo || "") || null;
  const assignedDepartment = optionalText(payload.assignedDepartment, 160) || String(existing.assignedDepartment || "") || null;
  const priority = priorities.has(String(payload.priority)) ? String(payload.priority) : String(existing.priority || "Medium");

  await db
    .prepare(
      `UPDATE sop_requests
       SET status = ?,
        priority = ?,
        assigned_to = ?,
        assigned_department = ?,
        reviewer_notes = ?,
        denial_reason = ?,
        request_notes = ?,
        draft_sop_id = ?,
        related_sop_id = ?,
        reviewed_at = COALESCE(reviewed_at, ?),
        assigned_at = CASE WHEN ? = 'Assigned' THEN COALESCE(assigned_at, ?) ELSE assigned_at END,
        accepted_at = CASE WHEN ? = 'Accepted' THEN COALESCE(accepted_at, ?) ELSE accepted_at END,
        declined_at = CASE WHEN ? = 'Declined' THEN COALESCE(declined_at, ?) ELSE declined_at END,
        approved_at = CASE WHEN ? = 'Approved' THEN COALESCE(approved_at, ?) ELSE approved_at END,
        published_at = CASE WHEN ? = 'Published' THEN COALESCE(published_at, ?) ELSE published_at END,
        closed_at = CASE WHEN ? = 'Closed' THEN COALESCE(closed_at, ?) ELSE closed_at END,
        updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      status,
      priority,
      assignedTo,
      assignedDepartment,
      optionalText(payload.reviewerNotes, 6000) || existing.reviewerNotes || "",
      optionalText(payload.denialReason, 3000) || existing.denialReason || "",
      optionalText(payload.requestNotes, 6000) || existing.requestNotes || "",
      draftSopId,
      relatedSopId,
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
      id,
    )
    .run();

  if (action === "publish" && (draftSopId || relatedSopId)) {
    await db
      .prepare("UPDATE sops SET status = 'Published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?")
      .bind(new Date(now * 1000).toISOString(), new Date(now * 1000).toISOString(), draftSopId || relatedSopId)
      .run();
  }

  await db
    .prepare(
      `INSERT INTO audit_logs (id, action, entity_type, entity_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(newId("audit"), `request_${action}`, "sop_request", id, JSON.stringify({ status, actorId }), now)
    .run();

  const saved = await db.prepare(`${selectRequests("WHERE sop_requests.id = ?")}`).bind(id).first();
  return success({ request: saved }, responseMessage(action));
}
