import { failure, getRouteParam, optionalText, readBody, success, unixNow } from "../../../_shared/api";
import { requireDb } from "../../../_shared/admin";
import { newId, type PagesFunctionContext } from "../../../_shared/cloudflare";

interface FeedbackPayload {
  userId?: string;
  isHelpful?: boolean;
  comment?: string;
}

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;

  const [payload, parseError] = await readBody<FeedbackPayload>(context.request);
  if (parseError) return parseError;

  const id = getRouteParam(context, "id");
  if (!id) return failure("VALIDATION_ERROR", "SOP id is required.", 400, { id: "Required" });
  if (typeof payload?.isHelpful !== "boolean") {
    return failure("VALIDATION_ERROR", "Feedback must specify whether the SOP was helpful.", 400, {
      isHelpful: "Required",
    });
  }

  const sop = await context.env.DB!.prepare("SELECT id FROM sops WHERE id = ?").bind(id).first();
  if (!sop) return failure("NOT_FOUND", "SOP not found.", 404);

  const feedbackId = newId("feedback");
  const now = unixNow();
  const helpful = payload.isHelpful ? 1 : 0;

  await context.env.DB!.prepare(
    `INSERT INTO sop_feedback (id, sop_id, user_id, is_helpful, comment, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(feedbackId, id, payload.userId || null, helpful, optionalText(payload.comment, 1000), now)
    .run();

  await context.env.DB!.prepare(
    `UPDATE sops
     SET helpful_count = COALESCE(helpful_count, 0) + ?,
         not_helpful_count = COALESCE(not_helpful_count, 0) + ?
     WHERE id = ?`,
  )
    .bind(helpful ? 1 : 0, helpful ? 0 : 1, id)
    .run();

  return success({ id: feedbackId }, "Feedback saved.", 201);
};
