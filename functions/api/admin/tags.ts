import { idFrom, readJsonBody, requireDb, slugify } from "../../_shared/admin";
import { jsonResponse, type PagesFunctionContext } from "../../_shared/cloudflare";

interface TagPayload {
  id?: string;
  originalName?: string;
  name?: string;
  slug?: string;
  status?: "Active" | "Needs Review" | "Deprecated";
  notes?: string;
}

const allowedStatuses = new Set(["Active", "Needs Review", "Deprecated"]);

function tagSelect() {
  return `SELECT
    tags.id,
    tags.name,
    tags.slug,
    tags.status,
    tags.notes,
    tags.created_at AS createdAt,
    tags.updated_at AS updatedAt,
    COUNT(sop_tags.sop_id) AS usageCount
  FROM tags
  LEFT JOIN sop_tags ON sop_tags.tag_id = tags.id`;
}

export const onRequestGet = async ({ env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const db = env.DB!;

  const result = await db.prepare(
    `${tagSelect()}
     GROUP BY tags.id
     ORDER BY tags.name ASC`,
  ).all();
  return jsonResponse({ tags: result.results || [] });
};

export const onRequestPost = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const db = env.DB!;

  const [payload, parseError] = await readJsonBody<TagPayload>(request);
  if (parseError) return parseError;

  const name = String(payload?.name || "").trim();
  if (!name) return jsonResponse({ error: "Tag name is required." }, 400);

  const slug = slugify(String(payload?.slug || name), "tag");
  const status = allowedStatuses.has(String(payload?.status)) ? payload?.status : "Active";
  const id = payload?.id || idFrom(slug, "tag");

  await db.prepare(
    `INSERT INTO tags (id, name, slug, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  )
    .bind(id, name, slug, status, String(payload?.notes || ""))
    .run();

  const tag = await db.prepare(`${tagSelect()} WHERE tags.id = ? GROUP BY tags.id`).bind(id).first();
  return jsonResponse({ tag }, 201);
};

export const onRequestPut = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const db = env.DB!;

  const [payload, parseError] = await readJsonBody<TagPayload>(request);
  if (parseError) return parseError;

  const originalName = String(payload?.originalName || payload?.name || "").trim();
  const name = String(payload?.name || "").trim();
  if (!originalName) return jsonResponse({ error: "originalName is required." }, 400);
  if (!name) return jsonResponse({ error: "Tag name is required." }, 400);

  const status = allowedStatuses.has(String(payload?.status)) ? payload?.status : "Active";
  const slug = slugify(String(payload?.slug || name), "tag");
  const existing = await db.prepare("SELECT id FROM tags WHERE name = ?").bind(originalName).first<{ id: string }>();
  if (!existing) return jsonResponse({ error: "Tag not found." }, 404);

  await db.prepare(
    `UPDATE tags
     SET name = ?, slug = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(name, slug, status, String(payload?.notes || ""), existing.id)
    .run();

  const tag = await db.prepare(`${tagSelect()} WHERE tags.id = ? GROUP BY tags.id`).bind(existing.id).first();
  return jsonResponse({ tag });
};

export const onRequestDelete = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const db = env.DB!;

  const name = new URL(request.url).searchParams.get("name");
  if (!name) return jsonResponse({ error: "name is required." }, 400);

  const tag = await db.prepare("SELECT id FROM tags WHERE name = ?").bind(name).first<{ id: string }>();
  if (!tag) return jsonResponse({ error: "Tag not found." }, 404);

  await db.prepare("DELETE FROM tags WHERE id = ?").bind(tag.id).run();
  return jsonResponse({ ok: true });
};
