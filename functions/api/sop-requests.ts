import {
  failure,
  isEmail,
  optionalText,
  readBody,
  roleFromRequest,
  success,
  unixFromDate,
  unixNow,
} from "../_shared/api";
import { requireDb } from "../_shared/admin";
import { requirePermission } from "../_shared/auth";
import { newId, type PagesFunctionContext } from "../_shared/cloudflare";

interface SopRequestPayload {
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
  draftContent?: string;
  relatedLinks?: string[] | string;
  documentationLocation?: string;
  status?: string;
  assignedTo?: string;
}

const requestTypes = new Set([
  "Request a new SOP",
  "Suggest an update",
  "Submit a department process",
  "Share a draft SOP for review",
  "Submit a draft SOP",
  "Suggest an update to an existing SOP",
]);

const priorities = new Set(["Low", "Medium", "High", "Urgent"]);
const statuses = new Set(["new", "triage", "assigned", "drafting", "in_review", "needs_revision", "approved", "published", "archived"]);

function normalizeLinks(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join("\n");
  return optionalText(value, 2000);
}

function selectRequests() {
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
    sop_requests.draft_content AS draftContent,
    sop_requests.related_links AS relatedLinks,
    sop_requests.documentation_location AS documentationLocation,
    sop_requests.status,
    sop_requests.assigned_to AS assignedTo,
    assignee.name AS assignedToName,
    sop_requests.created_at AS createdAt,
    sop_requests.updated_at AS updatedAt
  FROM sop_requests
  LEFT JOIN sops ON sops.id = sop_requests.existing_sop_id
  LEFT JOIN users assignee ON assignee.id = sop_requests.assigned_to`;
}

export const onRequestGet = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission({ request, env }, "Submit Requests");
  if (auth.response) return auth.response;

  const role = auth.user?.role || roleFromRequest(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const where: string[] = [];
  const values: unknown[] = [];

  if (role === "normal") {
    const email = auth.user?.email || url.searchParams.get("email");
    if (!email) return failure("FORBIDDEN", "Normal users must filter requests by email.", 403);
    where.push("sop_requests.submitted_by_email = ?");
    values.push(email);
  }

  if (status) {
    where.push("sop_requests.status = ?");
    values.push(status);
  }

  const result = await env.DB!.prepare(
    `${selectRequests()}
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY sop_requests.created_at DESC
     LIMIT 100`,
  )
    .bind(...values)
    .all();

  const requests = result.results || [];
  return success({ requests });
};

export const onRequestPost = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission({ request, env }, "Submit Requests");
  if (auth.response) return auth.response;

  const [payload, parseError] = await readBody<SopRequestPayload>(request);
  if (parseError) return parseError;

  const fields: Record<string, string> = {};
  const requestType = optionalText(payload?.requestType || "Request a new SOP", 120);
  const requestedTitle = optionalText(payload?.requestedTitle, 180);
  const departmentName = optionalText(payload?.departmentName, 160);
  const submittedByName = optionalText(payload?.submittedByName, 160);
  const submittedByEmail = optionalText(payload?.submittedByEmail, 180);
  const description = optionalText(payload?.description, 6000);

  if (!requestTypes.has(requestType)) fields.requestType = "Choose a valid submission type.";
  if (!requestedTitle) fields.requestedTitle = "Requested title is required.";
  if (!departmentName) fields.departmentName = "Department name is required.";
  if (!submittedByName) fields.submittedByName = "Submitted by is required.";
  if (!submittedByEmail || !isEmail(submittedByEmail)) fields.submittedByEmail = "Enter a valid email.";
  if (!description) fields.description = "Description is required.";
  if (Object.keys(fields).length) {
    return failure("VALIDATION_ERROR", "Please correct the highlighted fields.", 400, fields);
  }

  const now = unixNow();
  const id = newId("sop-request");
  const priority = priorities.has(String(payload?.priority)) ? String(payload?.priority) : "Medium";

  await env.DB!.prepare(
    `INSERT INTO sop_requests (
      id, request_type, requested_title, department_name, submitted_by_name,
      submitted_by_email, role_title, description, priority, desired_completion_at,
      existing_sop_id, draft_content, related_links, documentation_location,
      status, assigned_to, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      optionalText(payload?.draftContent, 20000),
      normalizeLinks(payload?.relatedLinks),
      optionalText(payload?.documentationLocation, 1000),
      "new",
      payload?.assignedTo || null,
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
      "create",
      "sop_request",
      id,
      JSON.stringify({ requestType, submittedByEmail }),
      now,
    )
    .run();

  const saved = await env.DB!.prepare(`${selectRequests()} WHERE sop_requests.id = ?`).bind(id).first();
  return success({ request: saved, trackingUrl: `/my-work/?request=${encodeURIComponent(id)}` }, "SOP request submitted.", 201);
};

export const onRequestPut = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission({ request, env }, "Review SOPs");
  if (auth.response) return auth.response;

  const [payload, parseError] = await readBody<SopRequestPayload & { id?: string }>(request);
  if (parseError) return parseError;

  const id = optionalText(payload?.id, 120);
  if (!id) return failure("VALIDATION_ERROR", "Request id is required.", 400, { id: "Required" });

  const status = statuses.has(String(payload?.status)) ? String(payload?.status) : "triage";
  const priority = priorities.has(String(payload?.priority)) ? String(payload?.priority) : "Medium";
  const now = unixNow();

  await env.DB!.prepare(
    `UPDATE sop_requests
     SET status = ?, priority = ?, assigned_to = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(status, priority, payload?.assignedTo || null, now, id)
    .run();

  const saved = await env.DB!.prepare(`${selectRequests()} WHERE sop_requests.id = ?`).bind(id).first();
  return success({ request: saved }, "SOP request updated.");
};
