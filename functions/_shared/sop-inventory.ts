import { idFrom, slugify } from "./admin";
import { newId, safeJsonParse, type D1DatabaseBinding } from "./cloudflare";

export const MAX_INVENTORY_BYTES = 5 * 1024 * 1024;
export const MAX_INVENTORY_ROWS = 5000;
export const IMPORT_COLUMNS = [
  "sop_id", "title", "summary", "category", "department", "creator_reviewer_role", "owner_user_id",
  "author_user_id", "status", "version_number", "review_due_date", "tags", "source", "type", "visibility",
] as const;
export const REQUIRED_IMPORT_COLUMNS = ["sop_id", "title", "summary", "category", "department", "creator_reviewer_role", "status", "version_number"];
export const SOP_STATUSES = new Set(["Draft", "In Review", "Approved", "Needs Revision", "Published", "Archived"]);
const SOP_TYPES = new Set(["Process", "Troubleshooting Guide", "Template", "Checklist", "Job Aid", "Decision Tree"]);
const VISIBILITIES = new Set(["Internal", "Restricted", "Public"]);
const SOURCES = new Set(["Markdown", "Database", "Imported"]);
const FORMULA_PREFIX = /^[\t\r ]*[=+\-@]/;

export interface InventoryPayload {
  sopId: string; title: string; summary: string; categoryId: string; category: string; department: string;
  ownerSubRoleId: string; creatorReviewerRole: string; ownerUserId: string | null; authorUserId: string | null;
  requestedStatus: string; versionNumber: string; reviewDueDate: string | null; tags: string[]; source: string;
  type: string; visibility: string;
}

export interface InventoryPreviewRow {
  rowNumber: number; sopId: string; title: string; valid: boolean; existing: boolean; duplicate: boolean;
  action: "Create" | "Update" | "Invalid"; errors: Array<{ column: string; message: string }>;
  warnings: string[]; payload?: InventoryPayload;
}

export function parseCsv(text: string) {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("Malformed CSV: an enclosed field is missing its closing quotation mark.");
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((values) => values.some((value) => value.trim()));
}

function csvSafe(value: unknown) {
  let text = value == null ? "" : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: Record<string, unknown>[]) {
  return `\uFEFF${headers.map(csvSafe).join(",")}\r\n${rows.map((row) => headers.map((header) => csvSafe(row[header])).join(",")).join("\r\n")}`;
}

export function inventoryTemplateCsv() {
  const sample: Record<string, string> = {
    sop_id: "sop-example-001", title: "Example SOP title", summary: "Plain-language purpose and summary",
    category: "Technology", department: "Instructional Technology", creator_reviewer_role: "Instructional Technology Specialist",
    owner_user_id: "", author_user_id: "", status: "Draft", version_number: "0.1", review_due_date: "2026-12-31",
    tags: "example|training", source: "Imported", type: "Process", visibility: "Internal",
  };
  return toCsv([...IMPORT_COLUMNS], [sample]);
}

function canonical(value: unknown) { return String(value || "").trim().toLowerCase(); }
function validDate(value: string) {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}
function unsafe(value: string) { return FORMULA_PREFIX.test(value); }

export async function buildInventoryPreview(db: D1DatabaseBinding, csvText: string) {
  let parsed: string[][];
  try { parsed = parseCsv(csvText); } catch (error) { return { error: error instanceof Error ? error.message : "Malformed CSV file.", rows: [], summary: null }; }
  if (!parsed.length) return { error: "The CSV file is empty.", rows: [], summary: null };
  const headers = parsed[0].map(canonical);
  const duplicates = headers.filter((header, index) => header && headers.indexOf(header) !== index);
  if (duplicates.length) return { error: `Duplicate column header: ${Array.from(new Set(duplicates)).join(", ")}.`, rows: [], summary: null };
  const missing = REQUIRED_IMPORT_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) return { error: `Missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`, rows: [], summary: null };
  const dataRows = parsed.slice(1);
  if (dataRows.length > MAX_INVENTORY_ROWS) return { error: `Inventory imports are limited to ${MAX_INVENTORY_ROWS} rows.`, rows: [], summary: null };
  const [categories, roles, users, existing] = await Promise.all([
    db.prepare("SELECT id, name FROM categories").all<{ id: string; name: string }>(),
    db.prepare("SELECT id, label, department FROM creator_sub_roles WHERE status = 'Active'").all<{ id: string; label: string; department: string }>(),
    db.prepare("SELECT id FROM users WHERE status = 'Active' AND COALESCE(is_active, 1) = 1").all<{ id: string }>(),
    db.prepare("SELECT id FROM sops").all<{ id: string }>(),
  ]);
  const categoryMap = new Map((categories.results || []).map((item) => [canonical(item.name), item]));
  const roleMap = new Map((roles.results || []).map((item) => [canonical(item.label), item]));
  const userIds = new Set((users.results || []).map((item) => item.id));
  const existingIds = new Set((existing.results || []).map((item) => item.id));
  const seen = new Set<string>();
  const indexFor = (name: string) => headers.indexOf(name);
  const cell = (values: string[], name: string) => indexFor(name) < 0 ? "" : String(values[indexFor(name)] || "").trim();
  const rows: InventoryPreviewRow[] = dataRows.map((values, offset) => {
    const rowNumber = offset + 2;
    const sopId = cell(values, "sop_id"), title = cell(values, "title"), summary = cell(values, "summary");
    const categoryName = cell(values, "category"), department = cell(values, "department"), roleName = cell(values, "creator_reviewer_role");
    const ownerUserId = cell(values, "owner_user_id"), authorUserId = cell(values, "author_user_id");
    const status = cell(values, "status"), versionNumber = cell(values, "version_number");
    const reviewDueDate = cell(values, "review_due_date"), source = cell(values, "source") || "Imported";
    const type = cell(values, "type") || "Process", visibility = cell(values, "visibility") || "Internal";
    const rawTags = cell(values, "tags"), errors: Array<{ column: string; message: string }> = [], warnings: string[] = [];
    const add = (column: string, message: string) => errors.push({ column, message });
    const duplicate = Boolean(sopId && seen.has(sopId)); if (sopId) seen.add(sopId);
    if (!sopId || sopId.length > 120 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(sopId)) add("sop_id", "Use 1–120 letters, numbers, periods, underscores, colons, or hyphens.");
    if (duplicate) add("sop_id", "Duplicate SOP ID in this file.");
    if (!title || title.length > 180) add("title", "Title is required and must be 180 characters or fewer.");
    if (!summary || summary.length > 4000) add("summary", "Summary is required and must be 4,000 characters or fewer.");
    const category = categoryMap.get(canonical(categoryName)); if (!category) add("category", "Category does not match an existing category.");
    const role = roleMap.get(canonical(roleName));
    if (!role) add("creator_reviewer_role", "Creator/Reviewer role is not active or recognized.");
    else if (canonical(role.department) !== canonical(department)) add("department", "Department does not match the selected Creator/Reviewer role.");
    if (ownerUserId && !userIds.has(ownerUserId)) add("owner_user_id", "Owner user ID is not an active user.");
    if (authorUserId && !userIds.has(authorUserId)) add("author_user_id", "Author user ID is not an active user.");
    if (!SOP_STATUSES.has(status)) add("status", "Status is not part of the SOP workflow.");
    if (!versionNumber || versionNumber.length > 40) add("version_number", "Version number is required and must be 40 characters or fewer.");
    if (!validDate(reviewDueDate)) add("review_due_date", "Use a valid date in YYYY-MM-DD format.");
    if (!SOURCES.has(source)) add("source", "Source must be Markdown, Database, or Imported.");
    if (!SOP_TYPES.has(type)) add("type", "SOP type is not recognized.");
    if (!VISIBILITIES.has(visibility)) add("visibility", "Visibility must be Internal, Restricted, or Public.");
    for (const [column, value] of Object.entries({ sop_id: sopId, title, summary, category: categoryName, department, creator_reviewer_role: roleName, owner_user_id: ownerUserId, author_user_id: authorUserId, status, version_number: versionNumber, review_due_date: reviewDueDate, tags: rawTags, source, type, visibility })) {
      if (unsafe(value)) add(column, "Spreadsheet formulas are not allowed.");
    }
    const exists = existingIds.has(sopId);
    if (!exists && status !== "Draft") warnings.push(`New SOP will be created as Draft, not ${status}.`);
    if (!exists && visibility === "Public") warnings.push("New SOP visibility will be Internal until normal review and publishing are complete.");
    if (exists) warnings.push("Workflow status, content, steps, attachments, approvals, and version history will be preserved.");
    const tags = Array.from(new Set(rawTags.split("|").map((tag) => tag.trim()).filter(Boolean)));
    const valid = errors.length === 0;
    return { rowNumber, sopId, title, valid, existing: exists, duplicate, action: valid ? (exists ? "Update" : "Create") : "Invalid", errors, warnings,
      payload: valid ? { sopId, title, summary, categoryId: category!.id, category: category!.name, department: role!.department, ownerSubRoleId: role!.id, creatorReviewerRole: role!.label, ownerUserId: ownerUserId || null, authorUserId: authorUserId || null, requestedStatus: status, versionNumber, reviewDueDate: reviewDueDate || null, tags, source, type, visibility } : undefined };
  });
  const invalidRows = rows.filter((row) => !row.valid).length, existingRows = rows.filter((row) => row.valid && row.existing).length;
  return { rows, summary: { totalRows: rows.length, validRows: rows.length - invalidRows, invalidRows, newRecords: rows.filter((row) => row.valid && !row.existing).length, existingRecords: existingRows, duplicateRows: rows.filter((row) => row.duplicate).length, skippedRows: 0 } };
}

export async function inventoryExportRows(db: D1DatabaseBinding) {
  const result = await db.prepare(`SELECT s.id AS sop_id, s.title, COALESCE(s.summary, s.purpose, '') AS summary,
    COALESCE(c.name, '') AS category, COALESCE(sr.department, '') AS department, COALESCE(sr.label, '') AS creator_reviewer_role,
    COALESCE(owner.name, '') AS sop_owner, COALESCE(s.owner_id, s.owner_user_id, '') AS owner_user_id,
    COALESCE(author.name, v.created_by, '') AS author, COALESCE(s.created_by_user_id, '') AS author_user_id,
    s.status, COALESCE(v.status, s.status) AS version_status, COALESCE(v.version_number, v.version_label, '') AS version_number,
    s.created_at AS created_date, s.updated_at AS last_updated_date, COALESCE(s.published_at, v.published_at, '') AS published_date,
    COALESCE(s.review_date, CASE WHEN s.review_due_at IS NOT NULL THEN datetime(s.review_due_at, 'unixepoch') ELSE '' END) AS review_due_date,
    COALESCE(s.archived_at, '') AS retirement_date,
    COALESCE((SELECT GROUP_CONCAT(t.name, '|') FROM sop_tags st JOIN tags t ON t.id = st.tag_id WHERE st.sop_id = s.id), '') AS tags,
    COALESCE(s.source_type, 'Database') AS source, COALESCE(s.type, '') AS type, COALESCE(s.visibility, 'Internal') AS visibility,
    (SELECT COUNT(*) FROM procedure_steps ps WHERE ps.sop_version_id = s.current_version_id) AS number_of_steps,
    ((SELECT COUNT(*) FROM sop_media sm WHERE sm.sop_id = s.id) + (SELECT COUNT(*) FROM sop_version_media svm WHERE svm.sop_version_id = s.current_version_id) + (SELECT COUNT(*) FROM procedure_step_media psm JOIN procedure_steps ps2 ON ps2.id = psm.procedure_step_id WHERE ps2.sop_version_id = s.current_version_id)) AS attachment_count,
    COALESCE((SELECT u.name FROM sop_assignments a LEFT JOIN users u ON u.id = a.user_id WHERE a.sop_id = s.id AND a.assignment_type = 'Reviewer' AND a.status = 'Active' ORDER BY a.created_at DESC LIMIT 1), '') AS current_reviewer,
    CASE WHEN s.status IN ('Approved','Published') THEN 'Approved' WHEN s.status = 'In Review' THEN 'Pending' ELSE 'Not approved' END AS approval_status,
    CASE WHEN s.status = 'Published' THEN '/sops/' || s.slug || '/' ELSE '/drafts/preview/?id=' || s.id END AS published_url,
    COALESCE(s.estimated_completion_time, '') AS estimated_completion_time, COALESCE(s.audience, '') AS audience,
    COALESCE(s.view_count, 0) AS view_count, COALESCE(s.is_active, 1) AS is_active
    FROM sops s LEFT JOIN categories c ON c.id = s.category_id LEFT JOIN creator_sub_roles sr ON sr.id = s.owner_sub_role_id
    LEFT JOIN users owner ON owner.id = COALESCE(s.owner_id, s.owner_user_id) LEFT JOIN users author ON author.id = s.created_by_user_id
    LEFT JOIN sop_versions v ON v.id = s.current_version_id ORDER BY lower(s.title), s.id`).all<Record<string, unknown>>();
  return result.results || [];
}

export const EXPORT_COLUMNS = ["sop_id","title","summary","category","department","creator_reviewer_role","sop_owner","owner_user_id","author","author_user_id","status","version_status","version_number","created_date","last_updated_date","published_date","review_due_date","retirement_date","tags","source","type","visibility","number_of_steps","attachment_count","current_reviewer","approval_status","published_url","estimated_completion_time","audience","view_count","is_active"];

export function tagStatements(db: D1DatabaseBinding, sopId: string, tags: string[]) {
  const statements = [db.prepare("DELETE FROM sop_tags WHERE sop_id = ?").bind(sopId)];
  for (const name of tags) {
    const id = idFrom(name, "tag"), slug = slugify(name, id);
    statements.push(db.prepare("INSERT OR IGNORE INTO tags (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").bind(id, name.slice(0, 120), slug));
    statements.push(db.prepare("INSERT OR IGNORE INTO sop_tags (sop_id, tag_id) VALUES (?, ?)").bind(sopId, id));
  }
  return statements;
}

export function newSopStatements(db: D1DatabaseBinding, payload: InventoryPayload, actorId: string) {
  const versionId = newId("version"), slug = `${slugify(payload.title, "sop")}-${payload.sopId.slice(-12).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.replace(/-+/g, "-");
  const metadata = JSON.stringify({ tags: payload.tags, importedInventory: true });
  return [
    db.prepare(`INSERT INTO sops (id,title,slug,summary,purpose,category_id,owner_id,owner_user_id,owner_team_id,owner_sub_role_id,status,type,current_version_id,review_date,review_due_at,is_active,created_by_user_id,source_type,visibility,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,NULL,?,'Draft',?,?,?,CASE WHEN ? IS NULL THEN NULL ELSE unixepoch(?) END,1,?,'Imported','Internal',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(payload.sopId,payload.title,slug,payload.summary,payload.summary,payload.categoryId,payload.ownerUserId,payload.ownerUserId,payload.ownerSubRoleId,payload.type,versionId,payload.reviewDueDate,payload.reviewDueDate,payload.reviewDueDate,payload.authorUserId || actorId),
    db.prepare(`INSERT INTO sop_versions (id,sop_id,version_label,version_number,title,summary,purpose,body_markdown,content,metadata_json,change_summary,status,created_by_user_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,? ,?,?,?,'Draft',?,?,CURRENT_TIMESTAMP,unixepoch())`).bind(versionId,payload.sopId,payload.versionNumber,payload.versionNumber,payload.title,payload.summary,payload.summary,payload.summary,payload.summary,metadata,"Created through governed SOP inventory import.",payload.authorUserId || actorId,payload.authorUserId || actorId),
    ...tagStatements(db, payload.sopId, payload.tags),
  ];
}

export function updateSopStatements(db: D1DatabaseBinding, payload: InventoryPayload) {
  return [db.prepare(`UPDATE sops SET title=?,summary=?,purpose=?,category_id=?,owner_id=?,owner_user_id=?,owner_sub_role_id=?,review_date=?,review_due_at=CASE WHEN ? IS NULL THEN NULL ELSE unixepoch(?) END,source_type=?,type=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(payload.title,payload.summary,payload.summary,payload.categoryId,payload.ownerUserId,payload.ownerUserId,payload.ownerSubRoleId,payload.reviewDueDate,payload.reviewDueDate,payload.reviewDueDate,payload.source,payload.type,payload.sopId), ...tagStatements(db, payload.sopId, payload.tags)];
}

export function auditStatement(db: D1DatabaseBinding, actorId: string, action: string, sopId: string, before: unknown, after: unknown, request: Request) {
  return db.prepare("INSERT INTO audit_logs (id,actor_user_id,action,entity_type,entity_id,before_json,after_json,ip_address,user_agent,created_at) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)")
    .bind(newId("audit"), actorId, action, "sop", sopId, JSON.stringify(before || {}), JSON.stringify(after || {}), request.headers.get("cf-connecting-ip") || "", request.headers.get("user-agent") || "");
}

export function parseJobSummary(value: string | null) { return safeJsonParse<Record<string, unknown>>(value, {}); }
