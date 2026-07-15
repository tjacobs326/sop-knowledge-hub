import { failure, getRouteParam, readBody, success, unixNow } from "../../../_shared/api";
import { requireDb } from "../../../_shared/admin";
import { requirePermission } from "../../../_shared/auth";
import { newId, type D1PreparedStatement, type PagesFunctionContext } from "../../../_shared/cloudflare";
import { requireSopOwnership } from "../../../_shared/ownership";

interface RestorePayload {
  notes?: string;
}

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Edit Drafts");
  if (auth.response || !auth.user) return auth.response;
  const id = getRouteParam(context, "id");
  const ownership = await requireSopOwnership(context, auth.user, id);
  if (ownership.response) return ownership.response;
  const [payload, parseError] = await readBody<RestorePayload>(context.request);
  if (parseError) return parseError;

  const sop = await context.env.DB!.prepare(
    `SELECT id, status, current_version_id AS currentVersionId, archive_previous_status AS archivePreviousStatus
     FROM sops WHERE id = ? LIMIT 1`,
  ).bind(id).first<{ id: string; status: string; currentVersionId?: string | null; archivePreviousStatus?: string | null }>();
  if (!sop) return failure("NOT_FOUND", "SOP not found.", 404);
  if (sop.status !== "Archived") return failure("WORKFLOW_CONFLICT", "Only archived SOPs can be restored as drafts.", 409);

  const now = unixNow();
  const nowIso = new Date(now * 1000).toISOString();
  const details = {
    previousStatus: "Archived",
    newStatus: "Draft",
    statusBeforeArchive: sop.archivePreviousStatus || "Unknown",
    actingUser: auth.user.name,
    activeRole: auth.user.accessLevel,
    department: ownership.subRole?.department || auth.user.selectedSubRole?.department || "",
    notes: String(payload?.notes || "Restored from Archived SOPs as a draft."),
  };
  const statements: D1PreparedStatement[] = [
    context.env.DB!.prepare(
      `UPDATE sops SET status = 'Draft', is_active = 1, archived_at = NULL,
       restored_at = ?, restored_by_user_id = ?, updated_at = ? WHERE id = ?`,
    ).bind(nowIso, auth.user.id, nowIso, id),
    context.env.DB!.prepare(
      `UPDATE sop_versions SET status = 'Draft', updated_at = ? WHERE id = ?`,
    ).bind(now, sop.currentVersionId || ""),
    context.env.DB!.prepare(
      `INSERT INTO sop_status_history (id, sop_id, version_id, previous_status, new_status, changed_by, notes, changed_at)
       VALUES (?, ?, ?, 'Archived', 'Draft', ?, ?, ?)`,
    ).bind(newId("status"), id, sop.currentVersionId || null, auth.user.id, details.notes, now),
    context.env.DB!.prepare(
      `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, before_json, after_json, details, created_at)
       VALUES (?, ?, 'restore_as_draft', 'sop', ?, ?, ?, ?, ?)`,
    ).bind(newId("audit"), auth.user.id, id, JSON.stringify({ status: "Archived" }), JSON.stringify({ status: "Draft" }), JSON.stringify(details), now),
  ];
  if (context.env.DB!.batch) await context.env.DB!.batch(statements);
  else for (const statement of statements) await statement.run();
  return success({
    sopId: id,
    previousStatus: "Archived",
    newStatus: "Draft",
    editUrl: `/create/?edit=draft&id=${encodeURIComponent(id)}&origin=my-drafts&returnTo=${encodeURIComponent("/drafts/")}`,
  }, "Archived SOP restored as a draft.");
};
