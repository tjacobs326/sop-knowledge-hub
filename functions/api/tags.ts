import { cacheHeaders, failure } from "../_shared/api";
import { requireDb } from "../_shared/admin";
import { type PagesFunctionContext } from "../_shared/cloudflare";
import { listTags } from "../_shared/sop-data";

export const onRequestGet = async ({ env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;

  try {
    const tags = await listTags(env.DB!);
    return new Response(JSON.stringify({ success: true, data: { tags }, tags }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders("public"),
      },
    });
  } catch (error) {
    return failure(
      "TAGS_READ_FAILED",
      error instanceof Error ? error.message : "Unable to load tags.",
      500,
    );
  }
};
