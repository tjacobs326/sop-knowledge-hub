ALTER TABLE media_assets ADD COLUMN is_decorative INTEGER NOT NULL DEFAULT 0 CHECK (is_decorative IN (0, 1));
