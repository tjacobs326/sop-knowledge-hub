import { cacheHeaders, failure } from "../../_shared/api";
import { requireDb } from "../../_shared/admin";
import { hasPermission, requirePermission } from "../../_shared/auth";
import { type D1DatabaseBinding, type PagesFunctionContext } from "../../_shared/cloudflare";
import { getSopById } from "../../_shared/sop-data";
import { resolveCreatorWorkScope, subRoleSopScopeClause, type ResolvedWorkScope } from "../../_shared/work-scope";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_BYTES = 48;

interface ArchiveCursor {
  archivedAt: string;
  id: string;
}

function normalizeDate(value: unknown) {
  if (!value) return "";
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  const raw = String(value);
  if (/^\d+$/.test(raw)) return new Date(Number(raw) * 1000).toISOString();
  return raw;
}

function encodeCursor(cursor: ArchiveCursor) {
  const bytes = new TextEncoder().encode(JSON.stringify(cursor));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeCursor(value: string): ArchiveCursor | null {
  if (!value) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))));
    if (!parsed?.archivedAt || !parsed?.id) return null;
    return { archivedAt: String(parsed.archivedAt), id: String(parsed.id) };
  } catch {
    return null;
  }
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

function archivedFrom() {
  return `FROM sops
   LEFT JOIN categories ON categories.id = sops.category_id
   LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
   LEFT JOIN users archived_by ON archived_by.id = sops.archived_by_user_id
   LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id
   LEFT JOIN sop_tags ON sop_tags.sop_id = sops.id
   LEFT JOIN tags ON tags.id = sop_tags.tag_id`;
}

function archivedSelect() {
  return `SELECT
    sops.id, sops.title, sops.slug, sops.status,
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
   ${archivedFrom()}`;
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

function archiveFilters(workScope: ResolvedWorkScope, request: Request) {
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
  if (new TextEncoder().encode(q).length > MAX_SEARCH_BYTES) {
    return { error: `Search terms must be ${MAX_SEARCH_BYTES} bytes or fewer.`, clauses, values, id };
  }
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
  return { error: "", clauses, values, id };
}

async function queryArchived(db: D1DatabaseBinding, workScope: ResolvedWorkScope, request: Request) {
  const url = new URL(request.url);
  const filters = archiveFilters(workScope, request);
  if (filters.error) return { error: filters.error, records: [], total: 0, nextCursor: "" };
  const requestedLimit = Number(url.searchParams.get("limit") || DEFAULT_PAGE_SIZE);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  const cursorValue = String(url.searchParams.get("cursor") || "");
  const cursor = decodeCursor(cursorValue);
  if (cursorValue && !cursor) return { error: "The archive cursor is invalid or expired.", records: [], total: 0, nextCursor: "" };
  const pageClauses = [...filters.clauses];
  const pageValues = [...filters.values];
  if (cursor) {
    pageClauses.push("(sops.archived_at < ? OR (sops.archived_at = ? AND sops.id > ?))");
    pageValues.push(cursor.archivedAt, cursor.archivedAt, cursor.id);
  }

  const [result, count] = await Promise.all([
    db.prepare(
      `${archivedSelect()} WHERE ${pageClauses.join(" AND ")}
       GROUP BY sops.id ORDER BY sops.archived_at DESC, sops.id ASC LIMIT ?`,
    ).bind(...pageValues, limit + 1).all<Record<string, unknown>>(),
    db.prepare(`SELECT COUNT(DISTINCT sops.id) AS total ${archivedFrom()} WHERE ${filters.clauses.join(" AND ")}`)
      .bind(...filters.values).first<{ total: number }>(),
  ]);
  const allRows = (result.results || []).map(normalizeArchived);
  const hasMore = allRows.length > limit;
  const records = allRows.slice(0, limit);
  const last = records.at(-1);
  return {
    error: "",
    records,
    total: Number(count?.total || 0),
    nextCursor: hasMore && last ? encodeCursor({ archivedAt: last.archivedAt, id: last.id }) : "",
  };
}

async function filterOptions(db: D1DatabaseBinding, workScope: ResolvedWorkScope) {
  const scope = scopeSql(workScope);
  const where = `sops.status = 'Archived' AND COALESCE(sops.is_active, 0) = 0 AND ${scope.sql}`;
  const [departments, categories, owners] = await Promise.all([
    db.prepare(`SELECT DISTINCT sub_roles.department AS value FROM sops LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id WHERE ${where} AND sub_roles.department IS NOT NULL ORDER BY lower(sub_roles.department)`).bind(...scope.values).all<{ value: string }>(),
    db.prepare(`SELECT DISTINCT categories.id, categories.name AS label FROM sops LEFT JOIN categories ON categories.id = sops.category_id WHERE ${where} AND categories.id IS NOT NULL ORDER BY lower(categories.name)`).bind(...scope.values).all<{ id: string; label: string }>(),
    db.prepare(`SELECT DISTINCT owner.id, owner.name AS label FROM sops LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id) WHERE ${where} AND owner.id IS NOT NULL ORDER BY lower(owner.name)`).bind(...scope.values).all<{ id: string; label: string }>(),
  ]);
  return {
    departments: (departments.results || []).map((row) => row.value),
    categories: categories.results || [],
    owners: owners.results || [],
  };
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Archive SOPs");
  if (auth.response || !auth.user) return auth.response;
  const resolved = await resolveCreatorWorkScope(context.env.DB!, context, auth.user);
  if (resolved.response || !resolved.subRole || !resolved.user) return resolved.response;
  const page = await queryArchived(context.env.DB!, resolved, context.request);
  if (page.error) return failure("VALIDATION_ERROR", page.error, 400);
  const id = String(new URL(context.request.url).searchParams.get("id") || "").trim();
  const canRestoreAsDraft = hasPermission(auth.user, "Edit Drafts");
  if (id) {
    const archived = page.records[0];
    if (!archived) return failure("NOT_FOUND", "Archived SOP not found for the selected role and department.", 404);
    const sop = await getSopById(context.env.DB!, id, false);
    if (!sop) return failure("NOT_FOUND", "Archived SOP not found.", 404);
    return new Response(JSON.stringify({ success: true, data: { sop: { ...sop, ...archived, status: "Archived" }, capabilities: { canRestoreAsDraft } } }), {
      headers: { "content-type": "application/json; charset=utf-8", ...cacheHeaders("private"), vary: "x-sop-sub-role" },
    });
  }
  const filters = await filterOptions(context.env.DB!, resolved);
  return new Response(JSON.stringify({ success: true, data: {
    context: { selectedSubRole: resolved.subRole, workScope: resolved.scope, workScopeLabel: resolved.label },
    capabilities: { canRestoreAsDraft },
    count: page.total,
    archivedSops: page.records,
    nextCursor: page.nextCursor,
    filters,
  } }), {
    headers: { "content-type": "application/json; charset=utf-8", ...cacheHeaders("private"), vary: "x-sop-sub-role" },
  });
};
