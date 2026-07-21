import { failure, getRouteParam, readBody, success } from "../../../_shared/api";
import { requireDb } from "../../../_shared/admin";
import { requirePermission } from "../../../_shared/auth";
import { type PagesFunctionContext } from "../../../_shared/cloudflare";
import { requireSopOwnership } from "../../../_shared/ownership";
import { SopWorkflowTransitionError, transitionSop } from "../../../_shared/sop-workflow";

interface WorkflowPayload {
  versionId?: string;
  notes?: string;
}

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Request Changes");
  if (auth.response) return auth.response;
  const ownership = await requireSopOwnership(context, auth.user!, getRouteParam(context, "id"));
  if (ownership.response) return ownership.response;

  const [payload, parseError] = await readBody<WorkflowPayload>(context.request);
  if (parseError) return parseError;

  try {
    const transition = await transitionSop(context.env.DB!, {
      sopId: getRouteParam(context, "id"),
      versionId: payload?.versionId,
      actorUserId: auth.user?.id,
      notes: payload?.notes || "Changes requested.",
      action: "request-changes",
    });
    if (!transition) return failure("NOT_FOUND", "SOP not found.", 404);
    return success({ transition }, "Changes requested.");
  } catch (error) {
    if (error instanceof SopWorkflowTransitionError) {
      return failure("WORKFLOW_CONFLICT", error.message, error.status);
    }
    throw error;
  }
};
