import { idFrom, readJsonBody, requireDb, slugify } from "../../_shared/admin";
import { requirePermission } from "../../_shared/auth";
import { jsonResponse, type PagesFunctionContext } from "../../_shared/cloudflare";

interface CategoryPayload {
  id?: string;
  originalSlug?: string;
  name?: string;
  slug?: string;
  description?: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
}

function categorySelect() {
  return `SELECT
    id,
    name,
    slug,
    description,
    icon,
    color,
    sort_order AS sortOrder,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM categories`;
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const { env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Categories");
  if (auth.response) return auth.response;
  const db = env.DB!;

  const result = await db.prepare(`${categorySelect()} ORDER BY sort_order ASC, name ASC`).all();
  return jsonResponse({ categories: result.results || [] });
};

export const onRequestPost = async (context: PagesFunctionContext) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Categories");
  if (auth.response) return auth.response;
  const db = env.DB!;

  const [payload, parseError] = await readJsonBody<CategoryPayload>(request);
  if (parseError) return parseError;

  const name = String(payload?.name || "").trim();
  if (!name) return jsonResponse({ error: "Category name is required." }, 400);

  const slug = slugify(String(payload?.slug || name), "category");
  const id = payload?.id || idFrom(slug, "category");

  await db.prepare(
    `INSERT INTO categories (id, name, slug, description, icon, color, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  )
    .bind(
      id,
      name,
      slug,
      String(payload?.description || ""),
      String(payload?.icon || ""),
      String(payload?.color || "#f8fafc"),
      Number(payload?.sortOrder || 0),
    )
    .run();

  const category = await db.prepare(`${categorySelect()} WHERE id = ?`).bind(id).first();
  return jsonResponse({ category }, 201);
};

export const onRequestPut = async (context: PagesFunctionContext) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Categories");
  if (auth.response) return auth.response;
  const db = env.DB!;

  const [payload, parseError] = await readJsonBody<CategoryPayload>(request);
  if (parseError) return parseError;

  const originalSlug = String(payload?.originalSlug || payload?.slug || "").trim();
  const name = String(payload?.name || "").trim();
  if (!originalSlug) return jsonResponse({ error: "originalSlug is required." }, 400);
  if (!name) return jsonResponse({ error: "Category name is required." }, 400);

  const slug = slugify(String(payload?.slug || name), "category");
  const existing = await db.prepare("SELECT id, sort_order FROM categories WHERE slug = ?")
    .bind(originalSlug)
    .first<{ id: string; sort_order: number }>();
  if (!existing) return jsonResponse({ error: "Category not found." }, 404);

  await db.prepare(
    `UPDATE categories
     SET name = ?, slug = ?, description = ?, icon = ?, color = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(
      name,
      slug,
      String(payload?.description || ""),
      String(payload?.icon || ""),
      String(payload?.color || "#f8fafc"),
      Number(payload?.sortOrder ?? existing.sort_order ?? 0),
      existing.id,
    )
    .run();

  const category = await db.prepare(`${categorySelect()} WHERE id = ?`).bind(existing.id).first();
  return jsonResponse({ category });
};

export const onRequestDelete = async (context: PagesFunctionContext) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Categories");
  if (auth.response) return auth.response;
  const db = env.DB!;

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  if (!slug) return jsonResponse({ error: "slug is required." }, 400);

  const category = await db.prepare("SELECT id FROM categories WHERE slug = ?").bind(slug).first<{ id: string }>();
  if (!category) return jsonResponse({ error: "Category not found." }, 404);

  await db.prepare("DELETE FROM categories WHERE id = ?").bind(category.id).run();
  return jsonResponse({ ok: true });
};
