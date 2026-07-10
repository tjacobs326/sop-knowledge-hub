-- Add active/inactive department status metadata.
-- The application treats teams as the department source of truth.

ALTER TABLE teams ADD COLUMN status TEXT NOT NULL DEFAULT 'Active'
  CHECK (status IN ('Active', 'Archived'));

CREATE INDEX IF NOT EXISTS idx_teams_status_name ON teams(status, name);
