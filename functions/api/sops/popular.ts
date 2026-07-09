import { cacheHeaders, failure } from "../../_shared/api";
import { requireDb } from "../../_shared/admin";
import { type PagesFunctionContext } from "../../_shared/cloudflare";
import { resolveRequestedCreatorSubRole } from "../../_shared/ownership";
import { listSops } from "../../_shared/sop-data";

export const onRequestGet = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;

  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || "10");
    const selectedSubRole = await resolveRequestedCreatorSubRole(env.DB!, request);
    const sops = await listSops(env.DB!, {
      sort: "popular",
      limit,
      publicOnly: true,
      ownerSubRoleId: selectedSubRole?.id,
    });
    return new Response(JSON.stringify({ success: true, data: { sops }, sops }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders(selectedSubRole ? "private" : "public"),
        vary: "x-sop-sub-role",
      },
    });
  } catch (error) {
    return failure("POPULAR_SOPS_FAILED", error instanceof Error ? error.message : "Unable to load popular SOPs.", 500);
  }
};
