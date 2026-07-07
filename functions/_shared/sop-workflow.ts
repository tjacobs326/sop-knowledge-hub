import { newId, type D1DatabaseBinding, type D1PreparedStatement } from "./cloudflare";

export type SopWorkflowAction = "submit-review" | "request-changes" | "approve" | "publish" | "archive";

const statusByAction: Record<SopWorkflowAction, string> = {
  "submit-review": "In Review",
  "request-changes": "Needs Revision",
  approve: "Approved",
  publish: "Published",
  archive: "Archived",
};

export interface SopWorkflowInput {
  sopId: string;
  versionId?: string;
  action: SopWorkflowAction;
  actorUserId?: string;
  notes?: string;
}

interface WorkflowTransitionRow {
  toStatus: string;
  createsReview: number;
  requiresNotes: number;
}

async function runStatements(db: D1DatabaseBinding, statements: D1PreparedStatement[]) {
  if (typeof db.batch === "function") {
    await db.batch(statements);
    return;
  }

  for (const statement of statements) {
    await statement.run();
  }
}

async function configuredTransition(
  db: D1DatabaseBinding,
  action: SopWorkflowAction,
  currentStatus: string,
) {
  try {
    return await db
      .prepare(
        `SELECT
          to_status AS toStatus,
          creates_review AS createsReview,
          requires_notes AS requiresNotes
         FROM sop_workflow_transitions
         WHERE action = ? AND from_status = ?
         LIMIT 1`,
      )
      .bind(action, currentStatus)
      .first<WorkflowTransitionRow>();
  } catch {
    return null;
  }
}

export async function transitionSop(db: D1DatabaseBinding, input: SopWorkflowInput) {
  const sop = await db
    .prepare("SELECT id, status, current_version_id AS currentVersionId FROM sops WHERE id = ? LIMIT 1")
    .bind(input.sopId)
    .first<{ id: string; status: string; currentVersionId?: string }>();

  if (!sop) return null;

  const configured = await configuredTransition(db, input.action, sop.status);
  const newStatus = configured?.toStatus || statusByAction[input.action];
  const versionId = input.versionId || sop.currentVersionId || null;
  const now = Math.floor(Date.now() / 1000);
  const nowIso = new Date(now * 1000).toISOString();
  const statements: D1PreparedStatement[] = [];

  if (configured?.requiresNotes && !input.notes?.trim()) {
    throw new Error("This workflow transition requires notes.");
  }

  if (input.action === "publish") {
    statements.push(
      db
        .prepare(
          `UPDATE sops
           SET status = ?, current_version_id = COALESCE(?, current_version_id), published_at = ?,
               approved_by_user_id = ?, archived_at = NULL, is_active = 1, updated_at = ?
           WHERE id = ?`,
        )
        .bind(newStatus, versionId, nowIso, input.actorUserId || null, nowIso, input.sopId),
    );
  } else if (input.action === "archive") {
    statements.push(
      db
        .prepare("UPDATE sops SET status = ?, archived_at = ?, is_active = 0, updated_at = ? WHERE id = ?")
        .bind(newStatus, nowIso, nowIso, input.sopId),
    );
  } else {
    statements.push(
      db
        .prepare(
          `UPDATE sops
           SET status = ?, current_version_id = COALESCE(?, current_version_id),
               approved_by_user_id = CASE WHEN ? = 'Approved' THEN ? ELSE approved_by_user_id END,
               updated_at = ?
           WHERE id = ?`,
        )
        .bind(newStatus, versionId, newStatus, input.actorUserId || null, nowIso, input.sopId),
    );
  }

  if (versionId) {
    statements.push(
      db
        .prepare(
          `UPDATE sop_versions
           SET status = ?,
               reviewed_by_user_id = CASE WHEN ? IN ('Needs Revision', 'Approved', 'Published') THEN ? ELSE reviewed_by_user_id END,
               approved_by_user_id = CASE WHEN ? IN ('Approved', 'Published') THEN ? ELSE approved_by_user_id END,
               reviewed_at = CASE WHEN ? IN ('Needs Revision', 'Approved', 'Published') THEN COALESCE(reviewed_at, ?) ELSE reviewed_at END,
               approved_at = CASE WHEN ? IN ('Approved', 'Published') THEN COALESCE(approved_at, ?) ELSE approved_at END,
               published_at = CASE WHEN ? = 'Published' THEN ? ELSE published_at END,
               updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          newStatus,
          newStatus,
          input.actorUserId || null,
          newStatus,
          input.actorUserId || null,
          newStatus,
          nowIso,
          newStatus,
          nowIso,
          newStatus,
          now,
          now,
          versionId,
        ),
    );
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO sop_status_history (
          id, sop_id, version_id, previous_status, new_status, changed_by, notes, changed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId("status"),
        input.sopId,
        versionId,
        sop.status,
        newStatus,
        input.actorUserId || null,
        input.notes || null,
        now,
      ),
  );

  statements.push(
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId("audit"),
        input.actorUserId || null,
        input.action,
        "sop",
        input.sopId,
        JSON.stringify({ previousStatus: sop.status, newStatus, versionId, notes: input.notes || "" }),
        now,
      ),
  );

  if (configured?.createsReview && versionId) {
    statements.push(
      db
        .prepare(
          `INSERT INTO sop_reviews (
            id, sop_id, version_id, reviewer_id, status, comments, created_at, updated_at
          ) VALUES (?, ?, ?, NULL, 'assigned', ?, ?, ?)`,
        )
        .bind(
          newId("review"),
          input.sopId,
          versionId,
          input.notes || "Submitted for review.",
          now,
          now,
        ),
    );
  }

  await runStatements(db, statements);
  return { previousStatus: sop.status, newStatus, versionId };
}
