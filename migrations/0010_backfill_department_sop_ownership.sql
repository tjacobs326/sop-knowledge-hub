-- Backfill department ownership for every existing SOP so Creator / Reviewer
-- sub-roles can maintain only their department's SOPs.

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO creator_sub_role_import_rules (
  id, sub_role_id, source_type, field_scope, match_type, match_value, priority, notes
) VALUES
  ('rule-qa-category', 'subrole-quality-assurance-specialist', 'HelpDocs', 'category|tag|title|url', 'contains', 'qa', 10, 'Quality Assurance category and title signal.'),
  ('rule-qa-quality-assurance', 'subrole-quality-assurance-specialist', 'HelpDocs', 'category|tag|title|url', 'contains', 'quality assurance', 10, 'Quality Assurance department signal.'),
  ('rule-qa-clw', 'subrole-quality-assurance-specialist', 'HelpDocs', 'category|tag|title|url', 'word', 'clw', 20, 'CLW QA process signal.'),
  ('rule-qa-test', 'subrole-quality-assurance-specialist', 'HelpDocs', 'category|tag|title|url', 'contains', 'test', 30, 'Assessment/test QA signal.'),
  ('rule-qa-quiz', 'subrole-quality-assurance-specialist', 'HelpDocs', 'category|tag|title|url', 'contains', 'quiz', 31, 'Quiz QA signal.'),
  ('rule-mm-media', 'subrole-multimedia', 'HelpDocs', 'category|tag|title|url', 'contains', 'media', 10, 'Multimedia ownership signal.'),
  ('rule-mm-video', 'subrole-multimedia', 'HelpDocs', 'category|tag|title|url', 'contains', 'video', 20, 'Video/media ownership signal.'),
  ('rule-mm-audio', 'subrole-multimedia', 'HelpDocs', 'category|tag|title|url', 'contains', 'audio', 21, 'Audio/media ownership signal.'),
  ('rule-mm-caption', 'subrole-multimedia', 'HelpDocs', 'category|tag|title|url', 'contains', 'caption', 22, 'Caption/transcript ownership signal.'),
  ('rule-id-course-build', 'subrole-instructional-designer', 'HelpDocs', 'category|tag|title|url', 'contains', 'course build', 10, 'Instructional Design course build signal.'),
  ('rule-id-template', 'subrole-instructional-designer', 'HelpDocs', 'category|tag|title|url', 'contains', 'template', 15, 'Instructional Design template signal.'),
  ('rule-id-course-design', 'subrole-instructional-designer', 'HelpDocs', 'category|tag|title|url', 'contains', 'course design', 20, 'Instructional Design course design signal.'),
  ('rule-id-course-content', 'subrole-instructional-designer', 'HelpDocs', 'category|tag|title|url', 'contains', 'course content', 21, 'Instructional Design course content signal.'),
  ('rule-id-objectives', 'subrole-instructional-designer', 'HelpDocs', 'category|tag|title|url', 'contains', 'objectives', 25, 'Instructional Design learning-objective signal.'),
  ('rule-pm-workforce', 'subrole-project-manager', 'HelpDocs', 'category|tag|title|url', 'contains', 'workforce transformation', 10, 'Project Management workforce operations signal.'),
  ('rule-pm-anthology', 'subrole-project-manager', 'HelpDocs', 'category|tag|title|url', 'contains', 'anthology', 20, 'Project Management operational platform process signal.'),
  ('rule-pm-registration', 'subrole-project-manager', 'HelpDocs', 'category|tag|title|url', 'contains', 'registration', 25, 'Project Management registration process signal.'),
  ('rule-pm-license', 'subrole-project-manager', 'HelpDocs', 'category|tag|title|url', 'contains', 'license', 26, 'Project Management licensing process signal.'),
  ('rule-pm-adobe-sign', 'subrole-project-manager', 'HelpDocs', 'category|tag|title|url', 'contains', 'adobe sign', 27, 'Project Management form-routing process signal.');

UPDATE sops
SET owner_sub_role_id = CASE
    WHEN EXISTS (
      SELECT 1
      FROM categories
      WHERE categories.id = sops.category_id
        AND (
          lower(categories.name) LIKE '%qa%'
          OR lower(categories.name) LIKE '%quality assurance%'
        )
    )
      OR lower(sops.title) LIKE '% qa%'
      OR lower(sops.title) LIKE 'qa%'
      OR lower(sops.title) LIKE '%clw-%'
      OR lower(sops.title) LIKE '%question%'
      OR lower(sops.title) LIKE '%test%'
      OR lower(sops.title) LIKE '%quiz%'
      THEN 'subrole-quality-assurance-specialist'

    WHEN EXISTS (
      SELECT 1
      FROM categories
      WHERE categories.id = sops.category_id
        AND (
          lower(categories.name) LIKE '%brightspace%'
          OR lower(categories.name) LIKE '%d2l%'
          OR lower(categories.name) LIKE '%its%'
          OR lower(categories.name) LIKE '%ivanti%'
          OR lower(categories.name) LIKE '%ticket%'
          OR lower(categories.name) LIKE '%troubleshooting%'
          OR lower(categories.name) LIKE '%nasium%'
        )
    )
      OR lower(sops.title) LIKE '%brightspace%'
      OR lower(sops.title) LIKE '%d2l%'
      OR lower(sops.title) LIKE '%its%'
      OR lower(sops.title) LIKE '%ivanti%'
      OR lower(sops.title) LIKE '%ticket%'
      OR lower(sops.title) LIKE '%nasium%'
      OR lower(sops.title) LIKE '%password%'
      OR lower(sops.title) LIKE '%grade report%'
      THEN 'subrole-instructional-technology-specialist'

    WHEN EXISTS (
      SELECT 1
      FROM categories
      WHERE categories.id = sops.category_id
        AND lower(categories.name) LIKE '%media%'
    )
      OR lower(sops.title) LIKE '%media%'
      OR lower(sops.title) LIKE '%video%'
      OR lower(sops.title) LIKE '%audio%'
      OR lower(sops.title) LIKE '%caption%'
      OR lower(sops.title) LIKE '%transcript%'
      THEN 'subrole-multimedia'

    WHEN EXISTS (
      SELECT 1
      FROM categories
      WHERE categories.id = sops.category_id
        AND lower(categories.name) LIKE '%workforce transformation%'
    )
      OR lower(sops.title) LIKE '%anthology%'
      OR lower(sops.title) LIKE '%registration%'
      OR lower(sops.title) LIKE '%license%'
      OR lower(sops.title) LIKE '%identogo%'
      OR lower(sops.title) LIKE '%adobe sign%'
      OR lower(sops.title) LIKE '%learner%'
      OR lower(sops.title) LIKE '%student%'
      THEN 'subrole-project-manager'

    WHEN EXISTS (
      SELECT 1
      FROM categories
      WHERE categories.id = sops.category_id
        AND (
          lower(categories.name) LIKE '%course build%'
          OR lower(categories.name) LIKE '%template%'
          OR lower(categories.name) LIKE '%ai tools%'
        )
    )
      OR lower(sops.title) LIKE '%course build%'
      OR lower(sops.title) LIKE '%template%'
      OR lower(sops.title) LIKE '%course design%'
      OR lower(sops.title) LIKE '%course content%'
      OR lower(sops.title) LIKE '%objectives%'
      THEN 'subrole-instructional-designer'

    ELSE 'subrole-instructional-designer'
  END,
  updated_at = CURRENT_TIMESTAMP
WHERE owner_sub_role_id IS NULL;

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
  'assignment-owner-subrole-backfill-' || sops.id,
  sops.id,
  sops.current_version_id,
  COALESCE(sops.owner_id, sops.owner_user_id),
  sops.owner_team_id,
  'Owner',
  'Active',
  sops.created_by_user_id,
  sops.review_date
FROM sops
WHERE sops.owner_sub_role_id IS NOT NULL
  AND sops.owner_team_id IS NOT NULL;
