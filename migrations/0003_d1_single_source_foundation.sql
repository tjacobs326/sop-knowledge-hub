-- Align D1 with the SOP single-source-of-truth API contract.
-- This migration is additive so existing seeded data and current pages continue to work.

PRAGMA foreign_keys = ON;

ALTER TABLE sops ADD COLUMN summary TEXT;
ALTER TABLE sops ADD COLUMN owner_id TEXT;
ALTER TABLE sops ADD COLUMN estimated_minutes INTEGER;
ALTER TABLE sops ADD COLUMN audience TEXT;
ALTER TABLE sops ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sops ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sops ADD COLUMN helpful_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sops ADD COLUMN not_helpful_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sops ADD COLUMN review_due_at INTEGER;

ALTER TABLE sop_versions ADD COLUMN version_number TEXT;
ALTER TABLE sop_versions ADD COLUMN summary TEXT;
ALTER TABLE sop_versions ADD COLUMN content TEXT;
ALTER TABLE sop_versions ADD COLUMN before_you_begin TEXT;
ALTER TABLE sop_versions ADD COLUMN checklist TEXT;
ALTER TABLE sop_versions ADD COLUMN troubleshooting TEXT;
ALTER TABLE sop_versions ADD COLUMN created_by TEXT;
ALTER TABLE sop_versions ADD COLUMN updated_at INTEGER;
ALTER TABLE sop_versions ADD COLUMN published_at INTEGER;

ALTER TABLE categories ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tags ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN role TEXT;
ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE audit_logs ADD COLUMN details TEXT;

UPDATE sops
SET
  summary = COALESCE(summary, purpose),
  owner_id = COALESCE(owner_id, owner_user_id),
  estimated_minutes = COALESCE(
    estimated_minutes,
    CAST(NULLIF(REPLACE(estimated_completion_time, ' minutes', ''), '') AS INTEGER)
  ),
  review_due_at = COALESCE(review_due_at, CAST(strftime('%s', review_date) AS INTEGER)),
  is_active = CASE WHEN status = 'Archived' THEN 0 ELSE 1 END
WHERE summary IS NULL OR owner_id IS NULL OR review_due_at IS NULL;

UPDATE sop_versions
SET
  version_number = COALESCE(version_number, version_label),
  summary = COALESCE(summary, purpose),
  content = COALESCE(content, body_markdown),
  created_by = COALESCE(created_by, created_by_user_id),
  updated_at = COALESCE(updated_at, CAST(strftime('%s', created_at) AS INTEGER)),
  published_at = COALESCE(published_at, CAST(strftime('%s', approved_at) AS INTEGER))
WHERE version_number IS NULL OR content IS NULL;

UPDATE users
SET
  role = COALESCE(role, access_level),
  is_active = CASE WHEN status = 'Active' THEN 1 ELSE 0 END
WHERE role IS NULL;

CREATE TABLE IF NOT EXISTS sop_requests (
  id TEXT PRIMARY KEY,
  request_type TEXT NOT NULL,
  requested_title TEXT,
  department_name TEXT,
  submitted_by_name TEXT,
  submitted_by_email TEXT,
  role_title TEXT,
  description TEXT NOT NULL,
  priority TEXT,
  desired_completion_at INTEGER,
  existing_sop_id TEXT,
  draft_content TEXT,
  related_links TEXT,
  documentation_location TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  assigned_to TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (existing_sop_id) REFERENCES sops(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sop_reviews (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL,
  version_id TEXT,
  reviewer_id TEXT,
  status TEXT NOT NULL,
  comments TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES sop_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sop_status_history (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL,
  version_id TEXT,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT,
  notes TEXT,
  changed_at INTEGER NOT NULL,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES sop_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sop_feedback (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL,
  user_id TEXT,
  is_helpful INTEGER NOT NULL,
  comment TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sop_slug_history (
  slug TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO sop_requests (
  id,
  request_type,
  requested_title,
  department_name,
  submitted_by_name,
  submitted_by_email,
  description,
  priority,
  desired_completion_at,
  existing_sop_id,
  status,
  assigned_to,
  created_at,
  updated_at
)
SELECT
  id,
  request_type,
  title,
  department,
  submitter_name,
  submitter_email,
  COALESCE(description, business_need, title),
  priority,
  CAST(strftime('%s', desired_completion_date) AS INTEGER),
  requested_sop_id,
  lower(replace(status, ' ', '_')),
  assigned_to_user_id,
  CAST(strftime('%s', created_at) AS INTEGER),
  CAST(strftime('%s', updated_at) AS INTEGER)
FROM requests;

INSERT OR IGNORE INTO sop_reviews (
  id,
  sop_id,
  version_id,
  reviewer_id,
  status,
  comments,
  created_at,
  updated_at
)
SELECT
  id,
  COALESCE(sop_id, 'sop-ivanti-submit-ticket'),
  sop_version_id,
  reviewer_user_id,
  lower(replace(status, ' ', '_')),
  decision_notes,
  CAST(strftime('%s', created_at) AS INTEGER),
  CAST(strftime('%s', updated_at) AS INTEGER)
FROM reviews
WHERE sop_id IS NOT NULL OR sop_version_id IS NOT NULL;

INSERT OR IGNORE INTO sop_status_history (
  id,
  sop_id,
  version_id,
  previous_status,
  new_status,
  changed_by,
  notes,
  changed_at
)
SELECT
  id,
  sop_id,
  sop_version_id,
  lower(replace(from_status, ' ', '_')),
  lower(replace(to_status, ' ', '_')),
  actor_user_id,
  notes,
  CAST(strftime('%s', created_at) AS INTEGER)
FROM sop_publication_events;

INSERT OR IGNORE INTO sop_feedback (
  id,
  sop_id,
  user_id,
  is_helpful,
  comment,
  created_at
)
SELECT
  id,
  sop_id,
  user_id,
  CASE WHEN rating = 'Helpful' THEN 1 ELSE 0 END,
  comment,
  CAST(strftime('%s', created_at) AS INTEGER)
FROM feedback;

CREATE INDEX IF NOT EXISTS idx_sops_slug ON sops(slug);
CREATE INDEX IF NOT EXISTS idx_sops_status ON sops(status);
CREATE INDEX IF NOT EXISTS idx_sops_category_id ON sops(category_id);
CREATE INDEX IF NOT EXISTS idx_sops_owner_id ON sops(owner_id);
CREATE INDEX IF NOT EXISTS idx_sops_updated_at ON sops(updated_at);
CREATE INDEX IF NOT EXISTS idx_sops_published_at ON sops(published_at);
CREATE INDEX IF NOT EXISTS idx_sop_versions_sop_id ON sop_versions(sop_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);
CREATE INDEX IF NOT EXISTS idx_search_logs_query_created ON search_logs(query, created_at);
CREATE INDEX IF NOT EXISTS idx_sop_requests_status ON sop_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_sop_feedback_sop_id ON sop_feedback(sop_id, created_at);
