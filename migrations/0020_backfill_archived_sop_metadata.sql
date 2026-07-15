UPDATE sops
SET archive_previous_status = COALESCE(
      archive_previous_status,
      (SELECT history.previous_status FROM sop_status_history history
       WHERE history.sop_id = sops.id AND history.new_status = 'Archived'
       ORDER BY history.changed_at DESC LIMIT 1),
      'Unknown'
    ),
    archived_by_user_id = COALESCE(
      archived_by_user_id,
      (SELECT history.changed_by FROM sop_status_history history
       WHERE history.sop_id = sops.id AND history.new_status = 'Archived'
       ORDER BY history.changed_at DESC LIMIT 1)
    ),
    archive_reason = COALESCE(
      NULLIF(TRIM(archive_reason), ''),
      (SELECT NULLIF(TRIM(history.notes), '') FROM sop_status_history history
       WHERE history.sop_id = sops.id AND history.new_status = 'Archived'
       ORDER BY history.changed_at DESC LIMIT 1),
      'Archived before archive reasons were required.'
    ),
    archived_at = COALESCE(
      archived_at,
      (SELECT datetime(history.changed_at, 'unixepoch') FROM sop_status_history history
       WHERE history.sop_id = sops.id AND history.new_status = 'Archived'
       ORDER BY history.changed_at DESC LIMIT 1),
      updated_at
    ),
    is_active = 0
WHERE status = 'Archived';
