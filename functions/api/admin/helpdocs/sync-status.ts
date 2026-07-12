import { failure, success } from "../../../_shared/api";
import { requireDb } from "../../../_shared/admin";
import { requirePermission } from "../../../_shared/auth";
import { type PagesFunctionContext } from "../../../_shared/cloudflare";
import { latestHelpDocsSyncStatus } from "../../../_shared/helpdocs-sync";

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const { response } = await requirePermission(context, "Settings");
  if (response) return response;

  try {
    const latest = await latestHelpDocsSyncStatus(context.env.DB!);
    return success({
      latest,
      configured: Boolean(context.env.HELPDOCS_API_KEY),
      sourcePolicy: "Status excludes secrets and article body content.",
    });
  } catch (error) {
    return failure("HELPDOCS_SYNC_STATUS_FAILED", error instanceof Error ? error.message : "Unable to load HelpDocs sync status.", 500);
  }
};
