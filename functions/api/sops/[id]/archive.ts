import { failure, getRouteParam, readBody, success } from "../../../_shared/api";
import { requireDb } from "../../../_shared/admin";
import { requirePermission } from "../../../_shared/auth";
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
  const auth = await requirePermission(context, "Archive SOPs");
  if (auth.response) return auth.response;

  const [payload, parseError] = await readBody<WorkflowPayload>(context.request);
  if (parseError) return parseError;

  const transition = await transitionSop(context.env.DB!, {
    sopId: getRouteParam(context, "id"),
    versionId: payload?.versionId,
    actorUserId: payload?.actorUserId || auth.user?.id,
    notes: payload?.notes || "Archived.",
    action: "archive",
  });
  if (!transition) return failure("NOT_FOUND", "SOP not found.", 404);
  return success({ transition }, "SOP archived.");
};
