import { cacheHeaders, failure } from "../_shared/api";
import { requireDb } from "../_shared/admin";
import { type PagesFunctionContext } from "../_shared/cloudflare";
import { listCategories } from "../_shared/sop-data";

export const onRequestGet = async ({ env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;

  try {
    const categories = await listCategories(env.DB!);
    return new Response(JSON.stringify({ success: true, data: { categories }, categories }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders("public"),
      },
    });
  } catch (error) {
    return failure(
      "CATEGORIES_READ_FAILED",
      error instanceof Error ? error.message : "Unable to load categories.",
      500,
    );
  }
};
