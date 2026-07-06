import { cacheHeaders, failure } from "../../_shared/api";
import { requireDb } from "../../_shared/admin";
import { type PagesFunctionContext } from "../../_shared/cloudflare";
import { listSops } from "../../_shared/sop-data";

export const onRequestGet = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;

  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || "10");
    const sops = await listSops(env.DB!, { sort: "recent", limit, publicOnly: true });
    return new Response(JSON.stringify({ success: true, data: { sops }, sops }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders("public"),
      },
    });
  } catch (error) {
    return failure("RECENT_SOPS_FAILED", error instanceof Error ? error.message : "Unable to load recent SOPs.", 500);
  }
};
