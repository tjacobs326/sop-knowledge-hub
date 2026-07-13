-- Admin user creation, explicit permission overrides, and bulk import tracking.

PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_normalized ON users(lower(email));
CREATE INDEX IF NOT EXISTS idx_users_name_sort ON users(lower(last_name), lower(first_name), lower(email));

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  user_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  effect TEXT NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow')),
  granted_by_user_id TEXT,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_permission ON user_permission_overrides(permission_id);

CREATE TABLE IF NOT EXISTS user_import_rows (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  email TEXT,
  status TEXT NOT NULL CHECK (status IN ('Valid', 'Invalid', 'Imported', 'Skipped')),
  message TEXT,
  normalized_payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_import_rows_job ON user_import_rows(import_job_id, row_number);
