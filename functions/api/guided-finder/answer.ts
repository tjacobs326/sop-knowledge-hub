import { failure, readBody, success } from "../../_shared/api";
import { requireDb } from "../../_shared/admin";
import { type PagesFunctionContext } from "../../_shared/cloudflare";
import {
  authorizedPublishedSops,
  canUseGuidedFinder,
  ensureGuidedFinderTables,
  parseSessionAnswers,
  readGuidedFinderSession,
  resolveGuidedFinderState,
  updateGuidedFinderSession,
  type GuidedFinderDimension,
} from "../../_shared/guided-finder-adaptive";

interface AnswerPayload {
  sessionId?: string;
  dimension?: GuidedFinderDimension;
  value?: string;
}

const allowedDimensions = new Set([
  "department",
  "intent",
  "systemOrTool",
  "process",
  "taskType",
  "topic",
  "problemType",
  "approvalType",
]);

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const [payload, parseError] = await readBody<AnswerPayload>(context.request);
  if (parseError) return parseError;

  const sessionId = String(payload?.sessionId || "").trim();
  const dimension = String(payload?.dimension || "").trim() as GuidedFinderDimension;
  const value = String(payload?.value || "").trim().slice(0, 160);
  if (!sessionId || !dimension || !value || !allowedDimensions.has(dimension)) {
    return failure("INVALID_GUIDED_FINDER_ANSWER", "Send a valid sessionId, dimension, and value.", 400);
  }

  try {
    await ensureGuidedFinderTables(context.env.DB!);
    const row = await readGuidedFinderSession(context.env.DB!, sessionId);
    if (!row) return failure("GUIDED_FINDER_SESSION_NOT_FOUND", "Start a new Guided Finder session.", 404);

    const { user, sops } = await authorizedPublishedSops(context);
    if (!canUseGuidedFinder(user)) {
      return failure("FORBIDDEN", "You do not have permission to use Guided Finder.", 403);
    }

    const previousAnswers = parseSessionAnswers(row);
    const answers = { ...previousAnswers, [dimension]: value };
    const step = Math.min(Object.keys(answers).length + 1, 5);
    const state = resolveGuidedFinderState(sessionId, sops, answers, step);
    await updateGuidedFinderSession(
      context.env.DB!,
      sessionId,
      answers,
      state.step,
      state.candidateCount,
      state.nextAction === "recover" ? "no_results" : state.nextAction === "show_results" ? "completed" : "active",
    );

    return success({
      ...state,
      sourcePolicy: "Candidates are recalculated from D1 after every answer.",
    });
  } catch (error) {
    return failure("GUIDED_FINDER_ANSWER_FAILED", error instanceof Error ? error.message : "Unable to record Guided Finder answer.", 500);
  }
};
