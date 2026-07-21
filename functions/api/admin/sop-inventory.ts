import { requireDb } from "../../_shared/admin";
import { requirePermission } from "../../_shared/auth";
import { jsonResponse, newId, type D1DatabaseBinding, type PagesFunctionContext } from "../../_shared/cloudflare";
import {
  EXPORT_COLUMNS, IMPORT_COLUMNS, MAX_INVENTORY_BYTES, auditStatement, buildInventoryPreview, inventoryExportRows,
  inventoryTemplateCsv, newSopStatements, parseJobSummary, toCsv, updateSopStatements,
} from "../../_shared/sop-inventory";

function datedFileName(prefix: string) { return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`; }
function csvResponse(csv: string, fileName: string) {
  return new Response(csv, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${fileName}"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

async function recordExport(db: D1DatabaseBinding, actorId: string, fileName: string, totalRows: number, status = "Completed") {
  await db.prepare(`INSERT INTO sop_inventory_jobs (id,action_type,actor_user_id,file_name,total_rows,successful_rows,failed_rows,status,summary_json) VALUES (?,'Export',?,?,?,?,?,?,?)`)
    .bind(newId("inventory-job"), actorId, fileName, totalRows, status === "Completed" ? totalRows : 0, status === "Failed" ? totalRows : 0, status, JSON.stringify({ totalRows })).run();
}

async function history(db: D1DatabaseBinding) {
  const result = await db.prepare(`SELECT jobs.id,jobs.action_type AS actionType,COALESCE(users.name,users.email,'Unknown admin') AS adminUser,jobs.file_name AS fileName,jobs.created_at AS createdAt,jobs.total_rows AS totalRows,jobs.successful_rows AS successfulRows,jobs.failed_rows AS failedRows,jobs.created_records AS createdRecords,jobs.updated_records AS updatedRecords,jobs.skipped_records AS skippedRecords,jobs.status,jobs.summary_json AS summaryJson FROM sop_inventory_jobs jobs LEFT JOIN users ON users.id=jobs.actor_user_id ORDER BY jobs.created_at DESC LIMIT 100`).all<Record<string, unknown>>();
  return (result.results || []).map((row) => ({ ...row, summary: parseJobSummary(String(row.summaryJson || "")), summaryJson: undefined }));
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB); if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage SOP Inventory"); if (auth.response) return auth.response;
  const db = context.env.DB!, action = new URL(context.request.url).searchParams.get("action") || "history";
  if (action === "template") return csvResponse(inventoryTemplateCsv(), "sop-inventory-template.csv");
  if (action === "history") return jsonResponse({ history: await history(db), columns: IMPORT_COLUMNS, maxFileBytes: MAX_INVENTORY_BYTES });
  if (action !== "export") return jsonResponse({ error: "Unsupported inventory action." }, 400);
  const fileName = datedFileName("sop-inventory");
  try {
    const rows = await inventoryExportRows(db);
    await recordExport(db, auth.user!.id, fileName, rows.length);
    return csvResponse(toCsv(EXPORT_COLUMNS, rows), fileName);
  } catch {
    await recordExport(db, auth.user!.id, fileName, 0, "Failed").catch(() => undefined);
    return jsonResponse({ error: "Unable to export SOP inventory." }, 500);
  }
};

async function readUpload(request: Request) {
  const form = await request.formData(), file = form.get("file");
  if (!(file instanceof File)) return { error: "Choose a CSV file first.", file: null, form };
  if (file.size > MAX_INVENTORY_BYTES) return { error: "CSV files must be 5 MB or smaller.", file: null, form };
  if (!file.name.toLowerCase().endsWith(".csv") || (file.type && !["text/csv", "application/vnd.ms-excel", "text/plain"].includes(file.type))) return { error: "Only CSV files are supported.", file: null, form };
  return { error: "", file, form };
}

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB); if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage SOP Inventory"); if (auth.response) return auth.response;
  const db = context.env.DB!, action = new URL(context.request.url).searchParams.get("action") || "preview";
  const upload = await readUpload(context.request); if (upload.error || !upload.file) return jsonResponse({ error: upload.error }, 400);
  const preview = await buildInventoryPreview(db, await upload.file.text());
  if ("error" in preview && preview.error) return jsonResponse({ error: preview.error }, 400);
  if (action === "preview") return jsonResponse({ preview });
  if (action !== "commit") return jsonResponse({ error: "Unsupported inventory action." }, 400);
  const strategy = String(upload.form.get("existingStrategy") || "skip");
  if (!new Set(["skip", "update"]).has(strategy)) return jsonResponse({ error: "Choose whether existing records should be skipped or updated." }, 400);
  if (preview.summary!.invalidRows > 0) return jsonResponse({ error: "Resolve every invalid row before importing. No records were changed.", preview }, 400);
  if (!db.batch) return jsonResponse({ error: "Atomic D1 batch transactions are unavailable; the import was not started." }, 503);

  const jobId = newId("inventory-job"), statements = [], outcomes: Array<{ rowNumber: number; sopId: string; action: string }> = [];
  const existingRows = await db.prepare("SELECT id,title,summary,category_id,owner_id,owner_user_id,owner_sub_role_id,review_date,source_type,type,status,current_version_id FROM sops").all<Record<string, unknown>>();
  const beforeMap = new Map((existingRows.results || []).map((row) => [String(row.id), row]));
  let created = 0, updated = 0, skipped = 0;
  for (const row of preview.rows) {
    const payload = row.payload!;
    if (row.existing && strategy === "skip") { skipped += 1; outcomes.push({ rowNumber: row.rowNumber, sopId: row.sopId, action: "Skipped" }); continue; }
    if (row.existing) {
      updated += 1; statements.push(...updateSopStatements(db, payload));
      statements.push(auditStatement(db, auth.user!.id, "inventory_import_update", row.sopId, beforeMap.get(row.sopId), payload, context.request));
      outcomes.push({ rowNumber: row.rowNumber, sopId: row.sopId, action: "Updated" });
    } else {
      created += 1; statements.push(...newSopStatements(db, payload, auth.user!.id));
      statements.push(auditStatement(db, auth.user!.id, "inventory_import_create", row.sopId, null, { ...payload, requestedStatus: payload.requestedStatus, appliedStatus: "Draft", appliedVisibility: "Internal" }, context.request));
      outcomes.push({ rowNumber: row.rowNumber, sopId: row.sopId, action: "Created" });
    }
  }
  const total = preview.rows.length, successful = created + updated;
  const summary = { ...preview.summary, createdRecords: created, updatedRecords: updated, skippedRecords: skipped, successfulRows: successful, failedRows: 0, existingStrategy: strategy };
  statements.unshift(db.prepare(`INSERT INTO sop_inventory_jobs (id,action_type,actor_user_id,file_name,total_rows,successful_rows,failed_rows,created_records,updated_records,skipped_records,status,summary_json) VALUES (?,'Import',?,?,?,?,?,?,?,?,'Completed',?)`)
    .bind(jobId, auth.user!.id, upload.file.name, total, successful, 0, created, updated, skipped, JSON.stringify(summary)));
  for (const outcome of outcomes) statements.push(db.prepare("INSERT INTO sop_inventory_import_rows (id,job_id,row_number,sop_id,action,message,normalized_payload_json) VALUES (?,?,?,?,?,?,?)").bind(newId("inventory-row"), jobId, outcome.rowNumber, outcome.sopId, outcome.action, outcome.action, JSON.stringify(preview.rows.find((row) => row.rowNumber === outcome.rowNumber)?.payload || {})));
  try {
    await db.batch(statements);
    return jsonResponse({ success: true, jobId, summary, outcomes }, 201);
  } catch (error) {
    await db.prepare(`INSERT INTO sop_inventory_jobs (id,action_type,actor_user_id,file_name,total_rows,successful_rows,failed_rows,status,summary_json) VALUES (?,'Import',?,?,?,0,?,'Failed',?)`)
      .bind(newId("inventory-job"), auth.user!.id, upload.file.name, total, total, JSON.stringify({ ...summary, error: error instanceof Error ? error.message : "Atomic import failed." })).run().catch(() => undefined);
    return jsonResponse({ error: "The atomic import failed. No SOP records were changed." }, 500);
  }
};
