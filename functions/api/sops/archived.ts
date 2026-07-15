import { cacheHeaders, failure } from "../../_shared/api";
import { requireDb } from "../../_shared/admin";
import { hasPermission, requirePermission } from "../../_shared/auth";
import { type D1DatabaseBinding, type PagesFunctionContext } from "../../_shared/cloudflare";
import { getSopById } from "../../_shared/sop-data";
import { resolveCreatorWorkScope, subRoleSopScopeClause, type ResolvedWorkScope } from "../../_shared/work-scope";

function normalizeDate(value: unknown) {
  if (!value) return "";
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  const raw = String(value);
  if (/^\d+$/.test(raw)) return new Date(Number(raw) * 1000).toISOString();
  return raw;
}

function scopeSql(workScope: ResolvedWorkScope) {
  const scope = subRoleSopScopeClause("sops", workScope.subRole);
  const clauses = [scope.sql];
  const values = [...scope.values];
  if (workScope.selectedUser?.id) {
    clauses.push(
      `(COALESCE(sops.owner_id, sops.owner_user_id) = ? OR sops.created_by_user_id = ? OR EXISTS (
        SELECT 1 FROM sop_assignments scoped_assignments
        WHERE scoped_assignments.sop_id = sops.id AND scoped_assignments.user_id = ?
      ))`,
    );
    values.push(workScope.selectedUser.id, workScope.selectedUser.id, workScope.selectedUser.id);
  }
  return { sql: clauses.map((clause) => `(${clause})`).join(" AND "), values };
}

function archivedSelect() {
  return `SELECT
    sops.id,
    sops.title,
    sops.slug,
    sops.status,
    sops.archive_previous_status AS previousStatus,
    sops.archived_at AS archivedAt,
    sops.archive_reason AS archiveReason,
    sops.updated_at AS updatedAt,
    categories.id AS categoryId,
    categories.name AS category,
    owner.id AS ownerId,
    owner.name AS owner,
    sub_roles.department AS department,
    archived_by.name AS archivedBy,
    GROUP_CONCAT(DISTINCT tags.name) AS tags
   FROM sops
   LEFT JOIN categories ON categories.id = sops.category_id
   LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
   LEFT JOIN users archived_by ON archived_by.id = sops.archived_by_user_id
   LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id
   LEFT JOIN sop_tags ON sop_tags.sop_id = sops.id
   LEFT JOIN tags ON tags.id = sop_tags.tag_id`;
}

function normalizeArchived(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    title: String(row.title || "Untitled archived SOP"),
    slug: String(row.slug || ""),
    categoryId: String(row.categoryId || ""),
    category: String(row.category || "Uncategorized"),
    ownerId: String(row.ownerId || ""),
    owner: String(row.owner || "Unassigned"),
    department: String(row.department || "Not listed"),
    previousStatus: String(row.previousStatus || "Unknown"),
    archivedAt: normalizeDate(row.archivedAt),
    archivedBy: String(row.archivedBy || "Unknown user"),
    archiveReason: String(row.archiveReason || "No reason recorded"),
    updatedAt: normalizeDate(row.updatedAt),
    tags: String(row.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean),
  };
}

async function queryArchived(db: D1DatabaseBinding, workScope: ResolvedWorkScope, request: Request) {
  const url = new URL(request.url);
  const scope = scopeSql(workScope);
  const clauses = ["sops.status = 'Archived'", "COALESCE(sops.is_active, 0) = 0", scope.sql];
  const values: unknown[] = [...scope.values];
  const q = String(url.searchParams.get("q") || "").trim();
  const department = String(url.searchParams.get("department") || "").trim();
  const category = String(url.searchParams.get("category") || "").trim();
  const owner = String(url.searchParams.get("owner") || "").trim();
  const archivedDate = String(url.searchParams.get("archivedDate") || "").trim();
  const id = String(url.searchParams.get("id") || "").trim();
  if (q) {
    const like = `%${q}%`;
    clauses.push(`(
      sops.title LIKE ? OR sops.id LIKE ? OR sops.summary LIKE ? OR sops.purpose LIKE ?
      OR owner.name LIKE ? OR categories.name LIKE ? OR EXISTS (
        SELECT 1 FROM sop_tags search_sop_tags JOIN tags search_tags ON search_tags.id = search_sop_tags.tag_id
        WHERE search_sop_tags.sop_id = sops.id AND search_tags.name LIKE ?
      ) OR EXISTS (
        SELECT 1 FROM sop_versions search_versions
        WHERE search_versions.id = sops.current_version_id
          AND (search_versions.body_markdown LIKE ? OR search_versions.content LIKE ?)
      )
    )`);
    values.push(like, like, like, like, like, like, like, like, like);
  }
  if (department) { clauses.push("sub_roles.department = ?"); values.push(department); }
  if (category) { clauses.push("categories.id = ?"); values.push(category); }
  if (owner) { clauses.push("owner.id = ?"); values.push(owner); }
  if (archivedDate) { clauses.push("date(sops.archived_at) = date(?)"); values.push(archivedDate); }
  if (id) { clauses.push("sops.id = ?"); values.push(id); }

  const result = await db.prepare(
    `${archivedSelect()} WHERE ${clauses.join(" AND ")}
     GROUP BY sops.id ORDER BY sops.archived_at DESC, sops.title ASC LIMIT 250`,
  ).bind(...values).all<Record<string, unknown>>();
  return (result.results || []).map(normalizeArchived);
}

async function filterOptions(db: D1DatabaseBinding, workScope: ResolvedWorkScope) {
  const scope = scopeSql(workScope);
  const result = await db.prepare(
    `${archivedSelect()} WHERE sops.status = 'Archived' AND COALESCE(sops.is_active, 0) = 0 AND ${scope.sql}
     GROUP BY sops.id ORDER BY sops.title ASC`,
  ).bind(...scope.values).all<Record<string, unknown>>();
  const rows = (result.results || []).map(normalizeArchived);
  const unique = (items: Array<{ id: string; label: string }>) => Array.from(new Map(items.filter((item) => item.id).map((item) => [item.id, item])).values());
  return {
    departments: Array.from(new Set(rows.map((row) => row.department).filter(Boolean))).sort(),
    categories: unique(rows.map((row) => ({ id: row.categoryId, label: row.category }))).sort((a, b) => a.label.localeCompare(b.label)),
    owners: unique(rows.map((row) => ({ id: row.ownerId, label: row.owner }))).sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Archive SOPs");
  if (auth.response || !auth.user) return auth.response;
  const resolved = await resolveCreatorWorkScope(context.env.DB!, context);
  if (resolved.response || !resolved.subRole || !resolved.user) return resolved.response;
  const records = await queryArchived(context.env.DB!, resolved, context.request);
  const id = String(new URL(context.request.url).searchParams.get("id") || "").trim();
  if (id) {
    const archived = records[0];
    if (!archived) return failure("NOT_FOUND", "Archived SOP not found for the selected role and department.", 404);
    const sop = await getSopById(context.env.DB!, id, false);
    if (!sop) return failure("NOT_FOUND", "Archived SOP not found.", 404);
    return new Response(JSON.stringify({ success: true, data: { sop: { ...sop, ...archived, status: "Archived" }, capabilities: { canRestoreAsDraft: hasPermission(auth.user, "Edit Drafts") } } }), {
      headers: { "content-type": "application/json; charset=utf-8", ...cacheHeaders("private"), vary: "x-sop-sub-role" },
    });
  }
  const filters = await filterOptions(context.env.DB!, resolved);
  return new Response(JSON.stringify({ success: true, data: {
    context: { selectedSubRole: resolved.subRole, workScope: resolved.scope, workScopeLabel: resolved.label },
    count: records.length,
    archivedSops: records,
    filters,
  } }), {
    headers: { "content-type": "application/json; charset=utf-8", ...cacheHeaders("private"), vary: "x-sop-sub-role" },
  });
};
