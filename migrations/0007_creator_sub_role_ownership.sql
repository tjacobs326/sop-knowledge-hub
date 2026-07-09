-- Department sub-role ownership for Creator / Reviewer SOP control.
-- Normal users can view published SOPs. Creator / Reviewer users can mutate only
-- SOPs owned by their selected sub-role.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS creator_sub_roles (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  department TEXT NOT NULL,
  team_id TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active', 'Inactive', 'Archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS creator_sub_role_authors (
  id TEXT PRIMARY KEY,
  sub_role_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_email TEXT,
  match_priority INTEGER NOT NULL DEFAULT 100,
  match_expression TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sub_role_id) REFERENCES creator_sub_roles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_sub_roles (
  user_id TEXT NOT NULL,
  sub_role_id TEXT NOT NULL,
  granted_by_user_id TEXT,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  PRIMARY KEY (user_id, sub_role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sub_role_id) REFERENCES creator_sub_roles(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE sops ADD COLUMN owner_sub_role_id TEXT REFERENCES creator_sub_roles(id) ON DELETE SET NULL;

INSERT OR IGNORE INTO teams (id, name, description, created_at, updated_at) VALUES
  ('team-instructional-technology-specialists', 'Instructional Technology Specialists', 'Owns HelpDocs SOPs authored by Kevan Van Cleave.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team-instructional-designers', 'Instructional Designers', 'Owns instructional design HelpDocs SOPs authored by Craig Cuatt.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team-project-managers', 'Project Managers', 'Owns project management HelpDocs SOPs authored by Craig Cuatt.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team-quality-assurance-specialists', 'Quality Assurance Specialists', 'Owns HelpDocs SOPs authored by Amy Lakin.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team-multimedia', 'Multimedia', 'Owns HelpDocs SOPs authored by John Winchester.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO creator_sub_roles (
  id, label, slug, department, team_id, description, sort_order
) VALUES
  ('subrole-instructional-technology-specialist', 'Instructional Technology Specialist', 'instructional-technology-specialist', 'Instructional Technology', 'team-instructional-technology-specialists', 'Can create, edit, review, approve, publish, archive, and maintain SOPs associated with HelpDocs author Kevan Van Cleave.', 10),
  ('subrole-instructional-designer', 'Instructional Designer', 'instructional-designer', 'Instructional Design', 'team-instructional-designers', 'Can create, edit, review, approve, publish, archive, and maintain instructional design SOPs associated with HelpDocs author Craig Cuatt.', 20),
  ('subrole-project-manager', 'Project Manager', 'project-manager', 'Project Management', 'team-project-managers', 'Can create, edit, review, approve, publish, archive, and maintain project management SOPs associated with HelpDocs author Craig Cuatt.', 30),
  ('subrole-quality-assurance-specialist', 'Quality Assurance Specialist', 'quality-assurance-specialist', 'Quality Assurance', 'team-quality-assurance-specialists', 'Can create, edit, review, approve, publish, archive, and maintain SOPs associated with HelpDocs author Amy Lakin.', 40),
  ('subrole-multimedia', 'Multimedia', 'multimedia', 'Multimedia', 'team-multimedia', 'Can create, edit, review, approve, publish, archive, and maintain SOPs associated with HelpDocs author John Winchester.', 50);

INSERT OR IGNORE INTO creator_sub_role_authors (
  id, sub_role_id, author_name, match_priority, match_expression, notes
) VALUES
  ('author-kevan-its', 'subrole-instructional-technology-specialist', 'Kevan Van Cleave', 10, 'author', 'Default owner for Kevan Van Cleave HelpDocs articles.'),
  ('author-craig-id', 'subrole-instructional-designer', 'Craig Cuatt', 20, 'author:not-project-management', 'Default owner for Craig Cuatt HelpDocs articles unless project-management metadata matches.'),
  ('author-criag-id', 'subrole-instructional-designer', 'Criag Cuatt', 20, 'author:not-project-management', 'Typo-tolerant author mapping.'),
  ('author-craig-pm', 'subrole-project-manager', 'Craig Cuatt', 10, 'title-or-tags:pm|project|scoping|charter|stakeholder|timeline|milestone', 'Project-management owner for Craig Cuatt articles with PM metadata.'),
  ('author-criag-pm', 'subrole-project-manager', 'Criag Cuatt', 10, 'title-or-tags:pm|project|scoping|charter|stakeholder|timeline|milestone', 'Typo-tolerant project-management author mapping.'),
  ('author-amy-qa', 'subrole-quality-assurance-specialist', 'Amy Lakin', 10, 'author', 'Default owner for Amy Lakin HelpDocs articles.'),
  ('author-john-mm', 'subrole-multimedia', 'John Winchester', 10, 'author', 'Default owner for John Winchester HelpDocs articles.');

INSERT OR IGNORE INTO user_sub_roles (user_id, sub_role_id)
SELECT users.id, 'subrole-instructional-technology-specialist'
FROM users
WHERE lower(users.name) = lower('Kevan Van Cleave')
   OR lower(users.email) LIKE '%kevan%';

INSERT OR IGNORE INTO user_sub_roles (user_id, sub_role_id)
SELECT users.id, 'subrole-instructional-designer'
FROM users
WHERE lower(users.name) IN (lower('Craig Cuatt'), lower('Criag Cuatt'))
   OR lower(users.email) LIKE '%craig%'
   OR lower(users.email) LIKE '%criag%';

INSERT OR IGNORE INTO user_sub_roles (user_id, sub_role_id)
SELECT users.id, 'subrole-project-manager'
FROM users
WHERE lower(users.name) IN (lower('Craig Cuatt'), lower('Criag Cuatt'))
   OR lower(users.email) LIKE '%craig%'
   OR lower(users.email) LIKE '%criag%';

INSERT OR IGNORE INTO user_sub_roles (user_id, sub_role_id)
SELECT users.id, 'subrole-quality-assurance-specialist'
FROM users
WHERE lower(users.name) = lower('Amy Lakin')
   OR lower(users.email) LIKE '%amy%';

INSERT OR IGNORE INTO user_sub_roles (user_id, sub_role_id)
SELECT users.id, 'subrole-multimedia'
FROM users
WHERE lower(users.name) = lower('John Winchester')
   OR lower(users.email) LIKE '%john%winchester%';

UPDATE users
SET department = 'Instructional Technology',
    title = COALESCE(title, 'Instructional Technology Specialist'),
    team_id = COALESCE(team_id, 'team-instructional-technology-specialists'),
    access_level = 'Creator / Reviewer',
    role_id = COALESCE(role_id, 'role-creator-reviewer'),
    updated_at = CURRENT_TIMESTAMP
WHERE lower(name) = lower('Kevan Van Cleave');

UPDATE users
SET department = COALESCE(department, 'Instructional Design / Project Management'),
    title = COALESCE(title, 'Instructional Designer / Project Manager'),
    access_level = 'Creator / Reviewer',
    role_id = COALESCE(role_id, 'role-creator-reviewer'),
    updated_at = CURRENT_TIMESTAMP
WHERE lower(name) IN (lower('Craig Cuatt'), lower('Criag Cuatt'));

UPDATE users
SET department = 'Quality Assurance',
    title = COALESCE(title, 'Quality Assurance Specialist'),
    team_id = COALESCE(team_id, 'team-quality-assurance-specialists'),
    access_level = 'Creator / Reviewer',
    role_id = COALESCE(role_id, 'role-creator-reviewer'),
    updated_at = CURRENT_TIMESTAMP
WHERE lower(name) = lower('Amy Lakin');

UPDATE users
SET department = 'Multimedia',
    title = COALESCE(title, 'Multimedia'),
    team_id = COALESCE(team_id, 'team-multimedia'),
    access_level = 'Creator / Reviewer',
    role_id = COALESCE(role_id, 'role-creator-reviewer'),
    updated_at = CURRENT_TIMESTAMP
WHERE lower(name) = lower('John Winchester');

UPDATE sops
SET owner_sub_role_id = CASE
    WHEN lower(COALESCE(owner.name, '')) = lower('Kevan Van Cleave') THEN 'subrole-instructional-technology-specialist'
    WHEN lower(COALESCE(owner.name, '')) = lower('Amy Lakin') THEN 'subrole-quality-assurance-specialist'
    WHEN lower(COALESCE(owner.name, '')) = lower('John Winchester') THEN 'subrole-multimedia'
    WHEN lower(COALESCE(owner.name, '')) IN (lower('Craig Cuatt'), lower('Criag Cuatt'))
      AND (
        lower(sops.title) LIKE '%pm-%'
        OR lower(sops.title) LIKE '%project%'
        OR lower(sops.title) LIKE '%scoping%'
        OR lower(sops.title) LIKE '%charter%'
        OR EXISTS (
          SELECT 1
          FROM sop_tags
          JOIN tags ON tags.id = sop_tags.tag_id
          WHERE sop_tags.sop_id = sops.id
            AND (
              lower(tags.name) LIKE '%project%'
              OR lower(tags.name) LIKE '%pm%'
              OR lower(tags.name) LIKE '%scoping%'
              OR lower(tags.name) LIKE '%charter%'
              OR lower(tags.name) LIKE '%timeline%'
              OR lower(tags.name) LIKE '%milestone%'
            )
        )
      ) THEN 'subrole-project-manager'
    WHEN lower(COALESCE(owner.name, '')) IN (lower('Craig Cuatt'), lower('Criag Cuatt')) THEN 'subrole-instructional-designer'
    ELSE owner_sub_role_id
  END
FROM users owner
WHERE owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
  AND owner_sub_role_id IS NULL;

UPDATE sops
SET owner_team_id = (
  SELECT team_id
  FROM creator_sub_roles
  WHERE creator_sub_roles.id = sops.owner_sub_role_id
)
WHERE owner_sub_role_id IS NOT NULL
  AND (
    owner_team_id IS NULL
    OR owner_team_id NOT IN (SELECT team_id FROM creator_sub_roles WHERE team_id IS NOT NULL)
  );

INSERT OR IGNORE INTO sop_assignments (
  id, sop_id, version_id, user_id, team_id, assignment_type, status, assigned_by_user_id, due_at
)
SELECT
  'assignment-owner-subrole-' || sops.id,
  sops.id,
  sops.current_version_id,
  COALESCE(sops.owner_id, sops.owner_user_id),
  sops.owner_team_id,
  'Owner',
  'Active',
  sops.created_by_user_id,
  sops.review_date
FROM sops
WHERE sops.owner_sub_role_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_creator_sub_roles_team ON creator_sub_roles(team_id, status);
CREATE INDEX IF NOT EXISTS idx_creator_sub_role_authors_name ON creator_sub_role_authors(author_name, match_priority);
CREATE INDEX IF NOT EXISTS idx_user_sub_roles_user ON user_sub_roles(user_id, sub_role_id);
CREATE INDEX IF NOT EXISTS idx_sops_owner_sub_role ON sops(owner_sub_role_id, status);

CREATE VIEW IF NOT EXISTS v_sop_department_ownership AS
SELECT
  sops.id AS sop_id,
  sops.title,
  sops.status,
  sops.owner_sub_role_id,
  creator_sub_roles.label AS owner_sub_role_label,
  creator_sub_roles.department AS owner_department,
  sops.owner_team_id,
  teams.name AS owner_team_name,
  COALESCE(owner.id, sops.owner_user_id) AS owner_user_id,
  owner.name AS owner_name,
  owner.email AS owner_email
FROM sops
LEFT JOIN creator_sub_roles ON creator_sub_roles.id = sops.owner_sub_role_id
LEFT JOIN teams ON teams.id = sops.owner_team_id
LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id);
