import { requireDb } from "../../_shared/admin";
import { requirePermission } from "../../_shared/auth";
import { listActiveDepartments } from "../../_shared/departments";
import { jsonResponse, type PagesFunctionContext } from "../../_shared/cloudflare";

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;

  const auth = await requirePermission(context, "Manage Users");
  if (auth.response) return auth.response;

  const departments = await listActiveDepartments(context.env.DB!);
  return jsonResponse({ departments });
};
