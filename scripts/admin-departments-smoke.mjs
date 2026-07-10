import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const usersPage = readFileSync(resolve(root, "src/pages/admin/users/index.astro"), "utf8");
const usersApi = readFileSync(resolve(root, "functions/api/admin/users.ts"), "utf8");
const departmentsApi = readFileSync(resolve(root, "functions/api/admin/departments.ts"), "utf8");
const departmentsShared = readFileSync(resolve(root, "functions/_shared/departments.ts"), "utf8");
const migration = readFileSync(resolve(root, "migrations/0011_team_status.sql"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  usersPage.includes('<select id="user-department" name="departmentId"') &&
    !usersPage.includes('<input id="user-department" name="department"'),
  "Admin user form must use a departmentId select, not a free-text department input.",
);
assert(
  usersPage.includes('fetch("/api/admin/departments"') &&
    usersPage.includes("Loading active departments from Cloudflare D1") &&
    usersPage.includes("Departments unavailable") &&
    usersPage.includes("Select a department."),
  "Admin user form must load departments dynamically with loading, error, and default states.",
);
assert(
  usersPage.includes("validDepartmentIds().has(departmentId)") &&
    usersPage.includes("saveUserButton.disabled = !departmentsLoaded || !selectedDepartmentIsValid()"),
  "Admin user form must block saves until a valid loaded department is selected.",
);
assert(
  departmentsApi.includes('requirePermission(context, "Manage Users")') &&
    departmentsApi.includes("listActiveDepartments"),
  "Department list endpoint must be read-only and restricted to user administrators.",
);
assert(
  departmentsShared.includes("WHERE status = 'Active'") &&
    departmentsShared.includes("getActiveDepartment") &&
    departmentsShared.includes("ALTER TABLE teams ADD COLUMN status"),
  "Department helper must filter active teams and support local/deployed D1 schemas missing status.",
);
assert(
  usersApi.includes("getActiveDepartment(db, departmentId)") &&
    usersApi.includes("Select an active department from the list.") &&
    usersApi.includes("team_id = ?") &&
    usersApi.includes("users.team_id AS departmentId"),
  "User API must validate manipulated, missing, inactive, or nonexistent department ids before saving team_id.",
);
assert(
  migration.includes("ALTER TABLE teams ADD COLUMN status") &&
    migration.includes("CHECK (status IN ('Active', 'Archived'))") &&
    migration.includes("idx_teams_status_name"),
  "Migration must add active/inactive department status metadata.",
);

console.log("Admin department workflow smoke checks passed.");
