-- Archived SOP metadata and restoration audit support.

PRAGMA foreign_keys = ON;

ALTER TABLE sops ADD COLUMN archive_notes TEXT;
ALTER TABLE sops ADD COLUMN previous_status TEXT;
ALTER TABLE sops ADD COLUMN previous_owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sops ADD COLUMN previous_reviewer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sops ADD COLUMN previous_published_at TEXT;
ALTER TABLE sops ADD COLUMN replacement_sop_id TEXT REFERENCES sops(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS sop_archive_events (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('Archived', 'Restored', 'Permanent Delete Requested', 'Permanent Deleted', 'Denied Access')),
  archive_reason TEXT,
  archive_notes TEXT,
  previous_status TEXT,
  restore_status TEXT,
  owner_user_id TEXT,
  reviewer_user_id TEXT,
  department TEXT,
  replacement_sop_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (replacement_sop_id) REFERENCES sops(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sops_archive_scope ON sops(status, archived_at, owner_sub_role_id, owner_team_id);
CREATE INDEX IF NOT EXISTS idx_sops_archive_reason ON sops(archive_reason);
CREATE INDEX IF NOT EXISTS idx_sops_archived_by ON sops(archived_by_user_id);
CREATE INDEX IF NOT EXISTS idx_sop_archive_events_sop ON sop_archive_events(sop_id, created_at);
