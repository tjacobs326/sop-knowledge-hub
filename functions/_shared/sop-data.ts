import { safeJsonParse, type D1DatabaseBinding } from "./cloudflare";

export interface SopFilters {
  search?: string;
  category?: string;
  categoryId?: string;
  tag?: string;
  tool?: string;
  owner?: string;
  status?: string;
  sort?: string;
  limit?: number;
  offset?: number;
  publicOnly?: boolean;
}

const publishedStatus = "Published";

function normalizeLimit(value: number | undefined) {
  if (!Number.isFinite(value || NaN)) return 100;
  return Math.max(1, Math.min(Number(value), 100));
}

function normalizeOffset(value: number | undefined) {
  if (!Number.isFinite(value || NaN)) return 0;
  return Math.max(0, Number(value));
}

function sopSelect() {
  return `SELECT
    sops.id,
    sops.title,
    sops.slug,
    COALESCE(sops.summary, sops.purpose) AS summary,
    sops.purpose,
    sops.status,
    sops.type,
    sops.estimated_completion_time AS estimatedCompletionTime,
    sops.estimated_minutes AS estimatedMinutes,
    sops.review_date AS reviewDate,
    sops.review_due_at AS reviewDueAt,
    sops.visibility,
    sops.source_type AS sourceType,
    sops.current_version_id AS currentVersionId,
    sops.published_at AS publishedAt,
    sops.updated_at AS updatedAt,
    sops.view_count AS viewCount,
    sops.helpful_count AS helpfulCount,
    sops.not_helpful_count AS notHelpfulCount,
    categories.id AS categoryId,
    categories.name AS category,
    categories.slug AS categorySlug,
    owner.id AS ownerId,
    owner.name AS owner,
    sops.owner_sub_role_id AS ownerSubRoleId,
    sub_roles.label AS ownerSubRole,
    sub_roles.department AS ownerDepartment,
    teams.name AS ownerTeam,
    versions.id AS versionId,
    COALESCE(versions.version_number, versions.version_label) AS versionNumber,
    versions.title AS versionTitle,
    versions.summary AS versionSummary,
    COALESCE(versions.content, versions.body_markdown) AS content,
    versions.body_markdown AS bodyMarkdown,
    versions.before_you_begin AS beforeYouBegin,
    versions.checklist,
    versions.troubleshooting,
    versions.change_summary AS changeSummary,
    versions.status AS versionStatus,
    versions.metadata_json AS metadataJson,
    GROUP_CONCAT(DISTINCT tags.name) AS tagsCsv
  FROM sops
  LEFT JOIN categories ON categories.id = sops.category_id
  LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
  LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id
  LEFT JOIN teams ON teams.id = sops.owner_team_id
  LEFT JOIN sop_versions versions ON versions.id = sops.current_version_id
  LEFT JOIN sop_tags ON sop_tags.sop_id = sops.id
  LEFT JOIN tags ON tags.id = sop_tags.tag_id`;
}

function splitCsv(value: unknown) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeSop(row: Record<string, unknown>) {
  const metadata = safeJsonParse<Record<string, unknown>>(String(row.metadataJson || "{}"), {});
  const tools = Array.isArray(metadata.tools) ? metadata.tools.map(String) : [];
  const audience = Array.isArray(metadata.audience) ? metadata.audience.map(String) : [];
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    purpose: row.purpose,
    categoryId: row.categoryId,
    category: row.category,
    categorySlug: row.categorySlug,
    ownerId: row.ownerId,
    owner: row.owner,
    ownerSubRoleId: row.ownerSubRoleId,
    ownerSubRole: row.ownerSubRole,
    ownerDepartment: row.ownerDepartment,
    ownerTeam: row.ownerTeam,
    status: row.status,
    type: row.type,
    estimatedCompletionTime: row.estimatedCompletionTime,
    estimatedMinutes: row.estimatedMinutes,
    audience,
    tools,
    tags: splitCsv(row.tagsCsv),
    currentVersionId: row.currentVersionId,
    version: {
      id: row.versionId,
      number: row.versionNumber,
      title: row.versionTitle,
      summary: row.versionSummary,
      content: row.content || row.bodyMarkdown,
      beforeYouBegin: row.beforeYouBegin,
      checklist: row.checklist,
      troubleshooting: row.troubleshooting,
      changeSummary: row.changeSummary,
      status: row.versionStatus,
      metadata,
    },
    bodyMarkdown: row.bodyMarkdown || row.content,
    metadata,
    reviewDate: row.reviewDate,
    reviewDueAt: row.reviewDueAt,
    visibility: row.visibility,
    sourceType: row.sourceType,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    viewCount: Number(row.viewCount || 0),
    helpfulCount: Number(row.helpfulCount || 0),
    notHelpfulCount: Number(row.notHelpfulCount || 0),
  };
}

function addFilters(filters: SopFilters) {
  const where: string[] = [];
  const values: unknown[] = [];

  if (filters.publicOnly !== false) {
    where.push("sops.status = ?");
    values.push(publishedStatus);
    where.push("COALESCE(sops.is_active, 1) = 1");
  } else if (filters.status) {
    where.push("(sops.status = ? OR lower(sops.status) = lower(?))");
    values.push(filters.status, filters.status);
  }

  if (filters.categoryId) {
    where.push("sops.category_id = ?");
    values.push(filters.categoryId);
  }

  if (filters.category) {
    where.push("(categories.slug = ? OR categories.name = ?)");
    values.push(filters.category, filters.category);
  }

  if (filters.owner) {
    where.push("(owner.id = ? OR owner.name = ?)");
    values.push(filters.owner, filters.owner);
  }

  if (filters.tag) {
    where.push(
      `EXISTS (
        SELECT 1 FROM sop_tags st
        JOIN tags tag_filter ON tag_filter.id = st.tag_id
        WHERE st.sop_id = sops.id AND (tag_filter.slug = ? OR tag_filter.name = ?)
      )`,
    );
    values.push(filters.tag, filters.tag);
  }

  if (filters.tool) {
    where.push("versions.metadata_json LIKE ?");
    values.push(`%${filters.tool}%`);
  }

  if (filters.search) {
    where.push(
      `(sops.title LIKE ? OR sops.purpose LIKE ? OR sops.summary LIKE ? OR versions.body_markdown LIKE ? OR versions.content LIKE ?)`,
    );
    const q = `%${filters.search}%`;
    values.push(q, q, q, q, q);
  }

  return { where, values };
}

function orderBy(sort?: string) {
  switch (sort) {
    case "popular":
      return "ORDER BY COALESCE(sops.view_count, 0) DESC, sops.title ASC";
    case "title":
      return "ORDER BY sops.title ASC";
    case "oldest":
      return "ORDER BY sops.updated_at ASC, sops.title ASC";
    case "recent":
    default:
      return "ORDER BY sops.updated_at DESC, sops.title ASC";
  }
}

export async function listSops(db: D1DatabaseBinding, filters: SopFilters = {}) {
  const { where, values } = addFilters(filters);
  const limit = normalizeLimit(filters.limit);
  const offset = normalizeOffset(filters.offset);
  const sql = `${sopSelect()}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY sops.id
    ${orderBy(filters.sort)}
    LIMIT ? OFFSET ?`;

  const result = await db.prepare(sql).bind(...values, limit, offset).all<Record<string, unknown>>();
  return (result.results || []).map(normalizeSop);
}

export async function countSops(db: D1DatabaseBinding, filters: SopFilters = {}) {
  const { where, values } = addFilters(filters);
  const result = await db
    .prepare(
      `SELECT COUNT(DISTINCT sops.id) AS total
       FROM sops
       LEFT JOIN categories ON categories.id = sops.category_id
       LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
       LEFT JOIN sop_versions versions ON versions.id = sops.current_version_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
    )
    .bind(...values)
    .first<{ total: number }>();
  return Number(result?.total || 0);
}

export async function getSopById(db: D1DatabaseBinding, id: string, publicOnly = true) {
  if (!id) return null;
  const row = await db
    .prepare(
      `${sopSelect()}
       WHERE sops.id = ? ${publicOnly ? "AND sops.status = ? AND COALESCE(sops.is_active, 1) = 1" : ""}
       GROUP BY sops.id
       LIMIT 1`,
    )
    .bind(...(publicOnly ? [id, publishedStatus] : [id]))
    .first<Record<string, unknown>>();
  return row ? normalizeSop(row) : null;
}

export async function getSopBySlug(db: D1DatabaseBinding, slug: string, publicOnly = true) {
  const row = await db
    .prepare(
      `${sopSelect()}
       WHERE sops.slug = ? ${publicOnly ? "AND sops.status = ? AND COALESCE(sops.is_active, 1) = 1" : ""}
       GROUP BY sops.id
       LIMIT 1`,
    )
    .bind(...(publicOnly ? [slug, publishedStatus] : [slug]))
    .first<Record<string, unknown>>();
  return row ? normalizeSop(row) : null;
}

export async function listCategories(db: D1DatabaseBinding) {
  const result = await db
    .prepare(
      `SELECT
        categories.id,
        categories.name,
        categories.slug,
        categories.description,
        categories.icon,
        categories.color,
        categories.is_active AS isActive,
        COUNT(DISTINCT sops.id) AS sopCount
      FROM categories
      LEFT JOIN sops ON sops.category_id = categories.id
        AND sops.status = ?
        AND COALESCE(sops.is_active, 1) = 1
      WHERE COALESCE(categories.is_active, 1) = 1
      GROUP BY categories.id
      ORDER BY categories.sort_order ASC, categories.name ASC`,
    )
    .bind(publishedStatus)
    .all<Record<string, unknown>>();
  return result.results || [];
}

export async function listTags(db: D1DatabaseBinding) {
  const result = await db
    .prepare(
      `SELECT
        tags.id,
        tags.name,
        tags.slug,
        tags.is_active AS isActive,
        COUNT(DISTINCT sops.id) AS sopCount
      FROM tags
      LEFT JOIN sop_tags ON sop_tags.tag_id = tags.id
      LEFT JOIN sops ON sops.id = sop_tags.sop_id
        AND sops.status = ?
        AND COALESCE(sops.is_active, 1) = 1
      WHERE COALESCE(tags.is_active, 1) = 1
      GROUP BY tags.id
      ORDER BY tags.name ASC`,
    )
    .bind(publishedStatus)
    .all<Record<string, unknown>>();
  return result.results || [];
}
