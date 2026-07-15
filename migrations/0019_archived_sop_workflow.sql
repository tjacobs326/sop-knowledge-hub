ALTER TABLE sops ADD COLUMN archive_previous_status TEXT;
ALTER TABLE sops ADD COLUMN archived_by_user_id TEXT;
ALTER TABLE sops ADD COLUMN archive_reason TEXT;
ALTER TABLE sops ADD COLUMN restored_at TEXT;
ALTER TABLE sops ADD COLUMN restored_by_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sops_archived_scope
  ON sops(status, owner_sub_role_id, owner_team_id, archived_at);

