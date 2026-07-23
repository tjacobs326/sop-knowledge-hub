import { failure, getRouteParam, optionalText, readBody, success, unixNow } from "../../_shared/api";
import { requireDb } from "../../_shared/admin";
import { getAuthUser, requirePermission } from "../../_shared/auth";
import { type PagesFunctionContext } from "../../_shared/cloudflare";

interface RequestUpdatePayload {
  status?: string;
  priority?: string;
  assignedTo?: string;
}

const priorities = new Set(["Low", "Medium", "High", "Urgent"]);
const statuses = new Set(["new", "triage", "assigned", "drafting", "in_review", "needs_revision", "approved", "published", "archived"]);

function selectRequest() {
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
    sop_requests.process_steps AS processSteps,
    sop_requests.related_links AS relatedLinks,
    sop_requests.documentation_location AS documentationLocation,
    sop_requests.status,
    sop_requests.assigned_to AS assignedTo,
    assignee.name AS assignedToName,
    sop_requests.created_at AS createdAt,
    sop_requests.updated_at AS updatedAt
  FROM sop_requests
  LEFT JOIN sops ON sops.id = sop_requests.existing_sop_id
  LEFT JOIN users assignee ON assignee.id = sop_requests.assigned_to
  WHERE sop_requests.id = ?`;
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const user = await getAuthUser(context);
  if (!user) return failure("UNAUTHENTICATED", "Sign in before using this API.", 401);

  const id = getRouteParam(context, "id");
  const request = await context.env.DB!.prepare(selectRequest()).bind(id).first();
  if (!request) return failure("NOT_FOUND", "SOP request not found.", 404);
  if (
    user.role === "normal" &&
    String((request as Record<string, unknown>).submittedByEmail || "").toLowerCase() !== user.email
  ) {
    return failure("FORBIDDEN", "You can only view your own SOP requests.", 403);
  }
  return success({ request });
};

export const onRequestPut = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Review SOPs");
  if (auth.response) return auth.response;

  const id = getRouteParam(context, "id");
  const [payload, parseError] = await readBody<RequestUpdatePayload>(context.request);
  if (parseError) return parseError;

  const status = statuses.has(String(payload?.status)) ? String(payload?.status) : "triage";
  const priority = priorities.has(String(payload?.priority)) ? String(payload?.priority) : "Medium";
  const now = unixNow();

  await context.env.DB!.prepare(
    `UPDATE sop_requests
     SET status = ?, priority = ?, assigned_to = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(status, priority, optionalText(payload?.assignedTo, 120) || null, now, id)
    .run();

  const request = await context.env.DB!.prepare(selectRequest()).bind(id).first();
  return success({ request }, "SOP request updated.");
};
