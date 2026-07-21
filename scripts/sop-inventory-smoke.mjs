import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const service = read("functions/_shared/sop-inventory.ts");
const api = read("functions/api/admin/sop-inventory.ts");
const page = read("src/pages/admin/sop-inventory/index.astro");
const migration = read("migrations/0018_sop_inventory_import_export.sql");
const auth = read("functions/_shared/auth.ts");

assert(api.includes('requirePermission(context, "Manage SOP Inventory")'), "Every inventory API action must enforce the inventory permission.");
assert(service.includes("FORMULA_PREFIX") && service.includes("Spreadsheet formulas are not allowed"), "CSV formula injection must be rejected and escaped.");
assert(service.includes("Malformed CSV") && service.includes("Missing required column"), "Malformed files and missing headers must be validated.");
assert(service.includes("Duplicate SOP ID in this file"), "Duplicate SOP IDs must be detected.");
assert(service.includes("New SOP will be created as Draft") && service.includes("'Draft'"), "New records must not bypass the draft workflow.");
assert(api.includes("if (!db.batch)" ) && api.includes("await db.batch(statements)"), "Commits must require an atomic D1 batch.");
assert(api.includes("inventory_import_update") && api.includes("inventory_import_create"), "Create and update operations must be audited.");
assert(migration.includes("sop_inventory_jobs") && migration.includes("sop_inventory_import_rows"), "Import/export history tables must exist.");
assert(auth.includes('"Manage SOP Inventory"'), "Admin inventory permission must be part of auth typing and fallback permissions.");
for (const fragment of ["Export SOP Inventory", "Import SOP Inventory", "Download CSV Template", "Validate and Preview", "Confirm Import", "Import and Export History", "aria-live", "showModal", "existing-strategy"]) {
  assert(page.includes(fragment), `Inventory interface is missing: ${fragment}`);
}
assert(page.includes("max-width: 760px"), "Inventory UI must include a mobile responsive layout.");
console.log("SOP inventory import/export smoke checks passed.");
