-- Explicit user, permission, workflow, search, and analytics relationships.
-- This migration is additive and keeps the current app data intact.

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO permissions (id, name, description) VALUES
  ('perm-review-sops', 'Review SOPs', 'Review SOP drafts, requests, and assigned review work.'),
  ('perm-request-changes', 'Request Changes', 'Send SOP drafts back for revision.'),
  ('perm-approve-sops', 'Approve SOPs', 'Approve reviewed SOP versions before publishing.'),
  ('perm-archive-sops', 'Archive SOPs', 'Archive obsolete SOPs and versions.'),
  ('perm-upload-media', 'Upload Media', 'Upload media and documents for SOPs or requests.'),
  ('perm-manage-media', 'Manage Media', 'Manage media metadata, quarantine, and archival state.');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
  ('role-normal-user', 'perm-search-sops'),
  ('role-normal-user', 'perm-guided-finder'),
  ('role-normal-user', 'perm-browse-categories'),
  ('role-normal-user', 'perm-submit-requests'),
  ('role-creator-reviewer', 'perm-search-sops'),
  ('role-creator-reviewer', 'perm-guided-finder'),
  ('role-creator-reviewer', 'perm-browse-categories'),
  ('role-creator-reviewer', 'perm-submit-requests'),
  ('role-creator-reviewer', 'perm-create-sops'),
  ('role-creator-reviewer', 'perm-edit-drafts'),
  ('role-creator-reviewer', 'perm-review-sops'),
  ('role-creator-reviewer', 'perm-request-changes'),
  ('role-creator-reviewer', 'perm-approve-sops'),
  ('role-creator-reviewer', 'perm-publish-sops'),
  ('role-creator-reviewer', 'perm-archive-sops'),
  ('role-creator-reviewer', 'perm-upload-media'),
  ('role-admin', 'perm-search-sops'),
  ('role-admin', 'perm-guided-finder'),
  ('role-admin', 'perm-browse-categories'),
  ('role-admin', 'perm-submit-requests'),
  ('role-admin', 'perm-create-sops'),
  ('role-admin', 'perm-edit-drafts'),
  ('role-admin', 'perm-review-sops'),
  ('role-admin', 'perm-request-changes'),
  ('role-admin', 'perm-approve-sops'),
  ('role-admin', 'perm-publish-sops'),
  ('role-admin', 'perm-archive-sops'),
  ('role-admin', 'perm-manage-users'),
  ('role-admin', 'perm-manage-categories'),
  ('role-admin', 'perm-manage-tags'),
  ('role-admin', 'perm-view-analytics'),
  ('role-admin', 'perm-upload-media'),
  ('role-admin', 'perm-manage-media'),
  ('role-admin', 'perm-settings');

UPDATE roles
SET permissions_json = '["Search SOPs","Use Guided Finder","Browse Categories","Submit Requests","Create SOPs","Edit Drafts","Review SOPs","Request Changes","Approve SOPs","Publish SOPs","Archive SOPs","Upload Media"]'
WHERE id = 'role-creator-reviewer';

UPDATE roles
SET permissions_json = '["Search SOPs","Use Guided Finder","Browse Categories","Submit Requests","Create SOPs","Edit Drafts","Review SOPs","Request Changes","Approve SOPs","Publish SOPs","Archive SOPs","Manage Users","Manage Categories","Manage Tags","View Analytics","Upload Media","Manage Media","Settings"]'
WHERE id = 'role-admin';

CREATE TABLE IF NOT EXISTS sop_workflow_states (
  status TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  is_terminal INTEGER NOT NULL DEFAULT 0 CHECK (is_terminal IN (0, 1)),
  description TEXT
);

CREATE TABLE IF NOT EXISTS sop_workflow_transitions (
  id TEXT PRIMARY KEY,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  action TEXT NOT NULL,
  label TEXT NOT NULL,
  required_permission TEXT NOT NULL,
  creates_review INTEGER NOT NULL DEFAULT 0 CHECK (creates_review IN (0, 1)),
  requires_notes INTEGER NOT NULL DEFAULT 0 CHECK (requires_notes IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (from_status) REFERENCES sop_workflow_states(status) ON DELETE CASCADE,
  FOREIGN KEY (to_status) REFERENCES sop_workflow_states(status) ON DELETE CASCADE,
  FOREIGN KEY (required_permission) REFERENCES permissions(name) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sop_assignments (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL,
  version_id TEXT,
  user_id TEXT,
  team_id TEXT,
  assignment_type TEXT NOT NULL
    CHECK (assignment_type IN ('Owner', 'Reviewer', 'Approver', 'Publisher', 'Subject Matter Expert')),
  status TEXT NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active', 'Completed', 'Removed')),
  assigned_by_user_id TEXT,
  due_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES sop_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS admin_analytics_rollup_jobs (
  id TEXT PRIMARY KEY,
  metric_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Queued'
    CHECK (status IN ('Queued', 'Running', 'Completed', 'Failed')),
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO sop_workflow_states (status, label, sort_order, is_terminal, description) VALUES
  ('Draft', 'Draft', 10, 0, 'Creator is drafting or editing an SOP version.'),
  ('In Review', 'In Review', 20, 0, 'Reviewer is checking the draft for accuracy and completeness.'),
  ('Needs Revision', 'Needs Revision', 30, 0, 'Creator must respond to requested changes.'),
  ('Approved', 'Approved', 40, 0, 'SOP version is approved and ready to publish.'),
  ('Published', 'Published', 50, 0, 'SOP is live for the intended audience.'),
  ('Archived', 'Archived', 60, 1, 'SOP is retired from active use.');

INSERT OR IGNORE INTO sop_workflow_transitions (
  id, from_status, to_status, action, label, required_permission, creates_review, requires_notes, sort_order
) VALUES
  ('transition-submit-review', 'Draft', 'In Review', 'submit-review', 'Submit for review', 'Edit Drafts', 1, 0, 10),
  ('transition-resubmit-review', 'Needs Revision', 'In Review', 'submit-review', 'Resubmit for review', 'Edit Drafts', 1, 0, 20),
  ('transition-request-changes', 'In Review', 'Needs Revision', 'request-changes', 'Request changes', 'Request Changes', 0, 1, 30),
  ('transition-approve', 'In Review', 'Approved', 'approve', 'Approve SOP', 'Approve SOPs', 0, 0, 40),
  ('transition-publish', 'Approved', 'Published', 'publish', 'Publish SOP', 'Publish SOPs', 0, 0, 50),
  ('transition-archive-draft', 'Draft', 'Archived', 'archive', 'Archive draft', 'Archive SOPs', 0, 1, 60),
  ('transition-archive-published', 'Published', 'Archived', 'archive', 'Archive published SOP', 'Archive SOPs', 0, 1, 70);

INSERT OR IGNORE INTO sop_assignments (
  id, sop_id, version_id, user_id, team_id, assignment_type, status, assigned_by_user_id, due_at
)
SELECT
  'assignment-owner-' || sops.id,
  sops.id,
  sops.current_version_id,
  COALESCE(sops.owner_id, sops.owner_user_id),
  sops.owner_team_id,
  'Owner',
  'Active',
  sops.created_by_user_id,
  sops.review_date
FROM sops
WHERE COALESCE(sops.owner_id, sops.owner_user_id, sops.owner_team_id) IS NOT NULL;

INSERT OR IGNORE INTO sop_assignments (
  id, sop_id, version_id, user_id, team_id, assignment_type, status, assigned_by_user_id, due_at
)
SELECT
  'assignment-reviewer-' || sop_reviews.id,
  sop_reviews.sop_id,
  sop_reviews.version_id,
  sop_reviews.reviewer_id,
  NULL,
  'Reviewer',
  CASE WHEN sop_reviews.status IN ('Approved', 'Rejected', 'Published', 'Archived') THEN 'Completed' ELSE 'Active' END,
  NULL,
  NULL
FROM sop_reviews
WHERE sop_reviews.reviewer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sop_assignments_sop ON sop_assignments(sop_id, assignment_type, status);
CREATE INDEX IF NOT EXISTS idx_sop_assignments_user ON sop_assignments(user_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_sop_assignments_team ON sop_assignments(team_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_from ON sop_workflow_transitions(from_status, sort_order);
CREATE INDEX IF NOT EXISTS idx_admin_rollup_jobs_date ON admin_analytics_rollup_jobs(metric_date, status);

CREATE VIEW IF NOT EXISTS v_user_permission_matrix AS
SELECT
  users.id AS user_id,
  users.name AS user_name,
  users.email,
  users.access_level,
  roles.id AS role_id,
  roles.name AS role_name,
  permissions.name AS permission_name,
  permissions.description AS permission_description
FROM users
JOIN user_roles ON user_roles.user_id = users.id
JOIN roles ON roles.id = user_roles.role_id
JOIN role_permissions ON role_permissions.role_id = roles.id
JOIN permissions ON permissions.id = role_permissions.permission_id
WHERE users.status = 'Active'
  AND COALESCE(users.is_active, 1) = 1
  AND roles.status != 'Archived';

CREATE VIEW IF NOT EXISTS v_sop_workflow_board AS
SELECT
  sops.id AS sop_id,
  sops.title,
  sops.status,
  workflow.label AS status_label,
  workflow.sort_order AS status_sort_order,
  sops.current_version_id,
  sops.owner_id,
  owner.name AS owner_name,
  sops.owner_team_id,
  teams.name AS owner_team_name,
  sops.review_due_at,
  sops.review_date,
  COUNT(DISTINCT assignments.id) AS active_assignment_count
FROM sops
LEFT JOIN sop_workflow_states workflow ON workflow.status = sops.status
LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
LEFT JOIN teams ON teams.id = sops.owner_team_id
LEFT JOIN sop_assignments assignments ON assignments.sop_id = sops.id
  AND assignments.status = 'Active'
WHERE COALESCE(sops.is_active, 1) = 1
GROUP BY sops.id;

CREATE VIEW IF NOT EXISTS v_admin_analytics_snapshot AS
SELECT
  'published_sops' AS metric_name,
  'all' AS dimension_key,
  'all' AS dimension_value,
  COUNT(*) AS metric_value
FROM sops
WHERE status = 'Published'
UNION ALL
SELECT 'open_reviews', 'status', status, COUNT(*)
FROM sop_reviews
WHERE status NOT IN ('Approved', 'Rejected', 'Published', 'Archived')
GROUP BY status
UNION ALL
SELECT 'open_requests', 'status', status, COUNT(*)
FROM sop_requests
WHERE status NOT IN ('approved', 'published', 'archived')
GROUP BY status
UNION ALL
SELECT 'no_result_searches', 'all', 'all', COUNT(*)
FROM search_logs
WHERE no_results = 1;
