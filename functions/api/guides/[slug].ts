import { cacheHeaders, failure } from "../../_shared/api";
import { requireDb } from "../../_shared/admin";
import { getDecisionGuide } from "../../_shared/decision-guides";
import { type PagesFunctionContext } from "../../_shared/cloudflare";

function routeParam(context: PagesFunctionContext, key: string) {
  const params = (context as PagesFunctionContext & { params?: Record<string, string | string[]> }).params;
  const value = params?.[key];
  return Array.isArray(value) ? value[0] : value || "";
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;

  try {
    const slug = routeParam(context, "slug");
    const guide = await getDecisionGuide(context.env.DB!, slug);
    if (!guide) return failure("GUIDE_NOT_FOUND", "Decision guide not found.", 404);

    return new Response(JSON.stringify({ success: true, data: { guide }, guide }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders("public"),
      },
    });
  } catch (error) {
    return failure(
      "GUIDE_READ_FAILED",
      error instanceof Error ? error.message : "Unable to load decision guide.",
      500,
    );
  }
};
