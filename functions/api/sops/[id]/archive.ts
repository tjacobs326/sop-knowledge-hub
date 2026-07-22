import { failure, getRouteParam, readBody, success } from "../../../_shared/api";
import { requireDb } from "../../../_shared/admin";
import { requirePermission } from "../../../_shared/auth";
import { type PagesFunctionContext } from "../../../_shared/cloudflare";
import { requireSopOwnership } from "../../../_shared/ownership";
import { SopWorkflowTransitionError, transitionSop } from "../../../_shared/sop-workflow";

interface WorkflowPayload {
  versionId?: string;
  actorUserId?: string;
  reason?: string;
  notes?: string;
  replacementSopId?: string;
}

const archiveReasons = new Set([
  "Process retired",
  "Replaced by another SOP",
  "Duplicate SOP",
  "Tool or system discontinued",
  "Department no longer owns the process",
  "Temporarily inactive",
  "Outdated content",
  "Other",
]);

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Archive SOPs");
  if (auth.response) return auth.response;
  const ownership = await requireSopOwnership(context, auth.user!, getRouteParam(context, "id"));
  if (ownership.response) return ownership.response;

  const [payload, parseError] = await readBody<WorkflowPayload>(context.request);
  if (parseError) return parseError;
  const reason = String(payload?.reason || "").trim();
  const fields: Record<string, string> = {};
  if (!archiveReasons.has(reason)) fields.reason = "Select an archive reason.";
  if (reason === "Replaced by another SOP" && !payload?.replacementSopId) {
    fields.replacementSopId = "Select the replacement SOP.";
  }
  if (Object.keys(fields).length) {
    return failure("VALIDATION_ERROR", "Archive reason is required before archiving an SOP.", 400, fields);
  }

  try {
    const transition = await transitionSop(context.env.DB!, {
      sopId: getRouteParam(context, "id"),
      versionId: payload?.versionId,
      actorUserId: payload?.actorUserId || auth.user?.id,
      notes: payload?.notes || reason,
      archiveReason: reason,
      replacementSopId: payload?.replacementSopId,
      action: "archive",
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
