-- Guided Finder hot-path indexes.
-- Rollback:
-- DROP INDEX IF EXISTS idx_guided_sops_status_active_updated;
-- DROP INDEX IF EXISTS idx_guided_sops_owner_team_status;
-- DROP INDEX IF EXISTS idx_guided_sops_owner_sub_role_status;
-- DROP INDEX IF EXISTS idx_guided_sops_category_status;
-- DROP INDEX IF EXISTS idx_guided_tags_active_name;

CREATE INDEX IF NOT EXISTS idx_guided_sops_status_active_updated
  ON sops(status, is_active, updated_at);

CREATE INDEX IF NOT EXISTS idx_guided_sops_owner_team_status
  ON sops(owner_team_id, status, is_active);

CREATE INDEX IF NOT EXISTS idx_guided_sops_owner_sub_role_status
  ON sops(owner_sub_role_id, status, is_active);

CREATE INDEX IF NOT EXISTS idx_guided_sops_category_status
  ON sops(category_id, status, is_active);

CREATE INDEX IF NOT EXISTS idx_guided_tags_active_name
  ON tags(is_active, name);
