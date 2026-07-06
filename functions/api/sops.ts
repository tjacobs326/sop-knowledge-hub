import { requireDb } from "../_shared/admin";
import { jsonResponse, safeJsonParse, type PagesFunctionContext } from "../_shared/cloudflare";

function sopsSelect() {
  return `SELECT
    sops.id,
    sops.title,
    sops.slug,
    sops.purpose,
    sops.status,
    sops.type,
    sops.estimated_completion_time AS estimatedCompletionTime,
    sops.review_date AS reviewDate,
    sops.visibility,
    sops.source_type AS sourceType,
    sops.current_version_id AS currentVersionId,
    sops.published_at AS publishedAt,
    sops.updated_at AS updatedAt,
    categories.name AS category,
    categories.slug AS categorySlug,
    owner.name AS owner,
    teams.name AS ownerTeam,
    versions.body_markdown AS bodyMarkdown,
    versions.metadata_json AS metadataJson,
    GROUP_CONCAT(tags.name, '|') AS tagsText
  FROM sops
  LEFT JOIN categories ON categories.id = sops.category_id
  LEFT JOIN users owner ON owner.id = sops.owner_user_id
  LEFT JOIN teams ON teams.id = sops.owner_team_id
  LEFT JOIN sop_versions versions ON versions.id = sops.current_version_id
  LEFT JOIN sop_tags ON sop_tags.sop_id = sops.id
  LEFT JOIN tags ON tags.id = sop_tags.tag_id`;
}

function normalizeSop(row: Record<string, unknown>) {
  const metadata = safeJsonParse<Record<string, unknown>>(String(row.metadataJson || "{}"), {});
  return {
    ...row,
    metadata,
    metadataJson: undefined,
    tags: String(row.tagsText || "")
      .split("|")
      .filter(Boolean),
    tagsText: undefined,
  };
}

export const onRequestGet = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const db = env.DB!;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const slug = url.searchParams.get("slug");
  const categorySlug = url.searchParams.get("category");
  const q = url.searchParams.get("q")?.trim();

  const where: string[] = [];
  const values: unknown[] = [];

  if (status) {
    where.push("sops.status = ?");
    values.push(status);
  }

  if (slug) {
    where.push("sops.slug = ?");
    values.push(slug);
  }

  if (categorySlug) {
    where.push("categories.slug = ?");
    values.push(categorySlug);
  }

  if (q) {
    where.push("(sops.title LIKE ? OR sops.purpose LIKE ? OR versions.body_markdown LIKE ?)");
    values.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const result = await db.prepare(
    `${sopsSelect()}
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY sops.id
     ORDER BY sops.updated_at DESC, sops.title ASC
     LIMIT 100`,
  )
    .bind(...values)
    .all<Record<string, unknown>>();

  const sops = (result.results || []).map(normalizeSop);
  return jsonResponse(slug ? { sop: sops[0] || null } : { sops });
};
