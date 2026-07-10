import { cacheHeaders, failure } from "../_shared/api";
import { requireDb } from "../_shared/admin";
import { type PagesFunctionContext } from "../_shared/cloudflare";
import { resolveRequestedCreatorSubRole } from "../_shared/ownership";
import { listCategories } from "../_shared/sop-data";

export const onRequestGet = async ({ request, env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;

  try {
    const selectedSubRole = await resolveRequestedCreatorSubRole(env.DB!, request);
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
