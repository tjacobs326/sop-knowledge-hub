import { cacheHeaders, failure } from "../../_shared/api";
import { requireDb } from "../../_shared/admin";
import { getAuthUser } from "../../_shared/auth";
import { type PagesFunctionContext } from "../../_shared/cloudflare";
import { resolveAuthorizedCreatorSubRole } from "../../_shared/ownership";
import { listSopFacets } from "../../_shared/sop-data";

export const onRequestGet = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;

  try {
    const user = await getAuthUser({ request, env });
    const selectedSubRole = await resolveAuthorizedCreatorSubRole(env.DB!, user, request);
    const facets = await listSopFacets(env.DB!, { ownerSubRoleId: selectedSubRole?.id });

    return new Response(JSON.stringify({ success: true, data: { facets }, facets }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders(selectedSubRole ? "private" : "public"),
        vary: "x-sop-sub-role",
      },
    });
  } catch (error) {
    return failure(
      "SEARCH_FACETS_READ_FAILED",
      error instanceof Error ? error.message : "Unable to load search filters.",
      500,
    );
  }
};
