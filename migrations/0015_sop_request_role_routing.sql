-- Route SOP requests directly to the responsible Creator / Reviewer sub-role.
-- The app reuses sop_requests.owner_sub_role_id instead of adding a duplicate
-- assignment column, because Review Queue permissions already scope by this field.

PRAGMA foreign_keys = ON;

CREATE INDEX IF NOT EXISTS idx_sop_requests_owner_sub_role_status
  ON sop_requests(owner_sub_role_id, status);

CREATE INDEX IF NOT EXISTS idx_sop_requests_assigned_team_status
  ON sop_requests(assigned_team_id, status);
