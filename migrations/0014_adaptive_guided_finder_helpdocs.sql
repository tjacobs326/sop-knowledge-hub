-- Adaptive Guided Finder and HelpDocs synchronization metadata.
-- D1 remains authoritative; Vectorize stores only derived embeddings when configured.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS helpdocs_sync_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'Queued'
    CHECK (status IN ('Queued', 'Running', 'Completed', 'Failed')),
  mode TEXT NOT NULL DEFAULT 'incremental'
    CHECK (mode IN ('incremental', 'full')),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  last_successful_sync_at TEXT,
  articles_seen INTEGER NOT NULL DEFAULT 0,
  articles_imported INTEGER NOT NULL DEFAULT 0,
  articles_deactivated INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS helpdocs_articles (
  helpdocs_article_id TEXT PRIMARY KEY,
  sop_id TEXT,
  slug TEXT,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  tags_json TEXT NOT NULL DEFAULT '[]',
  categories_json TEXT NOT NULL DEFAULT '[]',
  body_hash TEXT,
  helpdocs_updated_at TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sop_normalized_metadata (
  sop_id TEXT PRIMARY KEY,
  helpdocs_article_id TEXT,
  summary TEXT,
  body_text TEXT NOT NULL DEFAULT '',
  department_json TEXT NOT NULL DEFAULT '[]',
  audience_roles_json TEXT NOT NULL DEFAULT '[]',
  intent TEXT,
  systems_json TEXT NOT NULL DEFAULT '[]',
  processes_json TEXT NOT NULL DEFAULT '[]',
  task_types_json TEXT NOT NULL DEFAULT '[]',
  topics_json TEXT NOT NULL DEFAULT '[]',
  problem_types_json TEXT NOT NULL DEFAULT '[]',
  approval_types_json TEXT NOT NULL DEFAULT '[]',
  keywords_json TEXT NOT NULL DEFAULT '[]',
  access_groups_json TEXT NOT NULL DEFAULT '[]',
  search_text TEXT NOT NULL DEFAULT '',
  taxonomy_version INTEGER NOT NULL DEFAULT 1,
  classification_status TEXT NOT NULL DEFAULT 'deterministic'
    CHECK (classification_status IN ('deterministic', 'ai_validated', 'needs_review')),
  vector_status TEXT NOT NULL DEFAULT 'not_configured'
    CHECK (vector_status IN ('not_configured', 'queued', 'upserted', 'failed', 'removed')),
  confidence INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sop_id) REFERENCES sops(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guided_finder_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  role TEXT,
  sub_role_id TEXT,
  selected_answers_json TEXT NOT NULL DEFAULT '{}',
  candidate_ids_json TEXT NOT NULL DEFAULT '[]',
  current_step INTEGER NOT NULL DEFAULT 1,
  max_steps INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'no_results', 'expired')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS guided_finder_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  step INTEGER NOT NULL,
  dimension TEXT NOT NULL,
  value TEXT NOT NULL,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES guided_finder_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_helpdocs_articles_active_updated
  ON helpdocs_articles(is_active, helpdocs_updated_at);

CREATE INDEX IF NOT EXISTS idx_helpdocs_sync_runs_started
  ON helpdocs_sync_runs(started_at DESC, status);

CREATE INDEX IF NOT EXISTS idx_sop_normalized_metadata_intent
  ON sop_normalized_metadata(intent, updated_at);

CREATE INDEX IF NOT EXISTS idx_sop_normalized_metadata_helpdocs
  ON sop_normalized_metadata(helpdocs_article_id);

CREATE INDEX IF NOT EXISTS idx_guided_finder_sessions_user
  ON guided_finder_sessions(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_guided_finder_events_session
  ON guided_finder_events(session_id, step);
