import { failure, success } from "../../_shared/api";
import { requireDb } from "../../_shared/admin";
import { type PagesFunctionContext } from "../../_shared/cloudflare";
import {
  authorizedPublishedSops,
  canUseGuidedFinder,
  createGuidedFinderSession,
  ensureGuidedFinderTables,
  resolveGuidedFinderState,
} from "../../_shared/guided-finder-adaptive";

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;

  try {
    await ensureGuidedFinderTables(context.env.DB!);
    const { user, selectedSubRole, sops } = await authorizedPublishedSops(context);
    if (!canUseGuidedFinder(user)) {
      return failure("FORBIDDEN", "You do not have permission to use Guided Finder.", 403);
    }

    const sessionId = await createGuidedFinderSession(
      context.env.DB!,
      user,
      selectedSubRole?.id,
      sops.map((candidate) => String(candidate.sop.id || "")).filter(Boolean),
    );
    const state = resolveGuidedFinderState(sessionId, sops, {}, 1);

    return success({
      ...state,
      sourcePolicy: "Questions and options are derived from authorized published SOP records in D1.",
    });
  } catch (error) {
    return failure("GUIDED_FINDER_START_FAILED", error instanceof Error ? error.message : "Unable to start Guided Finder.", 500);
  }
};
