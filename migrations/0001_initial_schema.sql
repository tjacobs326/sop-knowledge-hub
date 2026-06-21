-- SOP Knowledge Hub production foundation schema.
-- Target: Cloudflare D1 / SQLite.
-- IDs are TEXT so the application can provide UUIDs or stable external identity IDs.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  department TEXT,
  team_id TEXT,
  role_id TEXT,
  access_level TEXT NOT NULL DEFAULT 'Normal User'
    CHECK (access_level IN ('Normal User', 'Creator / Reviewer', 'Admin')),
  status TEXT NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active', 'Pending', 'Suspended', 'Archived')),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active', 'Needs Review', 'Deprecated')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sops (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL,
  category_id TEXT,
  owner_user_id TEXT,
  owner_team_id TEXT,
  status TEXT NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'In Review', 'Approved', 'Needs Revision', 'Published', 'Archived')),
  type TEXT NOT NULL DEFAULT 'Process'
    CHECK (type IN ('Process', 'Troubleshooting Guide', 'Template', 'Checklist', 'Job Aid', 'Decision Tree')),
  current_version_id TEXT,
  estimated_completion_time TEXT,
  review_date TEXT,
  created_by_user_id TEXT,
  approved_by_user_id TEXT,
  published_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (owner_team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sop_versions (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL,
  version_label TEXT NOT NULL,
  title TEXT NOT NULL,
  purpose TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  change_summary TEXT,
  status TEXT NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'In Review', 'Approved', 'Needs Revision', 'Published', 'Archived')),
  created_by_user_id TEXT,
  reviewed_by_user_id TEXT,
  approved_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  approved_at TEXT,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (sop_id, version_label)
);

CREATE TABLE IF NOT EXISTS sop_tags (
  sop_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sop_id, tag_id),
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  request_type TEXT NOT NULL
    CHECK (
      request_type IN (
        'Request a new SOP',
        'Submit a draft SOP',
        'Suggest an update to an existing SOP',
        'Report an issue with an SOP',
        'Request a template'
      )
    ),
  title TEXT NOT NULL,
  description TEXT,
  business_need TEXT,
  department TEXT,
  category_id TEXT,
  requested_sop_id TEXT,
  submitted_by_user_id TEXT,
  submitter_name TEXT,
  submitter_email TEXT,
  assigned_to_user_id TEXT,
  priority TEXT NOT NULL DEFAULT 'Medium'
    CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  status TEXT NOT NULL DEFAULT 'Submitted'
    CHECK (
      status IN (
        'Submitted',
        'Triage',
        'Assigned',
        'Drafting',
        'In Review',
        'Needs More Information',
        'Needs Revision',
        'Approved',
        'Published',
        'Archived'
      )
    ),
  desired_completion_date TEXT,
  review_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (requested_sop_id) REFERENCES sops(id) ON DELETE SET NULL,
  FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  sop_id TEXT,
  sop_version_id TEXT,
  request_id TEXT,
  reviewer_user_id TEXT,
  assigned_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'Assigned'
    CHECK (status IN ('Assigned', 'In Review', 'Needs Revision', 'Approved', 'Rejected', 'Published', 'Archived')),
  priority TEXT NOT NULL DEFAULT 'Medium'
    CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  due_date TEXT,
  completed_at TEXT,
  decision_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE,
  FOREIGN KEY (sop_version_id) REFERENCES sop_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  sop_id TEXT,
  sop_version_id TEXT,
  request_id TEXT,
  review_id TEXT,
  author_user_id TEXT,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'Internal'
    CHECK (visibility IN ('Internal', 'Requester', 'Public')),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE,
  FOREIGN KEY (sop_version_id) REFERENCES sop_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  sop_id TEXT,
  sop_version_id TEXT,
  request_id TEXT,
  comment_id TEXT,
  uploaded_by_user_id TEXT,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size_bytes INTEGER,
  storage_provider TEXT NOT NULL DEFAULT 'r2',
  storage_key TEXT NOT NULL,
  alt_text TEXT,
  caption TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE,
  FOREIGN KEY (sop_version_id) REFERENCES sop_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS search_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  query TEXT NOT NULL,
  filters_json TEXT NOT NULL DEFAULT '{}',
  results_count INTEGER NOT NULL DEFAULT 0,
  clicked_sop_id TEXT,
  no_results INTEGER NOT NULL DEFAULT 0 CHECK (no_results IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (clicked_sop_id) REFERENCES sops(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL,
  user_id TEXT,
  rating TEXT NOT NULL CHECK (rating IN ('Helpful', 'Not Helpful')),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  entity_type TEXT,
  entity_id TEXT,
  channel TEXT NOT NULL DEFAULT 'In App'
    CHECK (channel IN ('In App', 'Email', 'Teams')),
  status TEXT NOT NULL DEFAULT 'Unread'
    CHECK (status IN ('Unread', 'Read', 'Sent', 'Failed', 'Archived')),
  scheduled_for TEXT,
  sent_at TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_team ON users(team_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_sops_category ON sops(category_id);
CREATE INDEX IF NOT EXISTS idx_sops_owner_user ON sops(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_sops_status_review_date ON sops(status, review_date);
CREATE INDEX IF NOT EXISTS idx_sop_versions_sop ON sop_versions(sop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_submitter ON requests(submitted_by_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_assignee ON requests(assigned_to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews(reviewer_user_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_comments_sop ON comments(sop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_request ON comments(request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attachments_sop ON attachments(sop_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_search_logs_query ON search_logs(query, created_at);
CREATE INDEX IF NOT EXISTS idx_search_logs_no_results ON search_logs(no_results, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_sop ON feedback(sop_id, rating);
CREATE INDEX IF NOT EXISTS idx_notifications_user_status ON notifications(user_id, status, created_at);
