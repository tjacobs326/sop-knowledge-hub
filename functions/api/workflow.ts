import { readJsonBody, requireDb } from "../_shared/admin";
import { jsonResponse, newId, type PagesFunctionContext } from "../_shared/cloudflare";

interface RequestPayload {
  requestType?: string;
  title?: string;
  description?: string;
  businessNeed?: string;
  department?: string;
  categoryId?: string;
  requestedSopId?: string;
  submittedByUserId?: string;
  submitterName?: string;
  submitterEmail?: string;
  assignedToUserId?: string;
  priority?: "Low" | "Medium" | "High" | "Urgent";
  status?: string;
  desiredCompletionDate?: string;
  reviewDate?: string;
}

interface ReviewPayload {
  id?: string;
  requestId?: string;
  sopId?: string;
  sopVersionId?: string;
  reviewerUserId?: string;
  assignedByUserId?: string;
  status?: string;
  priority?: "Low" | "Medium" | "High" | "Urgent";
  dueDate?: string;
  decisionNotes?: string;
}

const requestStatuses = new Set([
  "Submitted",
  "Triage",
  "Assigned",
  "Drafting",
  "In Review",
  "Needs More Information",
  "Needs Revision",
  "Approved",
  "Published",
  "Archived",
]);
const reviewStatuses = new Set(["Assigned", "In Review", "Needs Revision", "Approved", "Rejected", "Published", "Archived"]);
const priorities = new Set(["Low", "Medium", "High", "Urgent"]);

function requestSelect() {
  return `SELECT
    requests.id,
    requests.request_type AS requestType,
    requests.title,
    requests.description,
    requests.business_need AS businessNeed,
    requests.department,
    requests.category_id AS categoryId,
    categories.name AS category,
    requests.requested_sop_id AS requestedSopId,
    requests.submitted_by_user_id AS submittedByUserId,
    COALESCE(users.name, requests.submitter_name) AS submittedBy,
    requests.submitter_name AS submitterName,
    requests.submitter_email AS submitterEmail,
    requests.assigned_to_user_id AS assignedToUserId,
    assignee.name AS assignedReviewer,
    requests.priority,
    requests.status,
    requests.desired_completion_date AS desiredCompletionDate,
    requests.review_date AS reviewDate,
    requests.created_at AS createdAt,
    requests.updated_at AS updatedAt
  FROM requests
  LEFT JOIN categories ON categories.id = requests.category_id
  LEFT JOIN users ON users.id = requests.submitted_by_user_id
  LEFT JOIN users assignee ON assignee.id = requests.assigned_to_user_id`;
}

function reviewSelect() {
  return `SELECT
    reviews.id,
    reviews.sop_id AS sopId,
    sops.title AS sopTitle,
    reviews.sop_version_id AS sopVersionId,
    reviews.request_id AS requestId,
    COALESCE(requests.title, sops.title) AS title,
    reviews.reviewer_user_id AS reviewerUserId,
    reviewer.name AS assignedReviewer,
    reviews.assigned_by_user_id AS assignedByUserId,
    reviews.status,
    reviews.priority,
    reviews.due_date AS dueDate,
    reviews.completed_at AS completedAt,
    reviews.decision_notes AS decisionNotes,
    reviews.created_at AS createdAt,
    reviews.updated_at AS updatedAt
  FROM reviews
  LEFT JOIN sops ON sops.id = reviews.sop_id
  LEFT JOIN requests ON requests.id = reviews.request_id
  LEFT JOIN users reviewer ON reviewer.id = reviews.reviewer_user_id`;
}

export const onRequestGet = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const db = env.DB!;

  const url = new URL(request.url);
  const assignee = url.searchParams.get("assignedToUserId");
  const submitter = url.searchParams.get("submittedByUserId");

  const requestWhere = [
    assignee ? "requests.assigned_to_user_id = ?" : "",
    submitter ? "requests.submitted_by_user_id = ?" : "",
  ].filter(Boolean);
  const requestValues = [assignee, submitter].filter(Boolean);

  const [requestsResult, reviewsResult] = await Promise.all([
    db.prepare(
      `${requestSelect()} ${requestWhere.length ? `WHERE ${requestWhere.join(" AND ")}` : ""}
       ORDER BY requests.created_at DESC`,
    )
      .bind(...requestValues)
      .all(),
    db.prepare(`${reviewSelect()} ORDER BY reviews.due_date ASC, reviews.created_at DESC`).all(),
  ]);

  return jsonResponse({
    requests: requestsResult.results || [],
    reviews: reviewsResult.results || [],
  });
};

export const onRequestPost = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const db = env.DB!;

  const url = new URL(request.url);
  if (url.searchParams.get("type") === "review") return createReview(request, db);
  return createRequest(request, db);
};

export const onRequestPut = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const db = env.DB!;

  const url = new URL(request.url);
  if (url.searchParams.get("type") === "review") return updateReview(request, db);
  return updateRequest(request, db);
};

async function createRequest(request: Request, db: NonNullable<PagesFunctionContext["env"]["DB"]>) {
  const [payload, parseError] = await readJsonBody<RequestPayload>(request);
  if (parseError) return parseError;

  const title = String(payload?.title || "").trim();
  if (!title) return jsonResponse({ error: "Request title is required." }, 400);

  const id = newId("request");
  const priority = priorities.has(String(payload?.priority)) ? payload?.priority : "Medium";
  const status = requestStatuses.has(String(payload?.status)) ? payload?.status : "Submitted";

  await db.prepare(
    `INSERT INTO requests (
      id, request_type, title, description, business_need, department, category_id,
      requested_sop_id, submitted_by_user_id, submitter_name, submitter_email,
      assigned_to_user_id, priority, status, desired_completion_date, review_date,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  )
    .bind(
      id,
      String(payload?.requestType || "Request a new SOP"),
      title,
      String(payload?.description || ""),
      String(payload?.businessNeed || ""),
      String(payload?.department || ""),
      payload?.categoryId || null,
      payload?.requestedSopId || null,
      payload?.submittedByUserId || null,
      String(payload?.submitterName || ""),
      String(payload?.submitterEmail || ""),
      payload?.assignedToUserId || null,
      priority,
      status,
      payload?.desiredCompletionDate || null,
      payload?.reviewDate || null,
    )
    .run();

  const saved = await db.prepare(`${requestSelect()} WHERE requests.id = ?`).bind(id).first();
  return jsonResponse({ request: saved }, 201);
}

async function updateRequest(request: Request, db: NonNullable<PagesFunctionContext["env"]["DB"]>) {
  const [payload, parseError] = await readJsonBody<RequestPayload & { id?: string }>(request);
  if (parseError) return parseError;

  const id = String(payload?.id || "").trim();
  if (!id) return jsonResponse({ error: "Request id is required." }, 400);

  const status = requestStatuses.has(String(payload?.status)) ? payload?.status : "Submitted";
  const priority = priorities.has(String(payload?.priority)) ? payload?.priority : "Medium";

  await db.prepare(
    `UPDATE requests
     SET assigned_to_user_id = ?, priority = ?, status = ?, review_date = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(payload?.assignedToUserId || null, priority, status, payload?.reviewDate || null, id)
    .run();

  const saved = await db.prepare(`${requestSelect()} WHERE requests.id = ?`).bind(id).first();
  return jsonResponse({ request: saved });
}

async function createReview(request: Request, db: NonNullable<PagesFunctionContext["env"]["DB"]>) {
  const [payload, parseError] = await readJsonBody<ReviewPayload>(request);
  if (parseError) return parseError;

  const id = payload?.id || newId("review");
  const status = reviewStatuses.has(String(payload?.status)) ? payload?.status : "Assigned";
  const priority = priorities.has(String(payload?.priority)) ? payload?.priority : "Medium";

  await db.prepare(
    `INSERT INTO reviews (
      id, sop_id, sop_version_id, request_id, reviewer_user_id, assigned_by_user_id,
      status, priority, due_date, decision_notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  )
    .bind(
      id,
      payload?.sopId || null,
      payload?.sopVersionId || null,
      payload?.requestId || null,
      payload?.reviewerUserId || null,
      payload?.assignedByUserId || null,
      status,
      priority,
      payload?.dueDate || null,
      String(payload?.decisionNotes || ""),
    )
    .run();

  const saved = await db.prepare(`${reviewSelect()} WHERE reviews.id = ?`).bind(id).first();
  return jsonResponse({ review: saved }, 201);
}

async function updateReview(request: Request, db: NonNullable<PagesFunctionContext["env"]["DB"]>) {
  const [payload, parseError] = await readJsonBody<ReviewPayload>(request);
  if (parseError) return parseError;

  const id = String(payload?.id || "").trim();
  if (!id) return jsonResponse({ error: "Review id is required." }, 400);

  const status = reviewStatuses.has(String(payload?.status)) ? payload?.status : "Assigned";
  const priority = priorities.has(String(payload?.priority)) ? payload?.priority : "Medium";

  await db.prepare(
    `UPDATE reviews
     SET reviewer_user_id = ?, status = ?, priority = ?, due_date = ?, decision_notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(
      payload?.reviewerUserId || null,
      status,
      priority,
      payload?.dueDate || null,
      String(payload?.decisionNotes || ""),
      id,
    )
    .run();

  const saved = await db.prepare(`${reviewSelect()} WHERE reviews.id = ?`).bind(id).first();
  return jsonResponse({ review: saved });
}
