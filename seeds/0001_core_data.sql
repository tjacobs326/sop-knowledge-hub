-- SOP Knowledge Hub core seed data.
-- Apply after migrations for local development, preview, or a new production database.

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO teams (id, name, description, created_at, updated_at) VALUES
  ('team-instructional-technology', 'Instructional Technology', 'Owns core SOP governance, review workflows, and platform administration.', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('team-quality-assurance', 'Quality Assurance', 'Reviews course launch checklists, QA procedures, and overdue review items.', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('team-curriculum-design', 'Curriculum Design', 'Maintains AI, template, and instructional design procedures.', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('team-student-services', 'Student Services', 'Submits learner-facing support requests and troubleshooting improvements.', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z');

INSERT OR IGNORE INTO roles (
  id, name, description, permissions_json, access_level, access_group, landing_page, status, created_at, updated_at
) VALUES
  ('role-normal-user', 'Normal Users', 'Search SOPs, use Guided Finder, browse categories, and submit requests.', '["Search SOPs","Use Guided Finder","Browse Categories","Submit Requests"]', 'Normal User', 'All staff', '/search/', 'Active', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('role-creator-reviewer', 'Creators / Reviewers', 'Create SOPs, manage drafts, review submissions, and publish approved work.', '["Create SOPs","Edit Drafts","Review Queue","Needs Review","Publish SOPs"]', 'Creator / Reviewer', 'SOP creators and reviewers', '/drafts/', 'Active', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('role-admin', 'Admins', 'Manage users, taxonomy, analytics, and system settings.', '["Manage Users","Manage Categories","Manage Tags","View Analytics","Settings","Publish SOPs"]', 'Admin', 'SOP administrators', '/admin/users/', 'Active', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z');

INSERT OR IGNORE INTO permissions (id, name, description) VALUES
  ('perm-search-sops', 'Search SOPs', 'Search and open published SOP records.'),
  ('perm-guided-finder', 'Use Guided Finder', 'Use guided question flows to find SOPs.'),
  ('perm-browse-categories', 'Browse Categories', 'Browse SOP taxonomy pages.'),
  ('perm-submit-requests', 'Submit Requests', 'Submit SOP requests and issue reports.'),
  ('perm-create-sops', 'Create SOPs', 'Create draft SOP records.'),
  ('perm-edit-drafts', 'Edit Drafts', 'Edit assigned draft SOP records.'),
  ('perm-review-queue', 'Review Queue', 'Review, assign, approve, publish, and archive SOP work.'),
  ('perm-needs-review', 'Needs Review', 'Use the needs-review reviewer workspace.'),
  ('perm-publish-sops', 'Publish SOPs', 'Publish approved SOP versions.'),
  ('perm-manage-users', 'Manage Users', 'Manage users, roles, and access groups.'),
  ('perm-manage-categories', 'Manage Categories', 'Manage SOP categories.'),
  ('perm-manage-tags', 'Manage Tags', 'Manage SOP tags.'),
  ('perm-view-analytics', 'View Analytics', 'View admin analytics and reporting.'),
  ('perm-settings', 'Settings', 'Manage system settings.');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
  ('role-normal-user', 'perm-search-sops'),
  ('role-normal-user', 'perm-guided-finder'),
  ('role-normal-user', 'perm-browse-categories'),
  ('role-normal-user', 'perm-submit-requests'),
  ('role-creator-reviewer', 'perm-search-sops'),
  ('role-creator-reviewer', 'perm-create-sops'),
  ('role-creator-reviewer', 'perm-edit-drafts'),
  ('role-creator-reviewer', 'perm-review-queue'),
  ('role-creator-reviewer', 'perm-needs-review'),
  ('role-creator-reviewer', 'perm-publish-sops'),
  ('role-admin', 'perm-manage-users'),
  ('role-admin', 'perm-manage-categories'),
  ('role-admin', 'perm-manage-tags'),
  ('role-admin', 'perm-view-analytics'),
  ('role-admin', 'perm-settings'),
  ('role-admin', 'perm-publish-sops');

INSERT OR IGNORE INTO access_groups (id, provider, name, description, access_level, status) VALUES
  ('access-all-staff', 'Cloudflare Access', 'All staff', 'All authenticated organization users.', 'Normal User', 'Active'),
  ('access-sop-creators-reviewers', 'Cloudflare Access', 'SOP creators and reviewers', 'Users allowed to create, review, and publish SOPs.', 'Creator / Reviewer', 'Active'),
  ('access-sop-admins', 'Cloudflare Access', 'SOP administrators', 'Users allowed to administer the SOP platform.', 'Admin', 'Active');

INSERT OR IGNORE INTO users (
  id, name, email, department, title, team_id, role_id, access_level, status, last_login_at, created_at, updated_at
) VALUES
  ('tarek-jacobs', 'Tarek Jacobs', 'tjacobs@example.org', 'Instructional Technology', 'SOP Platform Administrator', 'team-instructional-technology', 'role-admin', 'Admin', 'Active', '2026-06-20T14:12:00Z', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('course-qa-team', 'Course QA Team', 'courseqa@example.org', 'Quality Assurance', 'Course QA Reviewer', 'team-quality-assurance', 'role-creator-reviewer', 'Creator / Reviewer', 'Active', '2026-06-19T19:40:00Z', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('maya-patel', 'Maya Patel', 'maya.patel@example.edu', 'Curriculum Design', 'Curriculum Manager', 'team-curriculum-design', 'role-creator-reviewer', 'Creator / Reviewer', 'Active', '2026-06-20T18:02:00Z', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('jordan-lee', 'Jordan Lee', 'jordan.lee@example.edu', 'Student Services', 'Student Support Specialist', 'team-student-services', 'role-normal-user', 'Normal User', 'Active', '2026-06-18T16:25:00Z', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('staff-user', 'Staff User', 'staff@example.org', 'Academic Operations', 'Staff Member', NULL, 'role-normal-user', 'Normal User', 'Active', '2026-06-16T11:14:00Z', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z');

INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_by_user_id, granted_at) VALUES
  ('tarek-jacobs', 'role-admin', 'tarek-jacobs', '2026-06-01T09:00:00Z'),
  ('course-qa-team', 'role-creator-reviewer', 'tarek-jacobs', '2026-06-01T09:00:00Z'),
  ('maya-patel', 'role-creator-reviewer', 'tarek-jacobs', '2026-06-01T09:00:00Z'),
  ('jordan-lee', 'role-normal-user', 'tarek-jacobs', '2026-06-01T09:00:00Z'),
  ('staff-user', 'role-normal-user', 'tarek-jacobs', '2026-06-01T09:00:00Z');

INSERT OR IGNORE INTO user_access_groups (user_id, access_group_id) VALUES
  ('tarek-jacobs', 'access-sop-admins'),
  ('course-qa-team', 'access-sop-creators-reviewers'),
  ('maya-patel', 'access-sop-creators-reviewers'),
  ('jordan-lee', 'access-all-staff'),
  ('staff-user', 'access-all-staff');

INSERT OR IGNORE INTO identity_accounts (id, user_id, provider, provider_subject, provider_email, last_login_at) VALUES
  ('identity-tarek-jacobs-cloudflare', 'tarek-jacobs', 'Cloudflare Access', 'tjacobs@example.org', 'tjacobs@example.org', '2026-06-20T14:12:00Z'),
  ('identity-course-qa-cloudflare', 'course-qa-team', 'Cloudflare Access', 'courseqa@example.org', 'courseqa@example.org', '2026-06-19T19:40:00Z'),
  ('identity-maya-patel-cloudflare', 'maya-patel', 'Cloudflare Access', 'maya.patel@example.edu', 'maya.patel@example.edu', '2026-06-20T18:02:00Z'),
  ('identity-jordan-lee-cloudflare', 'jordan-lee', 'Cloudflare Access', 'jordan.lee@example.edu', 'jordan.lee@example.edu', '2026-06-18T16:25:00Z'),
  ('identity-staff-user-cloudflare', 'staff-user', 'Cloudflare Access', 'staff@example.org', 'staff@example.org', '2026-06-16T11:14:00Z');

INSERT OR IGNORE INTO categories (id, name, slug, description, icon, color, sort_order, created_at, updated_at) VALUES
  ('category-ivanti-ticketing-system', 'Ivanti / Ticketing System', 'ivanti-ticketing-system', 'Guides for submitting, updating, routing, and resolving tickets.', 'IT', '#e0f2fe', 10, '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('category-brightspace-d2l', 'Brightspace D2L', 'brightspace-d2l', 'Guides for managing courses, content, settings, and user experiences in Brightspace D2L.', 'D2L', '#fef3c7', 20, '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('category-course-builds', 'Course Builds', 'course-builds', 'Processes and checklists for building, updating, and preparing courses.', 'CB', '#ede9fe', 30, '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('category-qa-processes', 'QA Processes', 'qa-processes', 'Quality assurance reviews, launch checks, and issue documentation procedures.', 'QA', '#dcfce7', 40, '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('category-ai-tools', 'AI Tools', 'ai-tools', 'Approved AI workflows, prompt guidance, review practices, and responsible use procedures.', 'AI', '#fce7f3', 50, '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('category-troubleshooting', 'Troubleshooting', 'troubleshooting', 'Step-by-step guides for diagnosing and resolving common problems.', 'TR', '#fee2e2', 60, '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('category-templates', 'Templates', 'templates', 'Reusable forms, checklists, prompts, and documentation templates.', 'TP', '#f0fdf4', 70, '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z');

INSERT OR IGNORE INTO tags (id, name, slug, status, notes, created_at, updated_at) VALUES
  ('tag-ticketing', 'ticketing', 'ticketing', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-support', 'support', 'support', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-ivanti', 'ivanti', 'ivanti', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-request', 'request', 'request', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-d2l', 'd2l', 'd2l', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-course-copy', 'course copy', 'course-copy', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-shell-setup', 'shell setup', 'shell-setup', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-course-build', 'course build', 'course-build', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-intake', 'intake', 'intake', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-qa', 'qa', 'qa', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-launch', 'launch', 'launch', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-review', 'review', 'review', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-accessibility', 'accessibility', 'accessibility', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-ai', 'ai', 'ai', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-drafting', 'drafting', 'drafting', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-responsible-use', 'responsible use', 'responsible-use', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-missing-content', 'missing content', 'missing-content', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-troubleshooting', 'troubleshooting', 'troubleshooting', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('tag-template', 'template', 'template', 'Active', '', '2026-06-01T09:00:00Z', '2026-06-18T15:30:00Z');

INSERT OR IGNORE INTO sops (
  id, title, slug, purpose, category_id, owner_user_id, owner_team_id, status, type,
  current_version_id, estimated_completion_time, review_date, created_by_user_id,
  approved_by_user_id, published_at, visibility, source_type, created_at, updated_at
) VALUES
  ('sop-ivanti-submit-ticket', 'Submit a New Ivanti Ticket', 'submit-a-new-ivanti-ticket', 'Explains how to submit a new Ivanti ticket with the required details for faster routing and resolution.', 'category-ivanti-ticketing-system', 'tarek-jacobs', 'team-instructional-technology', 'Published', 'Process', 'version-sop-ivanti-submit-ticket-1-0', '5 minutes', '2026-12-18', 'tarek-jacobs', 'tarek-jacobs', '2026-06-18T15:30:00Z', 'Internal', 'Markdown', '2026-06-18T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('sop-copy-d2l-course-shell', 'Copy a Brightspace D2L Course Shell', 'copy-a-brightspace-d2l-course-shell', 'Explains how to copy course content from one Brightspace D2L shell into another.', 'category-brightspace-d2l', 'maya-patel', 'team-instructional-technology', 'Published', 'Process', 'version-sop-copy-d2l-course-shell-1-0', '12 minutes', '2026-12-18', 'maya-patel', 'maya-patel', '2026-06-18T15:30:00Z', 'Internal', 'Markdown', '2026-06-18T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('sop-course-build-request', 'Prepare a Course Build Request', 'prepare-a-course-build-request', 'Explains how to gather and submit the information needed before beginning a course build.', 'category-course-builds', 'maya-patel', 'team-curriculum-design', 'Published', 'Checklist', 'version-sop-course-build-request-1-0', '10 minutes', '2026-12-18', 'maya-patel', 'maya-patel', '2026-06-18T15:30:00Z', 'Internal', 'Markdown', '2026-06-18T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('sop-final-course-qa', 'Complete Final Course QA', 'complete-final-course-qa', 'Explains how to complete a final quality assurance review before a course is approved for launch.', 'category-qa-processes', 'course-qa-team', 'team-quality-assurance', 'Published', 'Checklist', 'version-sop-final-course-qa-1-0', '30 minutes', '2026-12-18', 'course-qa-team', 'course-qa-team', '2026-06-18T15:30:00Z', 'Internal', 'Markdown', '2026-06-18T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('sop-use-ai-to-draft-course-content', 'Use AI to Draft Course Content', 'use-ai-to-draft-course-content', 'Explains how to responsibly use approved AI tools to draft instructional content for review.', 'category-ai-tools', 'maya-patel', 'team-curriculum-design', 'Published', 'Job Aid', 'version-sop-use-ai-to-draft-course-content-1-0', '15 minutes', '2026-12-18', 'maya-patel', 'maya-patel', '2026-06-18T15:30:00Z', 'Internal', 'Markdown', '2026-06-18T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('sop-troubleshoot-missing-d2l-content', 'Troubleshoot Missing D2L Content', 'troubleshoot-missing-d2l-content', 'Explains how to investigate and resolve missing content in a Brightspace D2L course shell.', 'category-troubleshooting', 'tarek-jacobs', 'team-instructional-technology', 'Published', 'Troubleshooting Guide', 'version-sop-troubleshoot-missing-d2l-content-1-0', '10 minutes', '2026-12-18', 'tarek-jacobs', 'tarek-jacobs', '2026-06-18T15:30:00Z', 'Internal', 'Markdown', '2026-06-18T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('sop-course-build-request-template', 'Course Build Request Template', 'course-build-request-template', 'Provides a reusable template for submitting a complete course build request.', 'category-templates', 'maya-patel', 'team-curriculum-design', 'Published', 'Template', 'version-sop-course-build-request-template-1-0', '8 minutes', '2026-12-18', 'maya-patel', 'maya-patel', '2026-06-18T15:30:00Z', 'Internal', 'Markdown', '2026-06-18T09:00:00Z', '2026-06-18T15:30:00Z');

INSERT OR IGNORE INTO sop_versions (
  id, sop_id, version_label, title, purpose, body_markdown, metadata_json, change_summary,
  status, created_by_user_id, reviewed_by_user_id, approved_by_user_id, created_at, reviewed_at, approved_at
) VALUES
  ('version-sop-ivanti-submit-ticket-1-0', 'sop-ivanti-submit-ticket', '1.0', 'Submit a New Ivanti Ticket', 'Explains how to submit a new Ivanti ticket with the required details for faster routing and resolution.', '## Before You Begin\nGather the affected user name, email address, course or section code, relevant dates, and screenshots.\n\n## Procedure\n1. Open Ivanti and start a new ticket.\n2. Enter requester and affected course details.\n3. Submit the ticket and save the confirmation.\n\n## Troubleshooting / Notes\n- Include student name and student ID when relevant.\n- Mark launch blockers as high priority.', '{"tools":["Ivanti"],"audience":["Faculty Support","Instructional Technology"]}', 'Initial SOP created.', 'Published', 'tarek-jacobs', 'tarek-jacobs', 'tarek-jacobs', '2026-06-18T09:00:00Z', '2026-06-18T14:00:00Z', '2026-06-18T15:30:00Z'),
  ('version-sop-copy-d2l-course-shell-1-0', 'sop-copy-d2l-course-shell', '1.0', 'Copy a Brightspace D2L Course Shell', 'Explains how to copy course content from one Brightspace D2L shell into another.', '## Before You Begin\nConfirm source and destination course shells.\n\n## Procedure\n1. Open Import/Export/Copy Components.\n2. Select source course components.\n3. Review copy results.\n\n## Troubleshooting / Notes\n- Verify hidden modules after copy.', '{"tools":["Brightspace D2L"],"audience":["Instructional Designers","Learning Systems"]}', 'Initial D2L course copy procedure added.', 'Published', 'maya-patel', 'maya-patel', 'maya-patel', '2026-06-18T09:00:00Z', '2026-06-18T14:00:00Z', '2026-06-18T15:30:00Z'),
  ('version-sop-course-build-request-1-0', 'sop-course-build-request', '1.0', 'Prepare a Course Build Request', 'Explains how to gather and submit the information needed before beginning a course build.', '## Before You Begin\nIdentify the target course, launch term, program owner, source materials, and constraints.\n\n## Procedure\n1. Gather course details.\n2. Confirm source materials.\n3. Submit the build request.\n\n## Troubleshooting / Notes\n- Missing source material delays intake.', '{"tools":["Brightspace D2L","Ivanti"],"audience":["Program Teams","Instructional Designers"]}', 'Initial course build intake checklist added.', 'Published', 'maya-patel', 'maya-patel', 'maya-patel', '2026-06-18T09:00:00Z', '2026-06-18T14:00:00Z', '2026-06-18T15:30:00Z'),
  ('version-sop-final-course-qa-1-0', 'sop-final-course-qa', '1.0', 'Complete Final Course QA', 'Explains how to complete a final quality assurance review before a course is approved for launch.', '## Before You Begin\nConfirm the course build is ready for final review and the QA checklist is available.\n\n## Procedure\n1. Review course entry points.\n2. Validate assessments and gradebook.\n3. Document launch blockers.\n\n## Troubleshooting / Notes\n- Escalate accessibility or launch blockers.', '{"tools":["Brightspace D2L","QA Checklist"],"audience":["QA Reviewers","Instructional Designers"]}', 'Initial final QA checklist created.', 'Published', 'course-qa-team', 'course-qa-team', 'course-qa-team', '2026-06-18T09:00:00Z', '2026-06-18T14:00:00Z', '2026-06-18T15:30:00Z'),
  ('version-sop-use-ai-to-draft-course-content-1-0', 'sop-use-ai-to-draft-course-content', '1.0', 'Use AI to Draft Course Content', 'Explains how to responsibly use approved AI tools to draft instructional content for review.', '## Before You Begin\nUse only organization-approved AI tools and source material.\n\n## Procedure\n1. Attach approved source material.\n2. Draft content with source-grounded prompts.\n3. Complete human review.\n\n## Troubleshooting / Notes\n- Do not enter sensitive data without approval.', '{"tools":["Approved AI Tools","Source Documents"],"audience":["Instructional Designers","Curriculum Teams"]}', 'Initial approved AI drafting workflow added.', 'Published', 'maya-patel', 'maya-patel', 'maya-patel', '2026-06-18T09:00:00Z', '2026-06-18T14:00:00Z', '2026-06-18T15:30:00Z'),
  ('version-sop-troubleshoot-missing-d2l-content-1-0', 'sop-troubleshoot-missing-d2l-content', '1.0', 'Troubleshoot Missing D2L Content', 'Explains how to investigate and resolve missing content in a Brightspace D2L course shell.', '## Before You Begin\nCollect course code, content title, user role, screenshot, and expected availability date.\n\n## Procedure\n1. Confirm enrollment and role.\n2. Check content visibility.\n3. Escalate if shell settings are correct.\n\n## Troubleshooting / Notes\n- Enrollment timing can create delays.', '{"tools":["Brightspace D2L","Ivanti"],"audience":["Faculty Support","Learning Systems"]}', 'Initial missing content troubleshooting guide added.', 'Published', 'tarek-jacobs', 'tarek-jacobs', 'tarek-jacobs', '2026-06-18T09:00:00Z', '2026-06-18T14:00:00Z', '2026-06-18T15:30:00Z'),
  ('version-sop-course-build-request-template-1-0', 'sop-course-build-request-template', '1.0', 'Course Build Request Template', 'Provides a reusable template for submitting a complete course build request.', '## Before You Begin\nUse this template before opening a course build request.\n\n## Procedure\n1. Complete course overview.\n2. Add launch timeline and source links.\n3. Submit for intake review.\n\n## Troubleshooting / Notes\n- Incomplete templates should be returned for revision.', '{"tools":["Course Build Intake Form","Brightspace D2L"],"audience":["Program Teams","Course Operations"]}', 'Initial course build request template added.', 'Published', 'maya-patel', 'maya-patel', 'maya-patel', '2026-06-18T09:00:00Z', '2026-06-18T14:00:00Z', '2026-06-18T15:30:00Z');

INSERT OR IGNORE INTO media_assets (
  id, asset_type, purpose, original_file_name, display_name, mime_type, size_bytes,
  storage_provider, object_key, public_url, alt_text, caption, uploaded_by_user_id, status, created_at, updated_at
) VALUES
  ('media-ivanti-submit-ticket-placeholder', 'Image', 'SOP Reference', 'ivanti-submit-ticket-placeholder.svg', 'Ivanti ticket submission placeholder', 'image/svg+xml', 0, 'legacy_public', '/images/screenshots/ivanti-submit-ticket-placeholder.svg', '/images/screenshots/ivanti-submit-ticket-placeholder.svg', 'Placeholder screenshot showing the Ivanti ticket submission screen.', 'Use the New Ticket button to begin the request.', 'tarek-jacobs', 'Active', '2026-06-18T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('media-d2l-course-copy-placeholder', 'Image', 'SOP Reference', 'd2l-course-copy-placeholder.svg', 'D2L course copy placeholder', 'image/svg+xml', 0, 'legacy_public', '/images/screenshots/d2l-course-copy-placeholder.svg', '/images/screenshots/d2l-course-copy-placeholder.svg', 'Placeholder screenshot showing the Brightspace copy components screen.', 'Use Import/Export/Copy Components to start the course copy.', 'maya-patel', 'Active', '2026-06-18T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('media-course-build-request-placeholder', 'Image', 'SOP Reference', 'course-build-request-placeholder.svg', 'Course build request placeholder', 'image/svg+xml', 0, 'legacy_public', '/images/screenshots/course-build-request-placeholder.svg', '/images/screenshots/course-build-request-placeholder.svg', 'Placeholder screenshot showing a course build request intake form.', 'Complete every required field before submitting a course build request.', 'maya-patel', 'Active', '2026-06-18T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('media-qa-checklist-placeholder', 'Image', 'SOP Reference', 'qa-checklist-placeholder.svg', 'QA checklist placeholder', 'image/svg+xml', 0, 'legacy_public', '/images/screenshots/qa-checklist-placeholder.svg', '/images/screenshots/qa-checklist-placeholder.svg', 'Placeholder screenshot showing a final course QA checklist.', 'Record each finding in the QA checklist before approval.', 'course-qa-team', 'Active', '2026-06-18T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('media-ai-draft-placeholder', 'Image', 'SOP Reference', 'ai-draft-placeholder.svg', 'AI draft placeholder', 'image/svg+xml', 0, 'legacy_public', '/images/screenshots/ai-draft-placeholder.svg', '/images/screenshots/ai-draft-placeholder.svg', 'Placeholder screenshot showing an AI drafting prompt with source material attached.', 'Use source-grounded prompts and keep human review in the workflow.', 'maya-patel', 'Active', '2026-06-18T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('media-troubleshoot-d2l-placeholder', 'Image', 'SOP Reference', 'troubleshoot-d2l-placeholder.svg', 'D2L troubleshooting placeholder', 'image/svg+xml', 0, 'legacy_public', '/images/screenshots/troubleshoot-d2l-placeholder.svg', '/images/screenshots/troubleshoot-d2l-placeholder.svg', 'Placeholder screenshot showing hidden content settings in Brightspace D2L.', 'Check visibility settings before escalating missing content.', 'tarek-jacobs', 'Active', '2026-06-18T09:00:00Z', '2026-06-18T15:30:00Z'),
  ('media-template-placeholder', 'Image', 'SOP Reference', 'template-placeholder.svg', 'Course build template placeholder', 'image/svg+xml', 0, 'legacy_public', '/images/screenshots/template-placeholder.svg', '/images/screenshots/template-placeholder.svg', 'Placeholder screenshot showing a course build request template.', 'Use the template to collect complete build details before intake.', 'maya-patel', 'Active', '2026-06-18T09:00:00Z', '2026-06-18T15:30:00Z');

INSERT OR IGNORE INTO sop_media (sop_id, media_asset_id, relationship, sort_order) VALUES
  ('sop-ivanti-submit-ticket', 'media-ivanti-submit-ticket-placeholder', 'Screenshot', 10),
  ('sop-copy-d2l-course-shell', 'media-d2l-course-copy-placeholder', 'Screenshot', 10),
  ('sop-course-build-request', 'media-course-build-request-placeholder', 'Screenshot', 10),
  ('sop-final-course-qa', 'media-qa-checklist-placeholder', 'Screenshot', 10),
  ('sop-use-ai-to-draft-course-content', 'media-ai-draft-placeholder', 'Screenshot', 10),
  ('sop-troubleshoot-missing-d2l-content', 'media-troubleshoot-d2l-placeholder', 'Screenshot', 10),
  ('sop-course-build-request-template', 'media-template-placeholder', 'Screenshot', 10);

INSERT OR IGNORE INTO sop_version_media (sop_version_id, media_asset_id, relationship, sort_order) VALUES
  ('version-sop-ivanti-submit-ticket-1-0', 'media-ivanti-submit-ticket-placeholder', 'Screenshot', 10),
  ('version-sop-copy-d2l-course-shell-1-0', 'media-d2l-course-copy-placeholder', 'Screenshot', 10),
  ('version-sop-course-build-request-1-0', 'media-course-build-request-placeholder', 'Screenshot', 10),
  ('version-sop-final-course-qa-1-0', 'media-qa-checklist-placeholder', 'Screenshot', 10),
  ('version-sop-use-ai-to-draft-course-content-1-0', 'media-ai-draft-placeholder', 'Screenshot', 10),
  ('version-sop-troubleshoot-missing-d2l-content-1-0', 'media-troubleshoot-d2l-placeholder', 'Screenshot', 10),
  ('version-sop-course-build-request-template-1-0', 'media-template-placeholder', 'Screenshot', 10);

INSERT OR IGNORE INTO sop_tags (sop_id, tag_id) VALUES
  ('sop-ivanti-submit-ticket', 'tag-ticketing'),
  ('sop-ivanti-submit-ticket', 'tag-support'),
  ('sop-ivanti-submit-ticket', 'tag-ivanti'),
  ('sop-ivanti-submit-ticket', 'tag-request'),
  ('sop-copy-d2l-course-shell', 'tag-d2l'),
  ('sop-copy-d2l-course-shell', 'tag-course-copy'),
  ('sop-copy-d2l-course-shell', 'tag-shell-setup'),
  ('sop-course-build-request', 'tag-course-build'),
  ('sop-course-build-request', 'tag-intake'),
  ('sop-course-build-request', 'tag-request'),
  ('sop-final-course-qa', 'tag-qa'),
  ('sop-final-course-qa', 'tag-launch'),
  ('sop-final-course-qa', 'tag-review'),
  ('sop-final-course-qa', 'tag-accessibility'),
  ('sop-use-ai-to-draft-course-content', 'tag-ai'),
  ('sop-use-ai-to-draft-course-content', 'tag-drafting'),
  ('sop-use-ai-to-draft-course-content', 'tag-review'),
  ('sop-use-ai-to-draft-course-content', 'tag-responsible-use'),
  ('sop-troubleshoot-missing-d2l-content', 'tag-d2l'),
  ('sop-troubleshoot-missing-d2l-content', 'tag-missing-content'),
  ('sop-troubleshoot-missing-d2l-content', 'tag-troubleshooting'),
  ('sop-course-build-request-template', 'tag-template'),
  ('sop-course-build-request-template', 'tag-course-build'),
  ('sop-course-build-request-template', 'tag-intake');

INSERT OR IGNORE INTO procedure_steps (id, sop_version_id, step_number, title, instructions, note) VALUES
  ('step-ivanti-submit-1', 'version-sop-ivanti-submit-ticket-1-0', 1, 'Open Ivanti', 'Open Ivanti and choose the New Ticket action.', ''),
  ('step-ivanti-submit-2', 'version-sop-ivanti-submit-ticket-1-0', 2, 'Enter ticket details', 'Enter requester, affected course, priority, and supporting details.', 'Include screenshots or exact error text when available.'),
  ('step-ivanti-submit-3', 'version-sop-ivanti-submit-ticket-1-0', 3, 'Submit and save confirmation', 'Submit the ticket and save the ticket number for follow-up.', ''),
  ('step-final-qa-1', 'version-sop-final-course-qa-1-0', 1, 'Review course entry points', 'Open the course homepage, modules, assessments, and gradebook.', ''),
  ('step-ai-draft-1', 'version-sop-use-ai-to-draft-course-content-1-0', 1, 'Attach source material', 'Attach or reference approved source material before drafting.', 'Never include sensitive data without approval.'),
  ('step-course-build-template-1', 'version-sop-course-build-request-template-1-0', 1, 'Complete required fields', 'Fill in course, launch, owner, and source material fields before intake.', '');

INSERT OR IGNORE INTO procedure_step_media (procedure_step_id, media_asset_id, relationship, sort_order) VALUES
  ('step-ivanti-submit-1', 'media-ivanti-submit-ticket-placeholder', 'Example', 10),
  ('step-final-qa-1', 'media-qa-checklist-placeholder', 'Example', 10),
  ('step-ai-draft-1', 'media-ai-draft-placeholder', 'Example', 10),
  ('step-course-build-template-1', 'media-template-placeholder', 'Example', 10);

INSERT OR IGNORE INTO requests (
  id, request_type, title, description, business_need, department, category_id, requested_sop_id,
  submitted_by_user_id, submitter_name, submitter_email, assigned_to_user_id, priority, status,
  desired_completion_date, review_date, created_at, updated_at
) VALUES
  ('sub-course-access-issue', 'Report an issue with an SOP', 'Clarify D2L access troubleshooting steps', 'This should connect to the existing D2L troubleshooting SOP.', 'Support staff need consistent steps before escalating missing course access tickets.', 'Student Services', 'category-troubleshooting', 'sop-troubleshoot-missing-d2l-content', 'jordan-lee', 'Jordan Lee', 'jordan.lee@example.edu', 'tarek-jacobs', 'High', 'Triage', '2026-07-01', '2026-06-25', '2026-06-15T13:10:00Z', '2026-06-16T16:45:00Z'),
  ('sub-ai-review-checklist', 'Request a template', 'AI content review checklist', 'Could become a template and a checklist SOP.', 'Designers need a repeatable checklist for reviewing AI-assisted course content.', 'Curriculum Design', 'category-ai-tools', NULL, 'maya-patel', 'Maya Patel', 'maya.patel@example.edu', 'maya-patel', 'Medium', 'Assigned', '2026-07-10', '2026-06-30', '2026-06-12T18:20:00Z', '2026-06-14T12:00:00Z');

INSERT OR IGNORE INTO reviews (
  id, sop_id, sop_version_id, request_id, reviewer_user_id, assigned_by_user_id, status,
  priority, due_date, decision_notes, created_at, updated_at
) VALUES
  ('review-draft-ticket-resolution-notes', NULL, NULL, NULL, 'tarek-jacobs', 'tarek-jacobs', 'In Review', 'Medium', '2026-07-15', 'Expanded the resolution note requirements.', '2026-06-11T09:00:00Z', '2026-06-17T12:00:00Z'),
  ('review-sub-course-access-issue', NULL, NULL, 'sub-course-access-issue', 'tarek-jacobs', 'tarek-jacobs', 'Assigned', 'High', '2026-06-25', 'Needs routing decision before drafting.', '2026-06-15T13:10:00Z', '2026-06-16T16:45:00Z'),
  ('review-sub-ai-review-checklist', NULL, NULL, 'sub-ai-review-checklist', 'maya-patel', 'tarek-jacobs', 'Assigned', 'Medium', '2026-06-30', 'Convert into a template draft.', '2026-06-12T18:20:00Z', '2026-06-14T12:00:00Z');

INSERT OR IGNORE INTO sop_publication_events (
  id, sop_id, sop_version_id, actor_user_id, event_type, from_status, to_status, notes, created_at
) VALUES
  ('publish-event-ivanti-1-0', 'sop-ivanti-submit-ticket', 'version-sop-ivanti-submit-ticket-1-0', 'tarek-jacobs', 'Published', 'Approved', 'Published', 'Initial SOP published.', '2026-06-18T15:30:00Z'),
  ('publish-event-final-qa-1-0', 'sop-final-course-qa', 'version-sop-final-course-qa-1-0', 'course-qa-team', 'Published', 'Approved', 'Published', 'Initial QA SOP published.', '2026-06-18T15:30:00Z');

INSERT OR IGNORE INTO sop_search_documents (
  sop_id, title, category, owner, status, tags_text, tools_text, audience_text, body_text, search_text, last_indexed_at
) VALUES
  ('sop-ivanti-submit-ticket', 'Submit a New Ivanti Ticket', 'Ivanti / Ticketing System', 'Instructional Technology', 'Published', 'ticketing support ivanti request', 'Ivanti', 'Faculty Support Instructional Technology', 'Submit a new Ivanti ticket with requester course priority and screenshots.', 'submit a new ivanti ticket ticketing support ivanti request requester course priority screenshots', '2026-06-18T15:30:00Z'),
  ('sop-final-course-qa', 'Complete Final Course QA', 'QA Processes', 'Quality Assurance', 'Published', 'qa launch review accessibility', 'Brightspace D2L QA Checklist', 'QA Reviewers Instructional Designers', 'Complete final course QA before launch.', 'complete final course qa launch review accessibility brightspace d2l checklist', '2026-06-18T15:30:00Z'),
  ('sop-use-ai-to-draft-course-content', 'Use AI to Draft Course Content', 'AI Tools', 'Learning Innovation', 'Published', 'ai drafting review responsible use', 'Approved AI Tools Source Documents', 'Instructional Designers Curriculum Teams', 'Use approved AI tools to draft course content with human review.', 'use ai draft course content approved ai source documents human review', '2026-06-18T15:30:00Z');

INSERT OR IGNORE INTO search_logs (
  id, user_id, query, filters_json, results_count, clicked_sop_id, no_results, created_at
) VALUES
  ('search-log-001', 'staff-user', 'ivanti ticket', '{"category":"Ivanti / Ticketing System"}', 1, 'sop-ivanti-submit-ticket', 0, '2026-06-20T13:00:00Z'),
  ('search-log-002', 'jordan-lee', 'missing course content', '{"category":"Troubleshooting"}', 1, 'sop-troubleshoot-missing-d2l-content', 0, '2026-06-20T15:00:00Z'),
  ('search-log-003', 'maya-patel', 'gradebook export', '{}', 0, NULL, 1, '2026-06-21T11:20:00Z');

INSERT OR IGNORE INTO page_view_events (id, user_id, path, referrer, session_id, created_at) VALUES
  ('page-view-001', 'staff-user', '/search/', '/', 'session-seed-001', '2026-06-20T12:58:00Z'),
  ('page-view-002', 'staff-user', '/sops/ivanti-ticketing-system/submit-a-new-ivanti-ticket/', '/search/', 'session-seed-001', '2026-06-20T13:01:00Z'),
  ('page-view-003', 'tarek-jacobs', '/admin/review/', '/admin/', 'session-seed-002', '2026-06-20T14:00:00Z');

INSERT OR IGNORE INTO sop_view_events (id, sop_id, user_id, session_id, source, created_at) VALUES
  ('sop-view-001', 'sop-ivanti-submit-ticket', 'staff-user', 'session-seed-001', 'Search', '2026-06-20T13:01:00Z'),
  ('sop-view-002', 'sop-troubleshoot-missing-d2l-content', 'jordan-lee', 'session-seed-003', 'Guided Finder', '2026-06-20T15:02:00Z'),
  ('sop-view-003', 'sop-final-course-qa', 'course-qa-team', 'session-seed-004', 'Direct', '2026-06-21T09:30:00Z');

INSERT OR IGNORE INTO sop_export_events (id, sop_id, user_id, export_type, created_at) VALUES
  ('sop-export-001', 'sop-ivanti-submit-ticket', 'staff-user', 'PDF', '2026-06-20T13:05:00Z'),
  ('sop-export-002', 'sop-final-course-qa', 'course-qa-team', 'Print', '2026-06-21T09:35:00Z');

INSERT OR IGNORE INTO feedback (id, sop_id, user_id, rating, comment, created_at) VALUES
  ('feedback-001', 'sop-ivanti-submit-ticket', 'staff-user', 'Helpful', 'Clear and easy to follow.', '2026-06-20T13:07:00Z'),
  ('feedback-002', 'sop-troubleshoot-missing-d2l-content', 'jordan-lee', 'Helpful', 'Useful before escalation.', '2026-06-20T15:05:00Z');

INSERT OR IGNORE INTO admin_analytics_daily (
  metric_date, metric_name, dimension_key, dimension_value, metric_value, calculated_at
) VALUES
  ('2026-06-20', 'sop_views', 'all', 'all', 2, '2026-06-21T00:05:00Z'),
  ('2026-06-20', 'searches', 'all', 'all', 3, '2026-06-21T00:05:00Z'),
  ('2026-06-20', 'no_result_searches', 'all', 'all', 1, '2026-06-21T00:05:00Z'),
  ('2026-06-20', 'review_queue_open', 'status', 'Triage', 1, '2026-06-21T00:05:00Z'),
  ('2026-06-20', 'review_queue_open', 'status', 'Assigned', 1, '2026-06-21T00:05:00Z'),
  ('2026-06-21', 'sop_exports', 'all', 'all', 1, '2026-06-22T00:05:00Z');

INSERT OR IGNORE INTO notifications (
  id, user_id, type, title, body, entity_type, entity_id, channel, status, scheduled_for, created_at
) VALUES
  ('notification-review-course-access', 'tarek-jacobs', 'Review Due', 'Review D2L access troubleshooting request', 'A high-priority request needs routing before drafting.', 'request', 'sub-course-access-issue', 'In App', 'Unread', '2026-06-25T09:00:00Z', '2026-06-16T16:45:00Z'),
  ('notification-ai-template-review', 'maya-patel', 'Review Due', 'AI review checklist assigned', 'Convert the AI checklist request into a draft template.', 'request', 'sub-ai-review-checklist', 'In App', 'Unread', '2026-06-30T09:00:00Z', '2026-06-14T12:00:00Z');

INSERT OR IGNORE INTO system_settings (key, value_json, description, updated_by_user_id, updated_at) VALUES
  ('workflow.policy', '{"primaryPolicy":"Submitted -> Triage -> Drafting -> In Review -> Approved -> Published","requiresCreatorReviewerToPublish":true}', 'Review and publish workflow policy.', 'tarek-jacobs', '2026-06-18T15:30:00Z'),
  ('media.storage', '{"provider":"r2","bucket":"sop-knowledge-hub-media","allowedMimeTypes":["image/png","image/jpeg","image/webp","image/svg+xml","video/mp4","application/pdf"],"maxUploadBytes":26214400}', 'Media upload and storage settings.', 'tarek-jacobs', '2026-06-18T15:30:00Z'),
  ('analytics.retention', '{"rawEventDays":365,"dailyRollupDays":2555}', 'Analytics event retention settings.', 'tarek-jacobs', '2026-06-18T15:30:00Z');
