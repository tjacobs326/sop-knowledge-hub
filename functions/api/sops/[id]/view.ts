import { failure, getRouteParam, success, unixNow } from "../../../_shared/api";
import { requireDb } from "../../../_shared/admin";
import { newId, type PagesFunctionContext } from "../../../_shared/cloudflare";

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;

  const id = getRouteParam(context, "id");
  if (!id) return failure("VALIDATION_ERROR", "SOP id is required.", 400, { id: "Required" });

  const sop = await context.env.DB!.prepare("SELECT id, current_version_id FROM sops WHERE id = ?").bind(id).first<{
    id: string;
    current_version_id?: string;
  }>();
  if (!sop) return failure("NOT_FOUND", "SOP not found.", 404);

  const now = unixNow();
  await context.env.DB!.prepare("UPDATE sops SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?")
    .bind(id)
    .run();
  await context.env.DB!.prepare(
    `INSERT INTO sop_view_events (id, sop_id, sop_version_id, source, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(newId("sop-view"), id, sop.current_version_id || null, "Direct", now)
    .run();

  return success({ id }, "SOP view recorded.");
};
