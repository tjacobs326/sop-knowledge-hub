import { failure, getRouteParam, readBody, requireRole, success } from "../../../_shared/api";
import { requireDb } from "../../../_shared/admin";
import { type PagesFunctionContext } from "../../../_shared/cloudflare";
import { transitionSop } from "../../../_shared/sop-workflow";

interface WorkflowPayload {
  versionId?: string;
  actorUserId?: string;
  notes?: string;
}

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const forbidden = requireRole(context.request, ["creator", "admin"]);
  if (forbidden) return forbidden;

  const [payload, parseError] = await readBody<WorkflowPayload>(context.request);
  if (parseError) return parseError;

  const transition = await transitionSop(context.env.DB!, {
    sopId: getRouteParam(context, "id"),
    versionId: payload?.versionId,
    actorUserId: payload?.actorUserId,
    notes: payload?.notes || "Published.",
    action: "publish",
  });
  if (!transition) return failure("NOT_FOUND", "SOP not found.", 404);
  return success({ transition }, "SOP published.");
};
