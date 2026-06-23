-- SOP Knowledge Hub backend expansion schema.
-- Target: Cloudflare D1 / SQLite.
-- This migration keeps binary files in R2 and stores searchable, relational metadata in D1.

PRAGMA foreign_keys = ON;

ALTER TABLE roles ADD COLUMN access_level TEXT DEFAULT 'Normal User'
  CHECK (access_level IN ('Normal User', 'Creator / Reviewer', 'Admin'));
ALTER TABLE roles ADD COLUMN access_group TEXT;
ALTER TABLE roles ADD COLUMN landing_page TEXT;
ALTER TABLE roles ADD COLUMN status TEXT DEFAULT 'Active'
  CHECK (status IN ('Active', 'Inactive', 'Archived'));

ALTER TABLE users ADD COLUMN title TEXT;
ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'America/New_York';
ALTER TABLE users ADD COLUMN external_subject TEXT;

ALTER TABLE sops ADD COLUMN visibility TEXT DEFAULT 'Internal'
  CHECK (visibility IN ('Internal', 'Restricted', 'Public'));
ALTER TABLE sops ADD COLUMN source_type TEXT DEFAULT 'Database'
  CHECK (source_type IN ('Markdown', 'Database', 'Imported'));

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  granted_by_user_id TEXT,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS identity_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL
    CHECK (provider IN ('Cloudflare Access', 'Microsoft Entra ID', 'Google Workspace', 'Manual')),
  provider_subject TEXT NOT NULL,
  provider_email TEXT NOT NULL,
  provider_groups_json TEXT NOT NULL DEFAULT '[]',
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (provider, provider_subject)
);

CREATE TABLE IF NOT EXISTS access_groups (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'Cloudflare Access',
  external_id TEXT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  access_level TEXT NOT NULL
    CHECK (access_level IN ('Normal User', 'Creator / Reviewer', 'Admin')),
  status TEXT NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active', 'Inactive', 'Archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_access_groups (
  user_id TEXT NOT NULL,
  access_group_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, access_group_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (access_group_id) REFERENCES access_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  asset_type TEXT NOT NULL
    CHECK (asset_type IN ('Image', 'Video', 'Document', 'Avatar', 'Other')),
  purpose TEXT NOT NULL DEFAULT 'Other'
    CHECK (
      purpose IN (
        'SOP Step',
        'SOP Reference',
        'Request Attachment',
        'Comment Attachment',
        'User Avatar',
        'Admin Evidence',
        'Other'
      )
    ),
  original_file_name TEXT NOT NULL,
  display_name TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_provider TEXT NOT NULL DEFAULT 'r2'
    CHECK (storage_provider IN ('r2', 'external_url', 'legacy_public')),
  bucket_name TEXT,
  object_key TEXT NOT NULL,
  public_url TEXT,
  checksum_sha256 TEXT,
  width_px INTEGER,
  height_px INTEGER,
  duration_seconds INTEGER,
  alt_text TEXT,
  caption TEXT,
  uploaded_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Pending Scan', 'Active', 'Quarantined', 'Archived', 'Deleted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (storage_provider, object_key)
);

CREATE TABLE IF NOT EXISTS sop_media (
  sop_id TEXT NOT NULL,
  media_asset_id TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'Reference'
    CHECK (relationship IN ('Hero', 'Reference', 'Screenshot', 'Attachment')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sop_id, media_asset_id, relationship),
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE,
  FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sop_version_media (
  sop_version_id TEXT NOT NULL,
  media_asset_id TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'Reference'
    CHECK (relationship IN ('Hero', 'Reference', 'Screenshot', 'Attachment')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sop_version_id, media_asset_id, relationship),
  FOREIGN KEY (sop_version_id) REFERENCES sop_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS procedure_steps (
  id TEXT PRIMARY KEY,
  sop_version_id TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sop_version_id) REFERENCES sop_versions(id) ON DELETE CASCADE,
  UNIQUE (sop_version_id, step_number)
);

CREATE TABLE IF NOT EXISTS procedure_step_media (
  procedure_step_id TEXT NOT NULL,
  media_asset_id TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'Instructional Media'
    CHECK (relationship IN ('Instructional Media', 'Evidence', 'Example', 'Warning')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (procedure_step_id, media_asset_id, relationship),
  FOREIGN KEY (procedure_step_id) REFERENCES procedure_steps(id) ON DELETE CASCADE,
  FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sop_publication_events (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL,
  sop_version_id TEXT,
  actor_user_id TEXT,
  event_type TEXT NOT NULL
    CHECK (
      event_type IN (
        'Draft Created',
        'Submitted for Review',
        'Changes Requested',
        'Approved',
        'Published',
        'Archived',
        'Restored'
      )
    ),
  from_status TEXT,
  to_status TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE,
  FOREIGN KEY (sop_version_id) REFERENCES sop_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sop_subscriptions (
  user_id TEXT NOT NULL,
  sop_id TEXT NOT NULL,
  subscription_type TEXT NOT NULL DEFAULT 'Updates'
    CHECK (subscription_type IN ('Updates', 'Review Reminders', 'Ownership')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, sop_id, subscription_type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sop_acknowledgements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sop_id TEXT NOT NULL,
  sop_version_id TEXT,
  acknowledgement_source TEXT NOT NULL DEFAULT 'Manual'
    CHECK (acknowledgement_source IN ('Manual', 'Required Training', 'Review Workflow')),
  acknowledged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE,
  FOREIGN KEY (sop_version_id) REFERENCES sop_versions(id) ON DELETE SET NULL,
  UNIQUE (user_id, sop_id, sop_version_id)
);

CREATE TABLE IF NOT EXISTS sop_favorites (
  user_id TEXT NOT NULL,
  sop_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, sop_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sop_search_documents (
  sop_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  owner TEXT,
  status TEXT,
  tags_text TEXT,
  tools_text TEXT,
  audience_text TEXT,
  body_text TEXT NOT NULL,
  search_text TEXT NOT NULL,
  last_indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS page_view_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  path TEXT NOT NULL,
  referrer TEXT,
  user_agent TEXT,
  session_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sop_view_events (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL,
  sop_version_id TEXT,
  user_id TEXT,
  session_id TEXT,
  source TEXT NOT NULL DEFAULT 'Direct'
    CHECK (source IN ('Direct', 'Search', 'Guided Finder', 'Related SOP', 'Admin', 'External')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE,
  FOREIGN KEY (sop_version_id) REFERENCES sop_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sop_export_events (
  id TEXT PRIMARY KEY,
  sop_id TEXT NOT NULL,
  user_id TEXT,
  export_type TEXT NOT NULL
    CHECK (export_type IN ('Print', 'PDF', 'Copy Link')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS admin_analytics_daily (
  metric_date TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  dimension_key TEXT NOT NULL DEFAULT 'all',
  dimension_value TEXT NOT NULL DEFAULT 'all',
  metric_value INTEGER NOT NULL DEFAULT 0,
  calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (metric_date, metric_name, dimension_key, dimension_value)
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  description TEXT,
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL
    CHECK (job_type IN ('Markdown Import', 'Media Import', 'User Import', 'Analytics Backfill')),
  status TEXT NOT NULL DEFAULT 'Queued'
    CHECK (status IN ('Queued', 'Running', 'Completed', 'Failed')),
  source TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_permissions_name ON permissions(name);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_identity_accounts_user ON identity_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_access_groups_level ON access_groups(access_level, status);
CREATE INDEX IF NOT EXISTS idx_media_assets_type_status ON media_assets(asset_type, status);
CREATE INDEX IF NOT EXISTS idx_media_assets_uploader ON media_assets(uploaded_by_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sop_media_media ON sop_media(media_asset_id);
CREATE INDEX IF NOT EXISTS idx_sop_version_media_media ON sop_version_media(media_asset_id);
CREATE INDEX IF NOT EXISTS idx_procedure_steps_version ON procedure_steps(sop_version_id, step_number);
CREATE INDEX IF NOT EXISTS idx_step_media_asset ON procedure_step_media(media_asset_id);
CREATE INDEX IF NOT EXISTS idx_publication_events_sop ON sop_publication_events(sop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sop_subscriptions_user ON sop_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_sop_acknowledgements_user ON sop_acknowledgements(user_id, acknowledged_at);
CREATE INDEX IF NOT EXISTS idx_sop_favorites_user ON sop_favorites(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sop_search_status ON sop_search_documents(status);
CREATE INDEX IF NOT EXISTS idx_page_view_events_path ON page_view_events(path, created_at);
CREATE INDEX IF NOT EXISTS idx_sop_view_events_sop ON sop_view_events(sop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sop_export_events_sop ON sop_export_events(sop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_analytics_metric ON admin_analytics_daily(metric_name, metric_date);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status, created_at);

CREATE VIEW IF NOT EXISTS v_review_queue_summary AS
SELECT
  status,
  priority,
  COUNT(*) AS item_count,
  MIN(review_date) AS next_due_date
FROM requests
GROUP BY status, priority;

CREATE VIEW IF NOT EXISTS v_sop_status_summary AS
SELECT
  status,
  COUNT(*) AS sop_count,
  MIN(review_date) AS earliest_review_date,
  MAX(updated_at) AS latest_update_at
FROM sops
GROUP BY status;

CREATE VIEW IF NOT EXISTS v_media_usage AS
SELECT
  media_assets.id,
  media_assets.asset_type,
  media_assets.mime_type,
  media_assets.storage_provider,
  media_assets.object_key,
  media_assets.status,
  COUNT(DISTINCT sop_media.sop_id) AS sop_count,
  COUNT(DISTINCT sop_version_media.sop_version_id) AS sop_version_count,
  COUNT(DISTINCT procedure_step_media.procedure_step_id) AS procedure_step_count
FROM media_assets
LEFT JOIN sop_media ON sop_media.media_asset_id = media_assets.id
LEFT JOIN sop_version_media ON sop_version_media.media_asset_id = media_assets.id
LEFT JOIN procedure_step_media ON procedure_step_media.media_asset_id = media_assets.id
GROUP BY media_assets.id;
