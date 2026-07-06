import { failure, optionalText, readBody, success, unixNow } from "../../_shared/api";
import { requireDb } from "../../_shared/admin";
import { newId, type PagesFunctionContext } from "../../_shared/cloudflare";

interface SearchLogPayload {
  userId?: string;
  query?: string;
  filters?: unknown;
  resultCount?: number;
}

export const onRequestPost = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;

  const [payload, parseError] = await readBody<SearchLogPayload>(request);
  if (parseError) return parseError;

  const query = optionalText(payload?.query, 240);
  if (!query) return failure("VALIDATION_ERROR", "Search query is required.", 400, { query: "Required" });

  const resultCount = Math.max(0, Number(payload?.resultCount || 0));
  const id = newId("search");
  const now = unixNow();

  await env.DB!.prepare(
    `INSERT INTO search_logs (id, user_id, query, filters_json, results_count, no_results, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, payload?.userId || null, query, JSON.stringify(payload?.filters || {}), resultCount, resultCount === 0 ? 1 : 0, now)
    .run();

  return success({ id }, "Search logged.", 201);
};
