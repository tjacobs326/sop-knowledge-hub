import { failure, readBody, success } from "../../../_shared/api";
import { requireDb } from "../../../_shared/admin";
import { requirePermission } from "../../../_shared/auth";
import { type PagesFunctionContext } from "../../../_shared/cloudflare";
import { runHelpDocsSync } from "../../../_shared/helpdocs-sync";

interface SyncPayload {
  mode?: "incremental" | "full";
  limit?: number;
}

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const { response } = await requirePermission(context, "Settings");
  if (response) return response;
  const [payload, parseError] = await readBody<SyncPayload>(context.request);
  if (parseError) return parseError;

  try {
    const result = await runHelpDocsSync(context.env.DB!, context.env, {
      mode: payload?.mode === "full" ? "full" : "incremental",
      limit: Number(payload?.limit || 100),
    });
    return success({
      ...result,
      sourcePolicy: "HelpDocs API key is read from Worker secrets and never returned to the client.",
    });
  } catch (error) {
    return failure("HELPDOCS_SYNC_FAILED", error instanceof Error ? error.message : "HelpDocs sync failed.", 500);
  }
};
