import { optionalText } from "./api";
import { newId, type D1DatabaseBinding } from "./cloudflare";

export interface StepAttachmentInput {
  id?: string;
  mediaAssetId?: string;
  relationship?: string;
  sortOrder?: number;
  fileName?: string;
  mimeType?: string;
  assetType?: string;
  url?: string;
  altText?: string;
  caption?: string;
  accessibilityStatus?: string;
  isDecorative?: boolean | number;
}

export interface ProcedureStepInput {
  id?: string;
  title?: string;
  instructions?: string;
  note?: string;
  attachments?: StepAttachmentInput[];
}

function normalizeRelationship(value: unknown) {
  const relationship = String(value || "Instructional Media").trim();
  return ["Instructional Media", "Evidence", "Example", "Warning"].includes(relationship)
    ? relationship
    : "Instructional Media";
}

async function ensureMediaAccessibilityColumn(db: D1DatabaseBinding) {
  const info = await db.prepare("PRAGMA table_info(media_assets)").all<{ name: string }>();
  const columns = new Set((info.results || []).map((row) => row.name));
  if (!columns.has("is_decorative")) {
    await db.prepare("ALTER TABLE media_assets ADD COLUMN is_decorative INTEGER NOT NULL DEFAULT 0").run();
  }
}

function normalizeAttachment(attachment: StepAttachmentInput, index: number) {
  const id = optionalText(attachment.mediaAssetId || attachment.id, 160);
  if (!id) return null;
  const isDecorative = attachment.accessibilityStatus === "decorative" || attachment.isDecorative === true || attachment.isDecorative === 1;
  const altText = optionalText(attachment.altText, 125);
  if (attachment.altText && String(attachment.altText).trim().length > 125) {
    throw new Error("Attachment alternative text must be 125 characters or fewer.");
  }
  if (!isDecorative && !altText) {
    throw new Error("Each step attachment must be marked decorative or include alternative text.");
  }
  return {
    id,
    relationship: normalizeRelationship(attachment.relationship),
    sortOrder: Number.isFinite(Number(attachment.sortOrder)) ? Number(attachment.sortOrder) : index,
    altText: isDecorative ? "" : altText,
    caption: optionalText(attachment.caption, 500),
    isDecorative,
  };
}

export function validateProcedureStepAttachments(steps: ProcedureStepInput[] = []) {
  for (const step of steps) {
    const attachments = Array.isArray(step.attachments) ? step.attachments : [];
    attachments.forEach((attachment, index) => normalizeAttachment(attachment, index));
  }
}

export async function syncProcedureSteps(
  db: D1DatabaseBinding,
  sopId: string,
  versionId: string,
  steps: ProcedureStepInput[] = [],
) {
  if (!versionId) return;
  await ensureMediaAccessibilityColumn(db);

  await db
    .prepare(
      `DELETE FROM procedure_step_media
       WHERE procedure_step_id IN (
        SELECT id FROM procedure_steps WHERE sop_version_id = ?
       )`,
    )
    .bind(versionId)
    .run();
  await db.prepare("DELETE FROM procedure_steps WHERE sop_version_id = ?").bind(versionId).run();
  await db.prepare("DELETE FROM sop_version_media WHERE sop_version_id = ?").bind(versionId).run();
  if (sopId) {
    await db.prepare("DELETE FROM sop_media WHERE sop_id = ? AND relationship IN ('Screenshot', 'Attachment')").bind(sopId).run();
  }

  for (const [index, step] of steps.entries()) {
    const title = optionalText(step.title, 220);
    const instructions = optionalText(step.instructions, 12000);
    if (!title && !instructions) continue;

    const stepId = newId("step");
    await db
      .prepare(
        `INSERT INTO procedure_steps (
          id, sop_version_id, step_number, title, instructions, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .bind(
        stepId,
        versionId,
        index + 1,
        title || `Step ${index + 1}`,
        instructions || title,
        optionalText(step.note, 4000) || null,
      )
      .run();

    const attachments = Array.isArray(step.attachments) ? step.attachments : [];
    for (const [attachmentIndex, attachment] of attachments.entries()) {
      const normalized = normalizeAttachment(attachment, attachmentIndex);
      if (!normalized) continue;

      await db
        .prepare(
          `UPDATE media_assets
           SET alt_text = ?,
               is_decorative = ?,
               caption = COALESCE(NULLIF(?, ''), caption),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?
             AND status = 'Active'
             AND asset_type IN ('Image', 'Video')`,
        )
        .bind(normalized.altText, normalized.isDecorative ? 1 : 0, normalized.caption, normalized.id)
        .run();

      await db
        .prepare(
          `INSERT OR IGNORE INTO procedure_step_media (
            procedure_step_id, media_asset_id, relationship, sort_order
          ) VALUES (?, ?, ?, ?)`,
        )
        .bind(stepId, normalized.id, normalized.relationship, normalized.sortOrder)
        .run();

      await db
        .prepare(
          `INSERT OR IGNORE INTO sop_version_media (
            sop_version_id, media_asset_id, relationship, sort_order
          ) VALUES (?, ?, 'Attachment', ?)`,
        )
        .bind(versionId, normalized.id, normalized.sortOrder)
        .run();

      if (sopId) {
        await db
          .prepare(
            `INSERT OR IGNORE INTO sop_media (
              sop_id, media_asset_id, relationship, sort_order
            ) VALUES (?, ?, ?, ?)`,
          )
          .bind(sopId, normalized.id, normalized.relationship === "Instructional Media" ? "Screenshot" : "Attachment", normalized.sortOrder)
          .run();
      }
    }
  }
}

export async function listProcedureSteps(db: D1DatabaseBinding, versionId: string) {
  if (!versionId) return [];
  await ensureMediaAccessibilityColumn(db);
  const result = await db
    .prepare(
      `SELECT
        steps.id,
        steps.step_number AS stepNumber,
        steps.title,
        steps.instructions,
        steps.note,
        media.id AS mediaAssetId,
        media.asset_type AS assetType,
        media.original_file_name AS fileName,
        media.mime_type AS mimeType,
        media.size_bytes AS fileSize,
        media.public_url AS url,
        media.alt_text AS altText,
        COALESCE(media.is_decorative, 0) AS isDecorative,
        media.caption,
        media.created_at AS attachmentCreatedAt,
        step_media.relationship,
        step_media.sort_order AS attachmentSortOrder
       FROM procedure_steps steps
       LEFT JOIN procedure_step_media step_media ON step_media.procedure_step_id = steps.id
       LEFT JOIN media_assets media ON media.id = step_media.media_asset_id
        AND media.status = 'Active'
       WHERE steps.sop_version_id = ?
       ORDER BY steps.step_number ASC, step_media.sort_order ASC, media.created_at ASC`,
    )
    .bind(versionId)
    .all<Record<string, unknown>>();

  const byStep = new Map<string, Record<string, unknown>>();
  for (const row of result.results || []) {
    const id = String(row.id || "");
    if (!byStep.has(id)) {
      byStep.set(id, {
        id,
        title: row.title || "",
        instructions: row.instructions || "",
        note: row.note || "",
        attachments: [],
      });
    }
    if (row.mediaAssetId) {
      (byStep.get(id)!.attachments as unknown[]).push({
        id: row.mediaAssetId,
        mediaAssetId: row.mediaAssetId,
        assetType: row.assetType,
        fileName: row.fileName,
        mimeType: row.mimeType,
        fileSize: Number(row.fileSize || 0),
        url: row.url || `/api/media/?id=${encodeURIComponent(String(row.mediaAssetId))}`,
        altText: row.altText || "",
        accessibilityStatus: Number(row.isDecorative || 0) === 1 ? "decorative" : row.altText ? "meaningful" : "",
        isDecorative: Number(row.isDecorative || 0) === 1,
        caption: row.caption || "",
        relationship: row.relationship || "Instructional Media",
        sortOrder: Number(row.attachmentSortOrder || 0),
        createdAt: row.attachmentCreatedAt || "",
      });
    }
  }

  return Array.from(byStep.values());
}
