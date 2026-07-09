-- Keep Instructional Technology SOP ownership independent of a single HelpDocs author.
-- Kevan Van Cleave remains a current author mapping, but future imports can also
-- identify the department by HelpDocs category, tag, title, and URL metadata.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS creator_sub_role_import_rules (
  id TEXT PRIMARY KEY,
  sub_role_id TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'HelpDocs',
  field_scope TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'contains'
    CHECK (match_type IN ('contains', 'exact', 'word')),
  match_value TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active', 'Inactive', 'Archived')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sub_role_id) REFERENCES creator_sub_roles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_creator_sub_role_import_rules_lookup
  ON creator_sub_role_import_rules(source_type, status, priority, sub_role_id);

UPDATE teams
SET description = 'Owns Instructional Technology SOPs identified by HelpDocs author, category, tag, title, or URL metadata.',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'team-instructional-technology-specialists';

UPDATE creator_sub_roles
SET description = 'Can create, edit, review, approve, publish, archive, and maintain SOPs owned by the Instructional Technology department, including current Kevan Van Cleave HelpDocs articles and future HelpDocs articles identified by Instructional Technology metadata.',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'subrole-instructional-technology-specialist';

UPDATE creator_sub_role_authors
SET notes = 'Current HelpDocs author mapping for Instructional Technology; metadata import rules also assign future Instructional Technology SOPs when author changes.',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'author-kevan-its';

INSERT OR IGNORE INTO creator_sub_role_import_rules (
  id, sub_role_id, source_type, field_scope, match_type, match_value, priority, notes
) VALUES
  ('rule-its-department', 'subrole-instructional-technology-specialist', 'HelpDocs', 'category|tag|title|url', 'contains', 'instructional technology', 10, 'Primary department signal for future Instructional Technology SOP ownership.'),
  ('rule-its-role', 'subrole-instructional-technology-specialist', 'HelpDocs', 'category|tag|title|url', 'contains', 'instructional technologist', 15, 'Role label signal for Instructional Technology ownership.'),
  ('rule-its-acronym', 'subrole-instructional-technology-specialist', 'HelpDocs', 'category|tag|title|url', 'word', 'its', 20, 'Department acronym signal, matched as a word.'),
  ('rule-its-ivanti', 'subrole-instructional-technology-specialist', 'HelpDocs', 'category|tag|title|url', 'contains', 'ivanti', 30, 'Instructional Technology ticketing tool signal.'),
  ('rule-its-ticketing', 'subrole-instructional-technology-specialist', 'HelpDocs', 'category|tag|title|url', 'contains', 'ticketing', 35, 'Instructional Technology support workflow signal.'),
  ('rule-its-ticket-routing', 'subrole-instructional-technology-specialist', 'HelpDocs', 'category|tag|title|url', 'contains', 'ticket routing', 36, 'Instructional Technology support routing signal.'),
  ('rule-its-course-support', 'subrole-instructional-technology-specialist', 'HelpDocs', 'category|tag|title|url', 'contains', 'course support', 40, 'Course support ownership signal.'),
  ('rule-its-student-support', 'subrole-instructional-technology-specialist', 'HelpDocs', 'category|tag|title|url', 'contains', 'student support', 45, 'Student support ownership signal.'),
  ('rule-its-brightspace', 'subrole-instructional-technology-specialist', 'HelpDocs', 'category|tag|title|url', 'contains', 'brightspace', 50, 'Instructional Technology platform ownership signal.'),
  ('rule-its-d2l', 'subrole-instructional-technology-specialist', 'HelpDocs', 'category|tag|title|url', 'word', 'd2l', 51, 'Instructional Technology platform acronym signal.'),
  ('rule-its-cengage', 'subrole-instructional-technology-specialist', 'HelpDocs', 'category|tag|title|url', 'contains', 'cengage', 55, 'Instructional Technology integration signal.'),
  ('rule-its-lms', 'subrole-instructional-technology-specialist', 'HelpDocs', 'category|tag|title|url', 'word', 'lms', 60, 'Learning management system signal.'),
  ('rule-its-access-issue', 'subrole-instructional-technology-specialist', 'HelpDocs', 'category|tag|title|url', 'contains', 'access issue', 65, 'Access support signal.'),
  ('rule-its-enrollment-issue', 'subrole-instructional-technology-specialist', 'HelpDocs', 'category|tag|title|url', 'contains', 'enrollment issue', 66, 'Enrollment support signal.');
