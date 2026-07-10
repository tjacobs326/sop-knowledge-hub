import { type D1DatabaseBinding } from "./cloudflare";

export interface DepartmentRow {
  id: string;
  name: string;
  description?: string | null;
  status: "Active" | "Archived";
}

export async function ensureDepartmentSchema(db: D1DatabaseBinding) {
  const info = await db.prepare("PRAGMA table_info(teams)").all<{ name: string }>();
  const columns = new Set((info.results || []).map((row) => row.name));
  if (!columns.has("status")) {
    await db.prepare("ALTER TABLE teams ADD COLUMN status TEXT NOT NULL DEFAULT 'Active'").run();
  }
}

export async function listActiveDepartments(db: D1DatabaseBinding) {
  await ensureDepartmentSchema(db);
  const result = await db
    .prepare(
      `SELECT id, name, description, status
       FROM teams
       WHERE status = 'Active'
       ORDER BY name ASC`,
    )
    .all<DepartmentRow>();
  return result.results || [];
}

export async function getActiveDepartment(db: D1DatabaseBinding, id: string) {
  await ensureDepartmentSchema(db);
  if (!id.trim()) return null;
  return await db
    .prepare(
      `SELECT id, name, description, status
       FROM teams
       WHERE id = ?
        AND status = 'Active'
       LIMIT 1`,
    )
    .bind(id.trim())
    .first<DepartmentRow>();
}
