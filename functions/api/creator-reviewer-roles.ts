import { cacheHeaders, failure } from "../_shared/api";
import { requireDb } from "../_shared/admin";
import { type PagesFunctionContext } from "../_shared/cloudflare";

export const onRequestGet = async ({ env }: PagesFunctionContext) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;

  try {
    const result = await env.DB!.prepare(
      `SELECT
        id,
        label AS name,
        slug,
        department,
        team_id AS teamId,
        description,
        sort_order AS sortOrder
       FROM creator_sub_roles
       WHERE status = 'Active'
       ORDER BY sort_order ASC, label ASC`,
    ).all();

    const roles = result.results || [];
    return new Response(JSON.stringify({ success: true, data: { roles }, roles }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders("private"),
      },
    });
  } catch (error) {
    return failure(
      "CREATOR_REVIEWER_ROLES_READ_FAILED",
      error instanceof Error ? error.message : "Unable to load Creator/Reviewer teams.",
      500,
    );
  }
};
