import { cacheHeaders, failure } from "../../_shared/api";
import { requireDb } from "../../_shared/admin";
import { getAuthUser } from "../../_shared/auth";
import { type PagesFunctionContext } from "../../_shared/cloudflare";
import { resolveAuthorizedCreatorSubRole } from "../../_shared/ownership";
import { listSops } from "../../_shared/sop-data";

export const onRequestGet = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;

  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || "10");
    const user = await getAuthUser({ request, env });
    const selectedSubRole = await resolveAuthorizedCreatorSubRole(env.DB!, user, request);
    const sops = await listSops(env.DB!, {
      sort: "recent",
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
    return failure("RECENT_SOPS_FAILED", error instanceof Error ? error.message : "Unable to load recent SOPs.", 500);
  }
};
