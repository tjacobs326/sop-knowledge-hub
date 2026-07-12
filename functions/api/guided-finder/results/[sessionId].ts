import { failure, getRouteParam, success } from "../../../_shared/api";
import { requireDb } from "../../../_shared/admin";
import { type PagesFunctionContext } from "../../../_shared/cloudflare";
import {
  authorizedPublishedSops,
  canUseGuidedFinder,
  ensureGuidedFinderTables,
  parseSessionAnswers,
  readGuidedFinderSession,
  resolveGuidedFinderState,
} from "../../../_shared/guided-finder-adaptive";

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const sessionId = getRouteParam(context, "sessionId");
  if (!sessionId) return failure("MISSING_SESSION_ID", "Send a Guided Finder session ID.", 400);

  try {
    await ensureGuidedFinderTables(context.env.DB!);
    const row = await readGuidedFinderSession(context.env.DB!, sessionId);
    if (!row) return failure("GUIDED_FINDER_SESSION_NOT_FOUND", "Start a new Guided Finder session.", 404);

    const { user, sops } = await authorizedPublishedSops(context);
    if (!canUseGuidedFinder(user)) {
      return failure("FORBIDDEN", "You do not have permission to use Guided Finder.", 403);
    }

    const answers = parseSessionAnswers(row);
    const step = Math.min(Number(row.currentStep || Object.keys(answers).length + 1), 5);
    const state = resolveGuidedFinderState(sessionId, sops, answers, step);
    return success({
      ...state,
      sourcePolicy: "Results are authorized published SOP records from D1.",
    });
  } catch (error) {
    return failure("GUIDED_FINDER_RESULTS_FAILED", error instanceof Error ? error.message : "Unable to load Guided Finder results.", 500);
  }
};
