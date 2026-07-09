import { failure, roleFromRequest, cacheHeaders, readBody, optionalText, success, unixNow, type ApiRole } from "../_shared/api";
import { requireDb, slugify } from "../_shared/admin";
import { getAuthUser, requirePermission } from "../_shared/auth";
import { newId, type PagesFunctionContext } from "../_shared/cloudflare";
import { requireCreatorSubRoleSelection, resolveRequestedCreatorSubRole } from "../_shared/ownership";
import { countSops, listSops, type SopFilters } from "../_shared/sop-data";

function readFilters(request: Request, role: ApiRole): SopFilters {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || "100");
  const offset = Number(url.searchParams.get("offset") || "0");
  const status = url.searchParams.get("status") || undefined;
  return {
    search: url.searchParams.get("search") || url.searchParams.get("q") || undefined,
    category: url.searchParams.get("category") || undefined,
    categoryId: url.searchParams.get("categoryId") || undefined,
    tag: url.searchParams.get("tag") || undefined,
    tool: url.searchParams.get("tool") || undefined,
    owner: url.searchParams.get("owner") || undefined,
    status,
    sort: url.searchParams.get("sort") || undefined,
    limit,
    offset,
    publicOnly: role === "normal" || !status,
  };
}

export const onRequestGet = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;

  try {
    const url = new URL(request.url);
    const user = await getAuthUser({ request, env });
    const role = url.searchParams.has("status") && user ? user.role : roleFromRequest(request);
    const filters = readFilters(request, role);
    const selectedSubRole = await resolveRequestedCreatorSubRole(env.DB!, request);
    if (selectedSubRole) {
      filters.ownerSubRoleId = selectedSubRole.id;
    }
    const [sops, total] = await Promise.all([
      listSops(env.DB!, filters),
      countSops(env.DB!, filters),
    ]);
    const body = {
      sops,
      total,
      limit: filters.limit,
      offset: filters.offset,
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: body,
        sops,
        total,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          ...cacheHeaders(filters.publicOnly === false ? "private" : "public"),
        },
      },
    );
  } catch (error) {
    return failure(
      "SOPS_READ_FAILED",
      error instanceof Error ? error.message : "Unable to load SOPs.",
      500,
    );
  }
};

interface CreateSopPayload {
  title?: string;
  summary?: string;
  purpose?: string;
  categoryId?: string;
  ownerId?: string;
  ownerTeamId?: string;
  estimatedMinutes?: number;
  audience?: string[] | string;
  tools?: string[] | string;
  tags?: string[] | string;
  content?: string;
  beforeYouBegin?: string;
  checklist?: string;
  troubleshooting?: string;
  changeSummary?: string;
  createdBy?: string;
}

function listValue(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "")
    .split(/[\n,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export const onRequestPost = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission({ request, env }, "Create SOPs");
  if (auth.response) return auth.response;
  const ownership = await requireCreatorSubRoleSelection({ request, env }, auth.user!);
  if (ownership.response) return ownership.response;

  const [payload, parseError] = await readBody<CreateSopPayload>(request);
  if (parseError) return parseError;

  const title = optionalText(payload?.title, 180);
  const purpose = optionalText(payload?.purpose || payload?.summary, 4000);
  const content = optionalText(payload?.content || purpose, 50000);
  const fields: Record<string, string> = {};
  if (!title) fields.title = "Title is required.";
  if (!purpose) fields.purpose = "Purpose is required.";
  if (!content) fields.content = "Content is required.";
  if (Object.keys(fields).length) return failure("VALIDATION_ERROR", "Please correct the highlighted fields.", 400, fields);

  const id = newId("sop");
  const versionId = newId("version");
  const slug = slugify(title, id);
  const now = unixNow();
  const nowIso = new Date(now * 1000).toISOString();
  const metadata = JSON.stringify({
    audience: listValue(payload?.audience),
    tools: listValue(payload?.tools),
  });

  await env.DB!.prepare(
    `INSERT INTO sops (
      id, title, slug, summary, purpose, category_id, owner_id, owner_user_id, owner_team_id,
      owner_sub_role_id, status, type, current_version_id, estimated_minutes, estimated_completion_time, audience,
      is_active, created_by_user_id, source_type, visibility, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      title,
      slug,
      optionalText(payload?.summary || purpose, 1000),
      purpose,
      payload?.categoryId || null,
      payload?.ownerId || payload?.createdBy || null,
      payload?.ownerId || payload?.createdBy || null,
      payload?.ownerTeamId || ownership.subRole?.teamId || null,
      ownership.subRole?.id || null,
      "Draft",
      "Process",
      versionId,
      Number(payload?.estimatedMinutes || 0) || null,
      payload?.estimatedMinutes ? `${payload.estimatedMinutes} minutes` : null,
      listValue(payload?.audience).join("|"),
      payload?.createdBy || auth.user?.id || null,
      "Database",
      "Internal",
      nowIso,
      nowIso,
    )
    .run();

  await env.DB!.prepare(
    `INSERT INTO sop_versions (
      id, sop_id, version_label, version_number, title, summary, purpose, body_markdown,
      content, before_you_begin, checklist, troubleshooting, metadata_json, change_summary,
      status, created_by_user_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      versionId,
      id,
      "0.1",
      "0.1",
      title,
      optionalText(payload?.summary || purpose, 1000),
      purpose,
      content,
      content,
      optionalText(payload?.beforeYouBegin, 4000),
      optionalText(payload?.checklist, 8000),
      optionalText(payload?.troubleshooting, 8000),
      metadata,
      optionalText(payload?.changeSummary || "Initial draft created.", 2000),
      "Draft",
      payload?.createdBy || auth.user?.id || null,
      payload?.createdBy || auth.user?.id || null,
      nowIso,
      now,
    )
    .run();

  await env.DB!.prepare(
    `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, after_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(newId("audit"), payload?.createdBy || auth.user?.id || null, "create_draft", "sop", id, JSON.stringify({ title, versionId }), now)
    .run();

  return success({ sop: { id, slug, currentVersionId: versionId } }, "SOP draft created.", 201);
};
