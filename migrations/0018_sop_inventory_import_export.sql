-- Admin SOP inventory import/export history and permission.

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO permissions (id, name, description)
VALUES ('perm-manage-sop-inventory', 'Manage SOP Inventory', 'Export, validate, and import governed SOP inventory records.');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
VALUES ('role-admin', 'perm-manage-sop-inventory');

CREATE TABLE IF NOT EXISTS sop_inventory_jobs (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL CHECK (action_type IN ('Import', 'Export')),
  actor_user_id TEXT,
  file_name TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  successful_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  created_records INTEGER NOT NULL DEFAULT 0,
  updated_records INTEGER NOT NULL DEFAULT 0,
  skipped_records INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('Completed', 'Failed')),
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sop_inventory_import_rows (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  sop_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('Created', 'Updated', 'Skipped', 'Invalid')),
  message TEXT,
  normalized_payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES sop_inventory_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sop_inventory_jobs_created ON sop_inventory_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sop_inventory_rows_job ON sop_inventory_import_rows(job_id, row_number);
