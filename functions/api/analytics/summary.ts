import { requirePermission } from "../../_shared/auth";
import { jsonResponse, type PagesFunctionContext } from "../../_shared/cloudflare";

async function safeAll<T>(env: PagesFunctionContext["env"], query: string) {
  if (!env.DB) return [];
  try {
    const result = await env.DB.prepare(query).all<T>();
    return result.results || [];
  } catch {
    return [];
  }
}

async function safeFirst<T>(env: PagesFunctionContext["env"], query: string) {
  if (!env.DB) return null;
  try {
    return await env.DB.prepare(query).first<T>();
  } catch {
    return null;
  }
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const { env } = context;
  if (!env.DB) return jsonResponse({ error: "D1 database binding DB is not available." }, 503);
  const auth = await requirePermission(context, "View Analytics");
  if (auth.response) return auth.response;

  const [
    totals,
    mostViewedSops,
    mostSearchedTerms,
    noResultSearches,
    categoryCounts,
    helpfulRatings,
    mediaSummary,
    pageViews,
    pastReview,
  ] = await Promise.all([
    safeFirst<{
      page_views: number;
      sop_views: number;
      searches: number;
      uploads: number;
      feedback_count: number;
    }>(
      env,
      `SELECT
        (SELECT COUNT(*) FROM page_view_events) AS page_views,
        (SELECT COUNT(*) FROM sop_view_events) AS sop_views,
        (SELECT COUNT(*) FROM search_logs) AS searches,
        (SELECT COUNT(*) FROM media_assets WHERE status = 'Active') AS uploads,
        (SELECT COUNT(*) FROM feedback) AS feedback_count`,
    ),
    safeAll<{ sop_id: string; title: string; views: number }>(
      env,
      `SELECT sops.id AS sop_id, sops.title, COUNT(sop_view_events.id) AS views
       FROM sop_view_events
       JOIN sops ON sops.id = sop_view_events.sop_id
       GROUP BY sops.id, sops.title
       ORDER BY views DESC, sops.title ASC
       LIMIT 10`,
    ),
    safeAll<{ query: string; searches: number }>(
      env,
      `SELECT query, COUNT(*) AS searches
       FROM search_logs
       WHERE no_results = 0
       GROUP BY query
       ORDER BY searches DESC, query ASC
       LIMIT 10`,
    ),
    safeAll<{ query: string; searches: number }>(
      env,
      `SELECT query, COUNT(*) AS searches
       FROM search_logs
       WHERE no_results = 1
       GROUP BY query
       ORDER BY searches DESC, query ASC
       LIMIT 10`,
    ),
    safeAll<{ category: string; count: number }>(
      env,
      `SELECT COALESCE(categories.name, 'Uncategorized') AS category, COUNT(sops.id) AS count
       FROM sops
       LEFT JOIN categories ON categories.id = sops.category_id
       GROUP BY category
       ORDER BY count DESC, category ASC`,
    ),
    safeAll<{ rating: string; count: number }>(
      env,
      `SELECT rating, COUNT(*) AS count
       FROM feedback
       GROUP BY rating`,
    ),
    safeAll<{ asset_type: string; count: number; bytes: number }>(
      env,
      `SELECT asset_type, COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes
       FROM media_assets
       WHERE status = 'Active'
       GROUP BY asset_type
       ORDER BY count DESC`,
    ),
    safeAll<{ path: string; views: number }>(
      env,
      `SELECT path, COUNT(*) AS views
       FROM page_view_events
       GROUP BY path
       ORDER BY views DESC, path ASC
       LIMIT 10`,
    ),
    safeAll<{ id: string; title: string; review_date: string; status: string }>(
      env,
      `SELECT id, title, review_date, status
       FROM sops
       WHERE review_date IS NOT NULL
         AND review_date < DATE('now')
         AND status != 'Archived'
       ORDER BY review_date ASC
       LIMIT 20`,
    ),
  ]);

  return jsonResponse({
    source: "Cloudflare D1",
    generatedAt: new Date().toISOString(),
    totals: totals || {
      page_views: 0,
      sop_views: 0,
      searches: 0,
      uploads: 0,
      feedback_count: 0,
    },
    mostViewedSops,
    mostSearchedTerms,
    noResultSearches,
    categoryCounts,
    helpfulRatings,
    mediaSummary,
    pageViews,
    pastReview,
  });
};
