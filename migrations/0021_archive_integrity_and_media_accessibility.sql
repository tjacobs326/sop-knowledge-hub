-- Enforce archive actor integrity and support accessible video metadata.

ALTER TABLE media_assets ADD COLUMN caption_url TEXT;
ALTER TABLE media_assets ADD COLUMN transcript TEXT;

CREATE TRIGGER IF NOT EXISTS trg_sops_archive_metadata_insert
BEFORE INSERT ON sops
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.status = 'Archived' AND (
      NEW.archive_previous_status IS NULL
      OR NEW.archived_by_user_id IS NULL
      OR length(trim(COALESCE(NEW.archive_reason, ''))) < 3
      OR NEW.archived_at IS NULL
      OR COALESCE(NEW.is_active, 0) <> 0
    ) THEN RAISE(ABORT, 'Archived SOP metadata is incomplete')
  END;
  SELECT CASE
    WHEN NEW.archive_previous_status IS NOT NULL
      AND NEW.archive_previous_status NOT IN ('Draft', 'Needs Revision', 'In Review', 'Approved', 'Published', 'Unknown')
    THEN RAISE(ABORT, 'Invalid archive previous status')
  END;
  SELECT CASE
    WHEN NEW.archived_by_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.archived_by_user_id)
    THEN RAISE(ABORT, 'Invalid archived-by user')
  END;
  SELECT CASE
    WHEN NEW.restored_by_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.restored_by_user_id)
    THEN RAISE(ABORT, 'Invalid restored-by user')
  END;
  SELECT CASE
    WHEN (NEW.restored_at IS NULL) <> (NEW.restored_by_user_id IS NULL)
    THEN RAISE(ABORT, 'Restore metadata must include both timestamp and user')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_sops_archive_metadata_update
BEFORE UPDATE OF status, is_active, archive_previous_status, archived_by_user_id, archive_reason, archived_at, restored_by_user_id, restored_at ON sops
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.status = 'Archived' AND (
      NEW.archive_previous_status IS NULL
      OR NEW.archived_by_user_id IS NULL
      OR length(trim(COALESCE(NEW.archive_reason, ''))) < 3
      OR NEW.archived_at IS NULL
      OR COALESCE(NEW.is_active, 0) <> 0
    ) THEN RAISE(ABORT, 'Archived SOP metadata is incomplete')
  END;
  SELECT CASE
    WHEN NEW.archive_previous_status IS NOT NULL
      AND NEW.archive_previous_status NOT IN ('Draft', 'Needs Revision', 'In Review', 'Approved', 'Published', 'Unknown')
    THEN RAISE(ABORT, 'Invalid archive previous status')
  END;
  SELECT CASE
    WHEN NEW.archived_by_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.archived_by_user_id)
    THEN RAISE(ABORT, 'Invalid archived-by user')
  END;
  SELECT CASE
    WHEN NEW.restored_by_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.restored_by_user_id)
    THEN RAISE(ABORT, 'Invalid restored-by user')
  END;
  SELECT CASE
    WHEN (NEW.restored_at IS NULL) <> (NEW.restored_by_user_id IS NULL)
    THEN RAISE(ABORT, 'Restore metadata must include both timestamp and user')
  END;
END;

CREATE INDEX IF NOT EXISTS idx_sops_restored_by ON sops(restored_by_user_id, restored_at);
