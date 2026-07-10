import { cacheHeaders, failure } from "../_shared/api";
import { requireDb } from "../_shared/admin";
import { type PagesFunctionContext } from "../_shared/cloudflare";
import { getAuthUser } from "../_shared/auth";
import { resolveAuthorizedCreatorSubRole } from "../_shared/ownership";
import { listCategories } from "../_shared/sop-data";

export const onRequestGet = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;

  try {
    const user = await getAuthUser({ request, env });
    const selectedSubRole = await resolveAuthorizedCreatorSubRole(env.DB!, user, request);
    const categories = await listCategories(env.DB!, { ownerSubRoleId: selectedSubRole?.id });
    return new Response(JSON.stringify({ success: true, data: { categories }, categories }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders(selectedSubRole ? "private" : "public"),
        vary: "x-sop-sub-role",
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
