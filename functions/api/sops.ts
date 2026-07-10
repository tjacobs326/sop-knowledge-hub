import { failure, roleFromRequest, cacheHeaders, readBody, optionalText, success, unixNow, type ApiRole } from "../_shared/api";
import { idFrom, requireDb, slugify } from "../_shared/admin";
import { getAuthUser, requirePermission } from "../_shared/auth";
import { newId, type PagesFunctionContext } from "../_shared/cloudflare";
import { requireCreatorSubRoleSelection, resolveAuthorizedCreatorSubRole } from "../_shared/ownership";
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
    const selectedSubRole = await resolveAuthorizedCreatorSubRole(env.DB!, user, request);
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
          ...cacheHeaders(selectedSubRole || filters.publicOnly === false ? "private" : "public"),
          vary: "x-sop-sub-role",
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
  reviewerId?: string;
  estimatedMinutes?: number;
  estimatedCompletionTime?: string;
  audience?: string[] | string;
  tools?: string[] | string;
  tags?: string[] | string;
  type?: string;
  version?: string;
  content?: string;
  beforeYouBegin?: string;
  checklist?: string;
  troubleshooting?: string;
  changeSummary?: string;
  createdBy?: string;
  reviewDate?: string;
}

function listValue(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "")
    .split(/[\n,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function estimatedMinutesFrom(value: unknown, fallback: unknown) {
  const numeric = Number(value || 0);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const match = String(fallback || "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

async function linkTags(db: NonNullable<PagesFunctionContext["env"]["DB"]>, sopId: string, tags: string[]) {
  for (const tagName of tags) {
    const name = optionalText(tagName, 120);
    if (!name) continue;
    const id = idFrom(name, "tag");
    const slug = slugify(name, id);
    await db
      .prepare(
        `INSERT OR IGNORE INTO tags (id, name, slug, created_at, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .bind(id, name, slug)
      .run();
    await db.prepare("INSERT OR IGNORE INTO sop_tags (sop_id, tag_id) VALUES (?, ?)").bind(sopId, id).run();
  }
}

export const onRequestPost = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission({ request, env }, "Create SOPs");
  if (auth.response) return auth.response;
  const ownership = await requireCreatorSubRoleSelection({ request, env }, auth.user!);
  if (ownership.response) return ownership.response;
  const selectedSubRole = ownership.subRole || (await resolveAuthorizedCreatorSubRole(env.DB!, auth.user, request));

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
  const version = optionalText(payload?.version || "0.1", 40) || "0.1";
  const tags = listValue(payload?.tags);
  const estimatedMinutes = estimatedMinutesFrom(payload?.estimatedMinutes, payload?.estimatedCompletionTime);
  const metadata = JSON.stringify({
    audience: listValue(payload?.audience),
    tools: listValue(payload?.tools),
    tags,
  });
  const ownerId = payload?.ownerId || auth.user?.id || null;
  const ownerTeamId = payload?.ownerTeamId || selectedSubRole?.teamId || null;
  const ownerSubRoleId = selectedSubRole?.id || null;
  const type = optionalText(payload?.type || "Process", 80) || "Process";
  const reviewDate = optionalText(payload?.reviewDate, 40) || null;

  await env.DB!.prepare(
    `INSERT INTO sops (
      id, title, slug, summary, purpose, category_id, owner_id, owner_user_id, owner_team_id,
      owner_sub_role_id, status, type, current_version_id, estimated_minutes, estimated_completion_time, audience,
      review_date, review_due_at, is_active, created_by_user_id, source_type, visibility, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      title,
      slug,
      optionalText(payload?.summary || purpose, 1000),
      purpose,
      payload?.categoryId || null,
      ownerId,
      ownerId,
      ownerTeamId,
      ownerSubRoleId,
      "Draft",
      type,
      versionId,
      estimatedMinutes,
      optionalText(payload?.estimatedCompletionTime, 120) || (estimatedMinutes ? `${estimatedMinutes} minutes` : null),
      listValue(payload?.audience).join("|"),
      reviewDate,
      reviewDate ? Math.floor(new Date(`${reviewDate}T00:00:00`).getTime() / 1000) : null,
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
      version,
      version,
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

  await env.DB!
    .prepare(
      `INSERT OR IGNORE INTO sop_assignments (
        id, sop_id, version_id, user_id, team_id, assignment_type, status, assigned_by_user_id, due_at
      ) VALUES (?, ?, ?, ?, ?, 'Owner', 'Active', ?, ?)`,
    )
    .bind(newId("assignment"), id, versionId, ownerId, ownerTeamId, auth.user?.id || null, reviewDate)
    .run();

  if (payload?.reviewerId) {
    await env.DB!
      .prepare(
        `INSERT OR IGNORE INTO sop_assignments (
          id, sop_id, version_id, user_id, team_id, assignment_type, status, assigned_by_user_id, due_at
        ) VALUES (?, ?, ?, ?, ?, 'Reviewer', 'Active', ?, ?)`,
      )
      .bind(newId("assignment"), id, versionId, payload.reviewerId, ownerTeamId, auth.user?.id || null, reviewDate)
      .run();
  }

  await linkTags(env.DB!, id, tags);

  await env.DB!.prepare(
    `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, after_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(newId("audit"), payload?.createdBy || auth.user?.id || null, "create_draft", "sop", id, JSON.stringify({ title, versionId }), now)
    .run();

  return success({ sop: { id, slug, currentVersionId: versionId, status: "Draft" } }, "SOP draft created.", 201);
};
