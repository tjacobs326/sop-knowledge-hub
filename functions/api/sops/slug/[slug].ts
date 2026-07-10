import { cacheHeaders, failure, getRouteParam, roleFromRequest } from "../../../_shared/api";
import { requireDb } from "../../../_shared/admin";
import { type PagesFunctionContext } from "../../../_shared/cloudflare";
import { resolveRequestedCreatorSubRole } from "../../../_shared/ownership";
import { getSopBySlug } from "../../../_shared/sop-data";

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;

  const slug = getRouteParam(context, "slug");
  const publicOnly = roleFromRequest(context.request) === "normal";
  const sop = await getSopBySlug(context.env.DB!, slug, publicOnly);
  if (!sop) return failure("NOT_FOUND", "SOP not found.", 404);
  const selectedSubRole = await resolveRequestedCreatorSubRole(context.env.DB!, context.request);
  if (selectedSubRole && sop.ownerSubRoleId !== selectedSubRole.id) {
    return failure(
      "SOP_OWNERSHIP_REQUIRED",
      "This SOP belongs to another department. Switch back to Normal User mode to view it without creator/reviewer controls.",
      403,
    );
  }

  return new Response(JSON.stringify({ success: true, data: { sop }, sop }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...cacheHeaders(selectedSubRole || !publicOnly ? "private" : "public"),
      vary: "x-sop-sub-role",
    },
  });
};
