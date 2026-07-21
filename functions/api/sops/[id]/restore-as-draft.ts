import { failure, getRouteParam, optionalText, readBody, success, unixNow } from "../../../_shared/api";
import { requireDb } from "../../../_shared/admin";
import { requirePermission } from "../../../_shared/auth";
import { newId, type D1PreparedStatement, type PagesFunctionContext } from "../../../_shared/cloudflare";
import { requireSopOwnership } from "../../../_shared/ownership";

interface RestorePayload {
  notes?: string;
}

interface ArchivedSopRow {
  id: string;
  status: string;
  currentVersionId: string | null;
  archivePreviousStatus: string | null;
}

interface StepRow {
  id: string;
}

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Edit Drafts");
  if (auth.response || !auth.user) return auth.response;
  const db = context.env.DB!;
  if (!db.batch) return failure("DATABASE_UNAVAILABLE", "Atomic D1 transactions are unavailable; the SOP was not restored.", 503);

  const id = getRouteParam(context, "id");
  const ownership = await requireSopOwnership(context, auth.user, id);
  if (ownership.response) return ownership.response;
  const [payload, parseError] = await readBody<RestorePayload>(context.request);
  if (parseError) return parseError;

  const sop = await db.prepare(
    `SELECT id, status, current_version_id AS currentVersionId, archive_previous_status AS archivePreviousStatus
     FROM sops WHERE id = ? LIMIT 1`,
  ).bind(id).first<ArchivedSopRow>();
  if (!sop) return failure("NOT_FOUND", "SOP not found.", 404);
  if (sop.status !== "Archived") return failure("WORKFLOW_CONFLICT", "Only archived SOPs can be restored as drafts.", 409);
  if (!sop.currentVersionId) return failure("WORKFLOW_CONFLICT", "The archived SOP has no version to restore.", 409);

  const [versionCount, steps] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS total FROM sop_versions WHERE sop_id = ?").bind(id).first<{ total: number }>(),
    db.prepare("SELECT id FROM procedure_steps WHERE sop_version_id = ? ORDER BY step_number").bind(sop.currentVersionId).all<StepRow>(),
  ]);
  const now = unixNow();
  const nowIso = new Date(now * 1000).toISOString();
  const versionId = newId("version");
  const versionNumber = `0.${Number(versionCount?.total || 0) + 1}`;
  const notes = optionalText(payload?.notes || "Restored from Archived SOPs as a new draft version.", 2000);
  const details = {
    previousStatus: "Archived",
    newStatus: "Draft",
    statusBeforeArchive: sop.archivePreviousStatus || "Unknown",
    sourceVersionId: sop.currentVersionId,
    draftVersionId: versionId,
    actingUser: auth.user.name,
    activeRole: auth.user.accessLevel,
    department: ownership.subRole?.department || auth.user.selectedSubRole?.department || "",
    notes,
  };
  const statements: D1PreparedStatement[] = [];

  statements.push(
    db.prepare(
      `INSERT INTO sop_versions (
        id, sop_id, version_label, version_number, title, summary, purpose, body_markdown, content,
        before_you_begin, checklist, troubleshooting, metadata_json, change_summary, status,
        created_by_user_id, created_by, created_at, updated_at
      )
      SELECT ?, versions.sop_id, ?, ?, versions.title, versions.summary, versions.purpose,
        versions.body_markdown, versions.content, versions.before_you_begin, versions.checklist,
        versions.troubleshooting, versions.metadata_json, ?, 'Draft', ?, ?, ?, ?
      FROM sop_versions versions
      JOIN sops ON sops.id = versions.sop_id
      WHERE versions.id = ? AND sops.id = ? AND sops.status = 'Archived' AND sops.current_version_id = ?`,
    ).bind(
      versionId,
      versionNumber,
      versionNumber,
      notes,
      auth.user.id,
      auth.user.id,
      nowIso,
      now,
      sop.currentVersionId,
      id,
      sop.currentVersionId,
    ),
    db.prepare(
      `INSERT INTO sop_version_media (sop_version_id, media_asset_id, relationship, sort_order, created_at)
       SELECT ?, media_asset_id, relationship, sort_order, ?
       FROM sop_version_media
       WHERE sop_version_id = ? AND EXISTS (SELECT 1 FROM sop_versions WHERE id = ?)`,
    ).bind(versionId, nowIso, sop.currentVersionId, versionId),
  );

  for (const step of steps.results || []) {
    const stepId = newId("step");
    statements.push(
      db.prepare(
        `INSERT INTO procedure_steps (id, sop_version_id, step_number, title, instructions, note, created_at, updated_at)
         SELECT ?, ?, step_number, title, instructions, note, ?, ?
         FROM procedure_steps
         WHERE id = ? AND sop_version_id = ? AND EXISTS (SELECT 1 FROM sop_versions WHERE id = ?)`,
      ).bind(stepId, versionId, nowIso, nowIso, step.id, sop.currentVersionId, versionId),
      db.prepare(
        `INSERT INTO procedure_step_media (procedure_step_id, media_asset_id, relationship, sort_order, created_at)
         SELECT ?, media_asset_id, relationship, sort_order, ?
         FROM procedure_step_media
         WHERE procedure_step_id = ? AND EXISTS (SELECT 1 FROM procedure_steps WHERE id = ?)`,
      ).bind(stepId, nowIso, step.id, stepId),
    );
  }

  statements.push(
    db.prepare(
      `INSERT INTO sop_status_history (id, sop_id, version_id, previous_status, new_status, changed_by, notes, changed_at)
       SELECT ?, ?, ?, 'Archived', 'Draft', ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM sop_versions WHERE id = ?)`,
    ).bind(newId("status"), id, versionId, auth.user.id, notes, now, versionId),
    db.prepare(
      `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, before_json, after_json, details, created_at)
       SELECT ?, ?, 'restore_as_draft', 'sop', ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM sop_versions WHERE id = ?)`,
    ).bind(
      newId("audit"),
      auth.user.id,
      id,
      JSON.stringify({ status: "Archived", currentVersionId: sop.currentVersionId }),
      JSON.stringify({ status: "Draft", currentVersionId: versionId }),
      JSON.stringify(details),
      now,
      versionId,
    ),
    db.prepare(
      `UPDATE sops SET status = 'Draft', current_version_id = ?, is_active = 1, archived_at = NULL,
       restored_at = ?, restored_by_user_id = ?, updated_at = ?
       WHERE id = ? AND status = 'Archived' AND current_version_id = ?
         AND EXISTS (SELECT 1 FROM sop_versions WHERE id = ?)`,
    ).bind(versionId, nowIso, auth.user.id, nowIso, id, sop.currentVersionId, versionId),
  );

  try {
    await db.batch(statements);
  } catch {
    return failure("RESTORE_FAILED", "The archived SOP could not be restored. No records were changed.", 500);
  }

  const restored = await db.prepare("SELECT current_version_id AS currentVersionId FROM sops WHERE id = ? AND status = 'Draft'")
    .bind(id)
    .first<{ currentVersionId: string }>();
  if (restored?.currentVersionId !== versionId) {
    return failure("WORKFLOW_CONFLICT", "The SOP was already restored or changed by another request.", 409);
  }

  return success({
    sopId: id,
    versionId,
    previousStatus: "Archived",
    newStatus: "Draft",
    editUrl: `/create/?edit=draft&id=${encodeURIComponent(id)}&origin=my-drafts&returnTo=${encodeURIComponent("/drafts/")}`,
  }, "Archived SOP restored as a new draft version.");
};
