import {
  failure,
  getRouteParam,
  optionalText,
  readBody,
  success,
  unixNow,
} from "../../../_shared/api";
import { requireDb } from "../../../_shared/admin";
import { requirePermission } from "../../../_shared/auth";
import { newId, type PagesFunctionContext } from "../../../_shared/cloudflare";
import { requireSopOwnership } from "../../../_shared/ownership";

interface SopVersionPayload {
  title?: string;
  summary?: string;
  purpose?: string;
  content?: string;
  beforeYouBegin?: string;
  checklist?: string;
  troubleshooting?: string;
  changeSummary?: string;
  tools?: string[] | string;
  audience?: string[] | string;
}

function listValue(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "")
    .split(/[\n,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;

  const sopId = getRouteParam(context, "id");
  const result = await context.env.DB!.prepare(
    `SELECT
      id,
      sop_id AS sopId,
      version_label AS versionLabel,
      version_number AS versionNumber,
      title,
      summary,
      purpose,
      COALESCE(content, body_markdown) AS content,
      before_you_begin AS beforeYouBegin,
      checklist,
      troubleshooting,
      change_summary AS changeSummary,
      status,
      created_by_user_id AS createdByUserId,
      created_by AS createdBy,
      created_at AS createdAt,
      updated_at AS updatedAt,
      reviewed_at AS reviewedAt,
      approved_at AS approvedAt,
      published_at AS publishedAt
     FROM sop_versions
     WHERE sop_id = ?
     ORDER BY created_at DESC`,
  )
    .bind(sopId)
    .all();

  return success({ versions: result.results || [] });
};

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Edit Drafts");
  if (auth.response) return auth.response;

  const sopId = getRouteParam(context, "id");
  const ownership = await requireSopOwnership(context, auth.user!, sopId);
  if (ownership.response) return ownership.response;
  const [payload, parseError] = await readBody<SopVersionPayload>(context.request);
  if (parseError) return parseError;

  const fields: Record<string, string> = {};
  const title = optionalText(payload?.title, 180);
  const purpose = optionalText(payload?.purpose || payload?.summary, 4000);
  const content = optionalText(payload?.content || purpose, 50000);
  if (!title) fields.title = "Title is required.";
  if (!purpose) fields.purpose = "Purpose is required.";
  if (!content) fields.content = "Content is required.";
  if (Object.keys(fields).length) return failure("VALIDATION_ERROR", "Please correct the highlighted fields.", 400, fields);

  const versionCount = await context.env.DB!.prepare("SELECT COUNT(*) AS total FROM sop_versions WHERE sop_id = ?")
    .bind(sopId)
    .first<{ total: number }>();
  const versionNumber = `0.${Number(versionCount?.total || 0) + 1}`;
  const id = newId("version");
  const now = unixNow();
  const nowIso = new Date(now * 1000).toISOString();
  const metadata = JSON.stringify({
    tools: listValue(payload?.tools),
    audience: listValue(payload?.audience),
  });

  await context.env.DB!.prepare(
    `INSERT INTO sop_versions (
      id, sop_id, version_label, version_number, title, summary, purpose, body_markdown,
      content, before_you_begin, checklist, troubleshooting, metadata_json, change_summary,
      status, created_by_user_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      sopId,
      versionNumber,
      versionNumber,
      title,
      optionalText(payload?.summary || purpose, 1000),
      purpose,
      content,
      content,
      optionalText(payload?.beforeYouBegin, 4000),
      optionalText(payload?.checklist, 8000),
      optionalText(payload?.troubleshooting, 8000),
      metadata,
      optionalText(payload?.changeSummary || "Draft version created.", 2000),
      "Draft",
      auth.user?.id || null,
      auth.user?.id || null,
      nowIso,
      now,
    )
    .run();

  await context.env.DB!.prepare(
    "UPDATE sops SET current_version_id = ?, status = 'Draft', updated_at = ? WHERE id = ?",
  )
    .bind(id, nowIso, sopId)
    .run();

  return success({ version: { id, sopId, versionNumber } }, "SOP version created.", 201);
};
