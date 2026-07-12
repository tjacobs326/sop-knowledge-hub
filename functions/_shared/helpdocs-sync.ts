import { idFrom, slugify } from "./admin";
import { type D1DatabaseBinding, newId, type PlatformEnv } from "./cloudflare";

interface HelpDocsArticle {
  id?: string;
  article_id?: string;
  title?: string;
  slug?: string;
  description?: string;
  body?: string;
  html?: string;
  status?: string;
  tags?: unknown[];
  categories?: unknown[];
  category?: unknown;
  updated_at?: string;
  updatedAt?: string;
  url?: string;
}

interface SyncOptions {
  mode?: "incremental" | "full";
  limit?: number;
}

const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

export async function ensureHelpDocsTables(db: D1DatabaseBinding) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS helpdocs_sync_runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'Queued',
      mode TEXT NOT NULL DEFAULT 'incremental',
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      last_successful_sync_at TEXT,
      articles_seen INTEGER NOT NULL DEFAULT 0,
      articles_imported INTEGER NOT NULL DEFAULT 0,
      articles_deactivated INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      summary_json TEXT NOT NULL DEFAULT '{}'
    )`,
    `CREATE TABLE IF NOT EXISTS helpdocs_articles (
      helpdocs_article_id TEXT PRIMARY KEY,
      sop_id TEXT,
      slug TEXT,
      title TEXT NOT NULL,
      description TEXT,
      url TEXT,
      status TEXT NOT NULL DEFAULT 'published',
      tags_json TEXT NOT NULL DEFAULT '[]',
      categories_json TEXT NOT NULL DEFAULT '[]',
      body_hash TEXT,
      helpdocs_updated_at TEXT,
      last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS sop_normalized_metadata (
      sop_id TEXT PRIMARY KEY,
      helpdocs_article_id TEXT,
      summary TEXT,
      body_text TEXT NOT NULL DEFAULT '',
      department_json TEXT NOT NULL DEFAULT '[]',
      audience_roles_json TEXT NOT NULL DEFAULT '[]',
      intent TEXT,
      systems_json TEXT NOT NULL DEFAULT '[]',
      processes_json TEXT NOT NULL DEFAULT '[]',
      task_types_json TEXT NOT NULL DEFAULT '[]',
      topics_json TEXT NOT NULL DEFAULT '[]',
      problem_types_json TEXT NOT NULL DEFAULT '[]',
      approval_types_json TEXT NOT NULL DEFAULT '[]',
      keywords_json TEXT NOT NULL DEFAULT '[]',
      access_groups_json TEXT NOT NULL DEFAULT '[]',
      search_text TEXT NOT NULL DEFAULT '',
      taxonomy_version INTEGER NOT NULL DEFAULT 1,
      classification_status TEXT NOT NULL DEFAULT 'deterministic',
      vector_status TEXT NOT NULL DEFAULT 'not_configured',
      confidence INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
  for (const sql of statements) await db.prepare(sql).run();
}

function stripHtml(html: string) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function list(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "object" && item ? String((item as Record<string, unknown>).name || (item as Record<string, unknown>).title || (item as Record<string, unknown>).slug || "") : String(item)))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return String(value || "")
    .split(/[,|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 20);
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }
  return String(hash >>> 0);
}

function normalizeArticle(raw: HelpDocsArticle) {
  const id = String(raw.id || raw.article_id || raw.slug || "").trim();
  const title = String(raw.title || "Untitled HelpDocs Article").trim();
  const bodyHtml = String(raw.body || raw.html || "");
  const bodyText = stripHtml(bodyHtml);
  const tags = unique(list(raw.tags));
  const categories = unique([...list(raw.categories), ...list(raw.category)]);
  const status = String(raw.status || "published").toLowerCase();
  const updatedAt = String(raw.updated_at || raw.updatedAt || new Date().toISOString());
  return {
    id,
    title,
    slug: String(raw.slug || slugify(title, id || "helpdocs")).trim(),
    description: String(raw.description || "").trim(),
    bodyText,
    status,
    tags,
    categories,
    updatedAt,
    url: String(raw.url || "").trim(),
    published: status === "published" || status === "public",
  };
}

function deterministicMetadata(article: ReturnType<typeof normalizeArticle>) {
  const haystack = `${article.title} ${article.description} ${article.tags.join(" ")} ${article.categories.join(" ")} ${article.bodyText}`.toLowerCase();
  const department = haystack.includes("quality") || haystack.includes("qa")
    ? ["Quality Assurance"]
    : haystack.includes("media") || haystack.includes("video") || haystack.includes("audio")
      ? ["Multimedia"]
      : haystack.includes("project") || haystack.includes("planning")
        ? ["Project Management"]
        : haystack.includes("design") || haystack.includes("course build")
          ? ["Instructional Design"]
          : ["Instructional Technology"];
  const intent = haystack.includes("troubleshoot") || haystack.includes("error") || haystack.includes("issue")
    ? "Troubleshoot a problem"
    : haystack.includes("review") || haystack.includes("approve") || haystack.includes("qa")
      ? "Review or approve work"
      : haystack.includes("tool") || haystack.includes("system") || haystack.includes("brightspace") || haystack.includes("ivanti")
        ? "Use a system or tool"
        : "Complete a process";
  const systems = unique(["Brightspace D2L", "Ivanti", "Cengage", "Kaltura", "Nasium", "Monday.com", "AI Tools"].filter((tool) => haystack.includes(tool.toLowerCase().replace(" d2l", ""))));
  const keywords = unique([...article.tags, ...article.categories, ...article.title.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3)]).slice(0, 12);
  return {
    department,
    audienceRoles: department,
    intent,
    systems,
    processes: article.categories,
    taskTypes: ["Process"],
    topics: unique([...article.categories, ...article.tags]),
    problemTypes: intent.startsWith("Troubleshoot") ? ["Troubleshooting"] : [],
    approvalTypes: intent.startsWith("Review") ? department : [],
    keywords,
    summary: article.description || article.bodyText.slice(0, 220),
    confidence: 55,
    classificationStatus: "deterministic",
  };
}

async function classifyArticle(env: PlatformEnv, article: ReturnType<typeof normalizeArticle>) {
  const fallback = deterministicMetadata(article);
  if (!env.AI) return fallback;

  try {
    const response = await env.AI.run(AI_MODEL, {
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Classify one SOP into controlled metadata JSON. Use only values supported by the article text. Do not invent departments, tools, or SOP records.",
        },
        {
          role: "user",
          content: JSON.stringify({
            title: article.title,
            description: article.description,
            tags: article.tags,
            categories: article.categories,
            body: article.bodyText.slice(0, 6000),
            schema: {
              department: ["string"],
              audienceRoles: ["string"],
              intent: "string",
              systems: ["string"],
              processes: ["string"],
              taskTypes: ["string"],
              topics: ["string"],
              problemTypes: ["string"],
              approvalTypes: ["string"],
              keywords: ["string"],
              summary: "string",
            },
          }),
        },
      ],
      max_tokens: 700,
      temperature: 0.1,
    });
    const raw = typeof response === "string" ? response : JSON.stringify((response as Record<string, unknown>)?.response || (response as Record<string, unknown>)?.result || response);
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw) as Record<string, unknown>;
    return {
      department: unique(list(parsed.department)).length ? unique(list(parsed.department)) : fallback.department,
      audienceRoles: unique(list(parsed.audienceRoles)).length ? unique(list(parsed.audienceRoles)) : fallback.audienceRoles,
      intent: String(parsed.intent || fallback.intent).slice(0, 120),
      systems: unique(list(parsed.systems)),
      processes: unique(list(parsed.processes)).length ? unique(list(parsed.processes)) : fallback.processes,
      taskTypes: unique(list(parsed.taskTypes)).length ? unique(list(parsed.taskTypes)) : fallback.taskTypes,
      topics: unique(list(parsed.topics)).length ? unique(list(parsed.topics)) : fallback.topics,
      problemTypes: unique(list(parsed.problemTypes)),
      approvalTypes: unique(list(parsed.approvalTypes)),
      keywords: unique(list(parsed.keywords)).length ? unique(list(parsed.keywords)) : fallback.keywords,
      summary: String(parsed.summary || fallback.summary).slice(0, 500),
      confidence: 80,
      classificationStatus: "ai_validated",
    };
  } catch {
    return { ...fallback, classificationStatus: "needs_review", confidence: 35 };
  }
}

async function helpdocsGet(env: PlatformEnv, pathname: string, params: Record<string, string | number>) {
  const apiKey = env.HELPDOCS_API_KEY;
  if (!apiKey) throw new Error("HELPDOCS_API_KEY Worker secret is not configured.");
  const url = new URL(`https://api.helpdocs.io/v1/${pathname}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`HelpDocs ${pathname} failed with ${response.status}.`);
  return response.json() as Promise<Record<string, unknown>>;
}

function extractArticles(payload: Record<string, unknown>) {
  const candidates = [payload.articles, payload.article, payload.data, payload.results].find(Array.isArray);
  return (Array.isArray(candidates) ? candidates : []) as HelpDocsArticle[];
}

async function upsertArticle(db: D1DatabaseBinding, env: PlatformEnv, raw: HelpDocsArticle) {
  const article = normalizeArticle(raw);
  if (!article.id) return { imported: false, deactivated: false };
  const now = new Date().toISOString();
  const sopId = idFrom(`helpdocs-${article.id}`, "sop");
  const versionId = idFrom(`helpdocs-${article.id}-current`, "sop-version");
  const categoryName = article.categories[0] || "HelpDocs";
  const categoryId = idFrom(categoryName, "category");
  const metadata = await classifyArticle(env, article);
  const searchText = [article.title, metadata.summary, metadata.intent, metadata.department.join(" "), metadata.systems.join(" "), metadata.topics.join(" "), article.bodyText].join(" ");

  await db.prepare("INSERT OR IGNORE INTO categories (id, name, slug, description, sort_order) VALUES (?, ?, ?, ?, ?)").bind(
    categoryId,
    categoryName,
    slugify(categoryName, categoryId),
    "Imported from HelpDocs.",
    500,
  ).run();

  await db
    .prepare(
      `INSERT INTO sops (
        id, title, slug, purpose, summary, category_id, status, type, current_version_id, visibility, source_type, is_active, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        purpose = excluded.purpose,
        summary = excluded.summary,
        category_id = excluded.category_id,
        status = excluded.status,
        current_version_id = excluded.current_version_id,
        is_active = excluded.is_active,
        updated_at = excluded.updated_at`,
    )
    .bind(
      sopId,
      article.title,
      `helpdocs-${article.slug}-${article.id}`.slice(0, 180),
      metadata.summary || article.description || article.title,
      metadata.summary,
      categoryId,
      article.published ? "Published" : "Archived",
      "Process",
      versionId,
      "Internal",
      "Imported",
      article.published ? 1 : 0,
      article.published ? article.updatedAt : null,
      now,
      now,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO sop_versions (
        id, sop_id, version_label, version_number, title, purpose, body_markdown, content, summary, metadata_json, status, created_at, updated_at, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        purpose = excluded.purpose,
        body_markdown = excluded.body_markdown,
        content = excluded.content,
        summary = excluded.summary,
        metadata_json = excluded.metadata_json,
        status = excluded.status,
        updated_at = excluded.updated_at,
        published_at = excluded.published_at`,
    )
    .bind(
      versionId,
      sopId,
      "1.0",
      "1.0",
      article.title,
      metadata.summary || article.description || article.title,
      article.bodyText,
      article.bodyText,
      metadata.summary,
      JSON.stringify({ tools: metadata.systems, audience: metadata.audienceRoles, helpdocsArticleId: article.id }),
      article.published ? "Published" : "Archived",
      now,
      Math.floor(Date.now() / 1000),
      article.published ? Math.floor(Date.parse(article.updatedAt) / 1000) : null,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO helpdocs_articles (
        helpdocs_article_id, sop_id, slug, title, description, url, status, tags_json, categories_json, body_hash, helpdocs_updated_at, last_synced_at, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(helpdocs_article_id) DO UPDATE SET
        sop_id = excluded.sop_id,
        slug = excluded.slug,
        title = excluded.title,
        description = excluded.description,
        url = excluded.url,
        status = excluded.status,
        tags_json = excluded.tags_json,
        categories_json = excluded.categories_json,
        body_hash = excluded.body_hash,
        helpdocs_updated_at = excluded.helpdocs_updated_at,
        last_synced_at = excluded.last_synced_at,
        is_active = excluded.is_active`,
    )
    .bind(article.id, sopId, article.slug, article.title, article.description, article.url, article.status, JSON.stringify(article.tags), JSON.stringify(article.categories), hashText(article.bodyText), article.updatedAt, now, article.published ? 1 : 0)
    .run();

  await db
    .prepare(
      `INSERT INTO sop_normalized_metadata (
        sop_id, helpdocs_article_id, summary, body_text, department_json, audience_roles_json, intent, systems_json,
        processes_json, task_types_json, topics_json, problem_types_json, approval_types_json, keywords_json,
        access_groups_json, search_text, taxonomy_version, classification_status, vector_status, confidence, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sop_id) DO UPDATE SET
        helpdocs_article_id = excluded.helpdocs_article_id,
        summary = excluded.summary,
        body_text = excluded.body_text,
        department_json = excluded.department_json,
        audience_roles_json = excluded.audience_roles_json,
        intent = excluded.intent,
        systems_json = excluded.systems_json,
        processes_json = excluded.processes_json,
        task_types_json = excluded.task_types_json,
        topics_json = excluded.topics_json,
        problem_types_json = excluded.problem_types_json,
        approval_types_json = excluded.approval_types_json,
        keywords_json = excluded.keywords_json,
        search_text = excluded.search_text,
        classification_status = excluded.classification_status,
        confidence = excluded.confidence,
        updated_at = excluded.updated_at`,
    )
    .bind(
      sopId,
      article.id,
      metadata.summary,
      article.bodyText.slice(0, 15000),
      JSON.stringify(metadata.department),
      JSON.stringify(metadata.audienceRoles),
      metadata.intent,
      JSON.stringify(metadata.systems),
      JSON.stringify(metadata.processes),
      JSON.stringify(metadata.taskTypes),
      JSON.stringify(metadata.topics),
      JSON.stringify(metadata.problemTypes),
      JSON.stringify(metadata.approvalTypes),
      JSON.stringify(metadata.keywords),
      JSON.stringify(["normal-users"]),
      searchText.slice(0, 20000),
      1,
      metadata.classificationStatus,
      "not_configured",
      metadata.confidence,
      now,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO sop_search_documents (
        sop_id, title, category, owner, status, tags_text, tools_text, audience_text, body_text, search_text, last_indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sop_id) DO UPDATE SET
        title = excluded.title,
        category = excluded.category,
        status = excluded.status,
        tags_text = excluded.tags_text,
        tools_text = excluded.tools_text,
        audience_text = excluded.audience_text,
        body_text = excluded.body_text,
        search_text = excluded.search_text,
        last_indexed_at = excluded.last_indexed_at`,
    )
    .bind(sopId, article.title, categoryName, metadata.department[0] || "HelpDocs", article.published ? "Published" : "Archived", article.tags.join(" "), metadata.systems.join(" "), metadata.audienceRoles.join(" "), article.bodyText.slice(0, 15000), searchText.slice(0, 20000), now)
    .run();

  return { imported: article.published, deactivated: !article.published };
}

export async function runHelpDocsSync(db: D1DatabaseBinding, env: PlatformEnv, options: SyncOptions = {}) {
  await ensureHelpDocsTables(db);
  const runId = newId("helpdocs-sync");
  const mode = options.mode || "incremental";
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO helpdocs_sync_runs (id, status, mode, started_at) VALUES (?, ?, ?, ?)").bind(runId, "Running", mode, now).run();

  let seen = 0;
  let imported = 0;
  let deactivated = 0;
  try {
    const limit = Math.max(1, Math.min(Number(options.limit || 100), 100));
    for (let page = 1; page <= 20; page += 1) {
      const payload = await helpdocsGet(env, "article", { include_body: "true", limit, page });
      const articles = extractArticles(payload);
      if (!articles.length) break;
      for (const raw of articles) {
        seen += 1;
        const result = await upsertArticle(db, env, raw);
        if (result.imported) imported += 1;
        if (result.deactivated) deactivated += 1;
      }
      if (articles.length < limit) break;
    }
    const completedAt = new Date().toISOString();
    await db
      .prepare(
        `UPDATE helpdocs_sync_runs
         SET status = 'Completed', completed_at = ?, last_successful_sync_at = ?, articles_seen = ?,
          articles_imported = ?, articles_deactivated = ?, summary_json = ?
         WHERE id = ?`,
      )
      .bind(completedAt, completedAt, seen, imported, deactivated, JSON.stringify({ mode, vectorize: "not_configured" }), runId)
      .run();
    return { runId, status: "Completed", articlesSeen: seen, articlesImported: imported, articlesDeactivated: deactivated };
  } catch (error) {
    await db
      .prepare(
        `UPDATE helpdocs_sync_runs
         SET status = 'Failed', completed_at = ?, articles_seen = ?, articles_imported = ?, articles_deactivated = ?, error_message = ?
         WHERE id = ?`,
      )
      .bind(new Date().toISOString(), seen, imported, deactivated, error instanceof Error ? error.message : "HelpDocs sync failed.", runId)
      .run();
    throw error;
  }
}

export async function latestHelpDocsSyncStatus(db: D1DatabaseBinding) {
  await ensureHelpDocsTables(db);
  return await db
    .prepare(
      `SELECT id, status, mode, started_at AS startedAt, completed_at AS completedAt,
        last_successful_sync_at AS lastSuccessfulSyncAt, articles_seen AS articlesSeen,
        articles_imported AS articlesImported, articles_deactivated AS articlesDeactivated,
        error_message AS errorMessage, summary_json AS summaryJson
       FROM helpdocs_sync_runs
       ORDER BY started_at DESC
       LIMIT 1`,
    )
    .first<Record<string, unknown>>();
}
