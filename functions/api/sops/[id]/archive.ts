import { failure, getRouteParam, readBody, success } from "../../../_shared/api";
import { requireDb } from "../../../_shared/admin";
import { requirePermission } from "../../../_shared/auth";
import { type PagesFunctionContext } from "../../../_shared/cloudflare";
import { requireSopOwnership } from "../../../_shared/ownership";
import { SopWorkflowTransitionError, transitionSop } from "../../../_shared/sop-workflow";

interface WorkflowPayload {
  versionId?: string;
  notes?: string;
  reason?: string;
}

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Archive SOPs");
  if (auth.response) return auth.response;
  const ownership = await requireSopOwnership(context, auth.user!, getRouteParam(context, "id"));
  if (ownership.response) return ownership.response;

  const [payload, parseError] = await readBody<WorkflowPayload>(context.request);
  if (parseError) return parseError;
  const reason = String(payload?.reason || payload?.notes || "").trim();
  if (reason.length < 3) return failure("VALIDATION_ERROR", "An archive reason is required.", 400, { reason: "Enter an archive reason." });
  if (reason.length > 2000) return failure("VALIDATION_ERROR", "Archive reasons must be 2,000 characters or fewer.", 400, { reason: "Shorten the archive reason." });

  try {
    const transition = await transitionSop(context.env.DB!, {
      sopId: getRouteParam(context, "id"),
      versionId: payload?.versionId,
      actorUserId: auth.user?.id,
      notes: reason,
      action: "archive",
      actorRole: auth.user?.accessLevel,
      actorDepartment: ownership.subRole?.department || auth.user?.selectedSubRole?.department || "",
    });
    if (!transition) return failure("NOT_FOUND", "SOP not found.", 404);
    return success({ transition }, "SOP archived.");
  } catch (error) {
    if (error instanceof SopWorkflowTransitionError) {
      return failure("WORKFLOW_CONFLICT", error.message, error.status);
    }
    throw error;
  }
};
