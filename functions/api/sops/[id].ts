import {
  cacheHeaders,
  failure,
  getRouteParam,
  optionalText,
  readBody,
  success,
  unixNow,
} from "../../_shared/api";
import { requireDb } from "../../_shared/admin";
import { getAuthUser, requirePermission } from "../../_shared/auth";
import { newId, type PagesFunctionContext } from "../../_shared/cloudflare";
import { requireSopOwnership, resolveRequestedCreatorSubRole } from "../../_shared/ownership";
import { getSopById } from "../../_shared/sop-data";

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;

  const id = getRouteParam(context, "id");
  const user = await getAuthUser(context);
  const publicOnly = !user || user.role === "normal";
  const sop = await getSopById(context.env.DB!, id, publicOnly);
  if (!sop) return failure("NOT_FOUND", "SOP not found.", 404);
  const selectedSubRole = await resolveRequestedCreatorSubRole(context.env.DB!, context.request);
  if (selectedSubRole && sop.ownerSubRoleId !== selectedSubRole.id) {
    return failure(
      "SOP_OWNERSHIP_REQUIRED",
      "This SOP belongs to another department. Switch back to Normal User mode to view it without creator/reviewer controls.",
      403,
    );
  }

  return new Response(JSON.stringify({ success: true, data: { sop }, sop }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...cacheHeaders(selectedSubRole || !publicOnly ? "private" : "public"),
      vary: "x-sop-sub-role",
    },
  });
};

interface UpdateSopPayload {
  title?: string;
  summary?: string;
  purpose?: string;
  categoryId?: string;
  ownerId?: string;
  ownerTeamId?: string;
  estimatedMinutes?: number;
  estimatedCompletionTime?: string;
  audience?: string[] | string;
  tools?: string[] | string;
  tags?: string[] | string;
  type?: string;
  content?: string;
  beforeYouBegin?: string;
  checklist?: string;
  troubleshooting?: string;
  changeSummary?: string;
  reviewDate?: string;
  reviewDueAt?: number | string;
  actorUserId?: string;
}

function listValue(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "")
    .split(/[\n,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export const onRequestPut = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Edit Drafts");
  if (auth.response) return auth.response;

  const id = getRouteParam(context, "id");
  const existing = await getSopById(context.env.DB!, id, false);
  if (!existing) return failure("NOT_FOUND", "SOP not found.", 404);
  const ownership = await requireSopOwnership(context, auth.user!, id);
  if (ownership.response) return ownership.response;
  const selectedSubRole = ownership.subRole || (await resolveRequestedCreatorSubRole(context.env.DB!, context.request));

  const [payload, parseError] = await readBody<UpdateSopPayload>(context.request);
  if (parseError) return parseError;

  const now = unixNow();
  const nowIso = new Date(now * 1000).toISOString();
  const title = optionalText(payload?.title || existing.title, 180);
  const purpose = optionalText(payload?.purpose || existing.purpose, 4000);
  const summary = optionalText(payload?.summary || existing.summary || purpose, 1000);
  const audience = listValue(payload?.audience).join("|") || (Array.isArray(existing.audience) ? existing.audience.join("|") : "");
  const tools = listValue(payload?.tools);
  const metadata = JSON.stringify({
    audience: listValue(payload?.audience),
    tools,
    tags: listValue(payload?.tags),
  });
  const content = optionalText(payload?.content || existing.bodyMarkdown || purpose, 50000);
  const estimatedMinutes = Number(payload?.estimatedMinutes || existing.estimatedMinutes || 0) || null;
  const reviewDueAt =
    typeof payload?.reviewDueAt === "number"
      ? payload.reviewDueAt
      : payload?.reviewDueAt
        ? Math.floor(new Date(String(payload.reviewDueAt)).getTime() / 1000)
        : payload?.reviewDate
          ? Math.floor(new Date(`${String(payload.reviewDate)}T00:00:00`).getTime() / 1000)
        : null;

  await context.env.DB!.prepare(
    `UPDATE sops
     SET title = ?, summary = ?, purpose = ?, category_id = ?, owner_id = ?, owner_user_id = ?,
         owner_team_id = ?, owner_sub_role_id = ?, estimated_minutes = ?, estimated_completion_time = ?, audience = ?,
         type = ?, review_date = COALESCE(?, review_date), review_due_at = COALESCE(?, review_due_at), updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      title,
      summary,
      purpose,
      payload?.categoryId || existing.categoryId || null,
      payload?.ownerId || existing.ownerId || null,
      payload?.ownerId || existing.ownerId || null,
      payload?.ownerTeamId || selectedSubRole?.teamId || null,
      selectedSubRole?.id || existing.ownerSubRoleId || null,
      estimatedMinutes,
      optionalText(payload?.estimatedCompletionTime, 120) || (estimatedMinutes ? `${estimatedMinutes} minutes` : existing.estimatedCompletionTime || null),
      audience,
      optionalText(payload?.type || existing.type || "Process", 80),
      optionalText(payload?.reviewDate, 40) || null,
      Number.isFinite(reviewDueAt) ? reviewDueAt : null,
      nowIso,
      id,
    )
    .run();

  if (existing.currentVersionId) {
    await context.env.DB!.prepare(
      `UPDATE sop_versions
       SET title = ?, summary = ?, purpose = ?, body_markdown = ?, content = ?,
           before_you_begin = COALESCE(?, before_you_begin),
           checklist = COALESCE(?, checklist),
           troubleshooting = COALESCE(?, troubleshooting),
           metadata_json = ?, change_summary = COALESCE(?, change_summary), updated_at = ?
       WHERE id = ?`,
    )
      .bind(
        title,
        summary,
        purpose,
        content,
        content,
        optionalText(payload?.beforeYouBegin, 4000) || null,
        optionalText(payload?.checklist, 8000) || null,
        optionalText(payload?.troubleshooting, 8000) || null,
        metadata,
        optionalText(payload?.changeSummary, 2000) || null,
        now,
        existing.currentVersionId,
      )
      .run();
  }

  await context.env.DB!.prepare(
    `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, after_json, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      newId("audit"),
      payload?.actorUserId || auth.user?.id || null,
      "update_sop",
      "sop",
      id,
      JSON.stringify({ title, summary, purpose }),
      "SOP metadata updated through API.",
      now,
    )
    .run();

  const sop = await getSopById(context.env.DB!, id, false);
  return success({ sop }, "SOP updated.");
};
