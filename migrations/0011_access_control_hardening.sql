-- Harden access-control metadata and align Creator / Reviewer sub-role labels.

PRAGMA foreign_keys = ON;

UPDATE creator_sub_roles
SET
  label = 'Multimedia Specialist',
  description = 'Can create, edit, review, approve, publish, archive, and maintain SOPs owned by the Multimedia department.',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'subrole-multimedia';

UPDATE roles
SET
  name = 'Standard Users',
  description = 'Search, browse, and view published SOPs. May submit requests when enabled.',
  access_group = COALESCE(access_group, 'Authenticated staff'),
  landing_page = COALESCE(landing_page, '/')
WHERE id = 'role-normal-user';

UPDATE roles
SET
  description = 'Create, edit, review, approve, publish, and archive only the SOP work authorized by assigned Creator / Reviewer sub-role and permissions.',
  landing_page = COALESCE(landing_page, '/my-work/')
WHERE id = 'role-creator-reviewer';

UPDATE roles
SET
  description = 'Administer users, roles, sub-roles, taxonomy, analytics, settings, and workflow oversight.',
  landing_page = COALESCE(landing_page, '/admin/users/')
WHERE id = 'role-admin';
