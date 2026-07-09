-- Align the Instructional Technology creator sub-role label and harden
-- HelpDocs ownership for all SOPs authored by Kevan Van Cleave.

PRAGMA foreign_keys = ON;

UPDATE teams
SET name = 'Instructional Technologists',
    description = 'Owns HelpDocs SOPs authored by Kevan Van Cleave.',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'team-instructional-technology-specialists';

UPDATE creator_sub_roles
SET label = 'Instructional Technologist',
    slug = 'instructional-technologist',
    department = 'Instructional Technology',
    team_id = 'team-instructional-technology-specialists',
    description = 'Can create, edit, review, approve, publish, archive, and maintain SOPs associated with HelpDocs author Kevan Van Cleave.',
    status = 'Active',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'subrole-instructional-technology-specialist';

UPDATE creator_sub_role_authors
SET author_name = 'Kevan Van Cleave',
    match_priority = 1,
    match_expression = 'author:exact',
    notes = 'Every HelpDocs SOP authored by Kevan Van Cleave is owned by the Instructional Technologist sub-role.',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'author-kevan-its';

UPDATE users
SET department = 'Instructional Technology',
    title = 'Instructional Technologist',
    team_id = 'team-instructional-technology-specialists',
    access_level = 'Creator / Reviewer',
    role_id = COALESCE(role_id, 'role-creator-reviewer'),
    updated_at = CURRENT_TIMESTAMP
WHERE lower(name) = lower('Kevan Van Cleave');

INSERT OR IGNORE INTO user_sub_roles (user_id, sub_role_id)
SELECT users.id, 'subrole-instructional-technology-specialist'
FROM users
WHERE lower(users.name) = lower('Kevan Van Cleave')
   OR lower(users.email) LIKE '%kevan%';

UPDATE sops
SET owner_sub_role_id = 'subrole-instructional-technology-specialist',
    owner_team_id = 'team-instructional-technology-specialists',
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT sops.id
  FROM sops
  JOIN sop_versions ON sop_versions.id = sops.current_version_id
  WHERE json_extract(sop_versions.metadata_json, '$.author.name') = 'Kevan Van Cleave'
);

INSERT OR IGNORE INTO sop_assignments (
  id, sop_id, version_id, user_id, team_id, assignment_type, status, assigned_by_user_id, due_at
)
SELECT
  'assignment-owner-kevan-' || sops.id,
  sops.id,
  sops.current_version_id,
  COALESCE(sops.owner_id, sops.owner_user_id),
  'team-instructional-technology-specialists',
  'Owner',
  'Active',
  sops.created_by_user_id,
  sops.review_date
FROM sops
JOIN sop_versions ON sop_versions.id = sops.current_version_id
WHERE json_extract(sop_versions.metadata_json, '$.author.name') = 'Kevan Van Cleave';
