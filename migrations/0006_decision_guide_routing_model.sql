-- Structured decision guides and routing rules.
-- This models tools like the ITS Ticket Guide as queryable backend data rather than static page logic.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS decision_guides (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_url TEXT,
  category_id TEXT,
  owner_team_id TEXT,
  default_sop_id TEXT,
  status TEXT NOT NULL DEFAULT 'Published'
    CHECK (status IN ('Draft', 'Published', 'Archived')),
  visibility TEXT NOT NULL DEFAULT 'Internal'
    CHECK (visibility IN ('Internal', 'Restricted', 'Public')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (owner_team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY (default_sop_id) REFERENCES sops(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS decision_guide_roles (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  label TEXT NOT NULL,
  icon TEXT,
  hint TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (guide_id) REFERENCES decision_guides(id) ON DELETE CASCADE,
  UNIQUE (guide_id, role_key)
);

CREATE TABLE IF NOT EXISTS decision_request_types (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL,
  request_key TEXT NOT NULL,
  label TEXT NOT NULL,
  icon TEXT,
  hint TEXT,
  default_badge TEXT,
  default_title TEXT,
  default_summary TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active', 'Inactive', 'Archived')),
  FOREIGN KEY (guide_id) REFERENCES decision_guides(id) ON DELETE CASCADE,
  UNIQUE (guide_id, request_key)
);

CREATE TABLE IF NOT EXISTS decision_role_adjustments (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  note TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (guide_id) REFERENCES decision_guides(id) ON DELETE CASCADE,
  FOREIGN KEY (guide_id, role_key) REFERENCES decision_guide_roles(guide_id, role_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS decision_routing_rules (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL,
  request_type_id TEXT NOT NULL,
  role_key TEXT,
  route_label TEXT NOT NULL,
  route_class TEXT NOT NULL,
  destination_label TEXT NOT NULL,
  destination_team_id TEXT,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('submit_ticket', 'service_now', 'reroute', 'project_path', 'vendor_support', 'clarify')),
  requires_ticket INTEGER NOT NULL DEFAULT 1 CHECK (requires_ticket IN (0, 1)),
  requires_project_path INTEGER NOT NULL DEFAULT 0 CHECK (requires_project_path IN (0, 1)),
  priority_score INTEGER NOT NULL DEFAULT 0,
  urgency_score INTEGER NOT NULL DEFAULT 0,
  ownership_score INTEGER NOT NULL DEFAULT 0,
  confidence_base INTEGER NOT NULL DEFAULT 50,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  next_steps_json TEXT NOT NULL DEFAULT '[]',
  external_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (guide_id) REFERENCES decision_guides(id) ON DELETE CASCADE,
  FOREIGN KEY (request_type_id) REFERENCES decision_request_types(id) ON DELETE CASCADE,
  FOREIGN KEY (destination_team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY (guide_id, role_key) REFERENCES decision_guide_roles(guide_id, role_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS decision_rule_signals (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  signal_key TEXT NOT NULL,
  signal_value TEXT NOT NULL DEFAULT 'true',
  weight INTEGER NOT NULL DEFAULT 1,
  polarity INTEGER NOT NULL DEFAULT 1 CHECK (polarity IN (-1, 1)),
  FOREIGN KEY (rule_id) REFERENCES decision_routing_rules(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS decision_scenarios (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL,
  request_type_id TEXT NOT NULL,
  title TEXT NOT NULL,
  route_label TEXT NOT NULL,
  route_class TEXT NOT NULL,
  destination_label TEXT NOT NULL,
  why TEXT NOT NULL,
  next_step TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (guide_id) REFERENCES decision_guides(id) ON DELETE CASCADE,
  FOREIGN KEY (request_type_id) REFERENCES decision_request_types(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS decision_journey_steps (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  FOREIGN KEY (guide_id) REFERENCES decision_guides(id) ON DELETE CASCADE,
  UNIQUE (guide_id, step_number)
);

CREATE TABLE IF NOT EXISTS decision_faqs (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (guide_id) REFERENCES decision_guides(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS decision_routing_events (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL,
  selected_role_key TEXT,
  selected_request_key TEXT,
  matched_rule_id TEXT,
  input_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  confidence_score INTEGER NOT NULL DEFAULT 0,
  session_id TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (guide_id) REFERENCES decision_guides(id) ON DELETE CASCADE,
  FOREIGN KEY (matched_rule_id) REFERENCES decision_routing_rules(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_decision_guides_slug ON decision_guides(slug);
CREATE INDEX IF NOT EXISTS idx_decision_roles_guide ON decision_guide_roles(guide_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_decision_request_types_guide ON decision_request_types(guide_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_decision_rules_match ON decision_routing_rules(guide_id, request_type_id, role_key, sort_order);
CREATE INDEX IF NOT EXISTS idx_decision_rule_signals_rule ON decision_rule_signals(rule_id, signal_key);
CREATE INDEX IF NOT EXISTS idx_decision_scenarios_guide ON decision_scenarios(guide_id, request_type_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_decision_events_guide_created ON decision_routing_events(guide_id, created_at);

INSERT OR IGNORE INTO categories (id, name, slug, description, icon, color, sort_order, created_at, updated_at) VALUES
  ('category-its-ticket-routing', 'ITS Ticket Routing', 'its-ticket-routing', 'Decision support for routing course support requests to the right owner.', 'Route', '#dbeafe', 15, '2026-07-08T18:00:00Z', '2026-07-08T18:00:00Z');

INSERT OR IGNORE INTO tags (id, name, slug, status, notes, created_at, updated_at) VALUES
  ('tag-routing', 'routing', 'routing', 'Active', '', '2026-07-08T18:00:00Z', '2026-07-08T18:00:00Z'),
  ('tag-service-now', 'ServiceNow', 'servicenow', 'Active', '', '2026-07-08T18:00:00Z', '2026-07-08T18:00:00Z'),
  ('tag-cengage', 'Cengage', 'cengage', 'Active', '', '2026-07-08T18:00:00Z', '2026-07-08T18:00:00Z'),
  ('tag-media', 'media', 'media', 'Active', '', '2026-07-08T18:00:00Z', '2026-07-08T18:00:00Z'),
  ('tag-project-path', 'project path', 'project-path', 'Active', '', '2026-07-08T18:00:00Z', '2026-07-08T18:00:00Z');

INSERT OR IGNORE INTO teams (id, name, description, created_at, updated_at) VALUES
  ('team-lms-it', 'LMS IT Team', 'Owns LMS enrollment, access, and platform-level support paths.', '2026-07-08T18:00:00Z', '2026-07-08T18:00:00Z'),
  ('team-multimedia', 'Multimedia', 'Owns Kaltura, Captivate, H5P, and media asset support.', '2026-07-08T18:00:00Z', '2026-07-08T18:00:00Z'),
  ('team-academic-leadership', 'Academic Leadership', 'Owns academic approval and project-path decisions.', '2026-07-08T18:00:00Z', '2026-07-08T18:00:00Z'),
  ('team-learner-services', 'Learner Services', 'Owns learner-facing troubleshooting and service handoffs.', '2026-07-08T18:00:00Z', '2026-07-08T18:00:00Z');

INSERT OR IGNORE INTO sops (
  id, title, slug, summary, purpose, category_id, owner_user_id, owner_team_id, status, type,
  current_version_id, estimated_completion_time, estimated_minutes, review_date, created_by_user_id,
  approved_by_user_id, published_at, visibility, source_type, is_active, created_at, updated_at
) VALUES (
  'sop-its-ticket-routing-guide',
  'ITS Ticket Routing Guide',
  'its-ticket-routing-guide',
  'Decision guide for routing course support requests, bounded tickets, enrollment/access issues, media issues, Cengage, and project-path work.',
  'Help users determine whether a course support request should be submitted as a ticket, routed to another owner, escalated to ServiceNow, or treated as a project.',
  'category-its-ticket-routing',
  'tarek-jacobs',
  'team-instructional-technology',
  'Published',
  'Decision Tree',
  'version-sop-its-ticket-routing-guide-1-0',
  '5 minutes',
  5,
  '2027-01-08',
  'tarek-jacobs',
  'tarek-jacobs',
  '2026-07-08T18:00:00Z',
  'Internal',
  'Database',
  1,
  '2026-07-08T18:00:00Z',
  '2026-07-08T18:00:00Z'
);

INSERT OR IGNORE INTO sop_versions (
  id, sop_id, version_label, version_number, title, summary, purpose, body_markdown,
  content, before_you_begin, checklist, troubleshooting, metadata_json, change_summary,
  status, created_by_user_id, reviewed_by_user_id, approved_by_user_id, created_at, reviewed_at, approved_at, updated_at, published_at
) VALUES (
  'version-sop-its-ticket-routing-guide-1-0',
  'sop-its-ticket-routing-guide',
  '1.0',
  '1.0',
  'ITS Ticket Routing Guide',
  'Decision guide for routing course support requests.',
  'Help users choose the correct support path before work starts.',
  '## Purpose\nUse this decision guide to decide whether a request is a ticket, ServiceNow/LMS IT request, multimedia handoff, Cengage support issue, or project-path item.\n\n## Core Rules\n1. Work starts with a ticket when ITS needs to act or route.\n2. Enrollment and access requests go to ServiceNow / LMS IT Team.\n3. Media asset and platform issues route to Multimedia when the cause is media-owned.\n4. Broad course changes are projects, not tickets.\n5. Student impact and grade impact increase urgency.\n\n## Source\nOriginal guide: https://its-ticket-guide.gduarte-28e.workers.dev/',
  '## Purpose\nUse this decision guide to decide whether a request is a ticket, ServiceNow/LMS IT request, multimedia handoff, Cengage support issue, or project-path item.\n\n## Core Rules\n1. Work starts with a ticket when ITS needs to act or route.\n2. Enrollment and access requests go to ServiceNow / LMS IT Team.\n3. Media asset and platform issues route to Multimedia when the cause is media-owned.\n4. Broad course changes are projects, not tickets.\n5. Student impact and grade impact increase urgency.\n\n## Source\nOriginal guide: https://its-ticket-guide.gduarte-28e.workers.dev/',
  'Collect the role, request type, affected course, student impact, grade impact, and whether the request is bounded or broad.',
  'Confirm role, request type, impact, ownership, and next step before submitting.',
  'If the decision is uncertain, submit enough detail for triage instead of using chat as the request.',
  '{"tools":["D1 Decision Guide","Ticket Routing"],"audience":["Learner Services","Academic Leads","PMs","Instructional Designers","Faculty"],"sourceUrl":"https://its-ticket-guide.gduarte-28e.workers.dev/"}',
  'Initial structured decision guide imported from ITS Ticket Guide.',
  'Published',
  'tarek-jacobs',
  'tarek-jacobs',
  'tarek-jacobs',
  '2026-07-08T18:00:00Z',
  '2026-07-08T18:00:00Z',
  '2026-07-08T18:00:00Z',
  1783533600,
  1783533600
);

INSERT OR IGNORE INTO decision_guides (
  id, slug, title, summary, source_url, category_id, owner_team_id, default_sop_id, status, visibility, created_at, updated_at
) VALUES (
  'guide-its-ticket-routing',
  'its-ticket-routing',
  'ITS Ticket Guide',
  'Structured decision guide for course support routing, ticket ownership, ServiceNow handoffs, multimedia routing, Cengage triage, and project-path detection.',
  'https://its-ticket-guide.gduarte-28e.workers.dev/',
  'category-its-ticket-routing',
  'team-instructional-technology',
  'sop-its-ticket-routing-guide',
  'Published',
  'Internal',
  '2026-07-08T18:00:00Z',
  '2026-07-08T18:00:00Z'
);

INSERT OR IGNORE INTO decision_guide_roles (id, guide_id, role_key, label, icon, hint, sort_order) VALUES
  ('guide-role-learner-services', 'guide-its-ticket-routing', 'learner-services', 'Learner Services', 'headphones', 'You are helping a student or instructor report an issue.', 10),
  ('guide-role-academic', 'guide-its-ticket-routing', 'academic', 'Academic lead or PD', 'graduation-cap', 'You are validating course content or student-impact decisions.', 20),
  ('guide-role-pm-id', 'guide-its-ticket-routing', 'pm-id', 'PM or ID', 'clipboard-list', 'You are working on templates, course builds, or curriculum updates.', 30),
  ('guide-role-faculty', 'guide-its-ticket-routing', 'faculty', 'Faculty or instructor', 'presentation', 'You found an issue while teaching or supporting students.', 40);

INSERT OR IGNORE INTO decision_role_adjustments (id, guide_id, role_key, display_name, note, sort_order) VALUES
  ('guide-adjust-learner-services', 'guide-its-ticket-routing', 'learner-services', 'For Learner Services', 'Collect enough detail to avoid another handoff.', 10),
  ('guide-adjust-academic', 'guide-its-ticket-routing', 'academic', 'For academic leads and PDs', 'Validate whether the change should happen before asking another team to implement it.', 20),
  ('guide-adjust-pm-id', 'guide-its-ticket-routing', 'pm-id', 'For PMs and IDs', 'Use tickets for bounded work and project paths for design or content ownership.', 30),
  ('guide-adjust-faculty', 'guide-its-ticket-routing', 'faculty', 'For faculty and instructors', 'Start with the support path your program uses rather than sending direct ITS requests.', 40);

INSERT OR IGNORE INTO decision_request_types (
  id, guide_id, request_key, label, icon, hint, default_badge, default_title, default_summary, sort_order
) VALUES
  ('guide-request-broken', 'guide-its-ticket-routing', 'broken', 'Something is broken', 'wrench', 'Link, quiz, assignment, page, tool, or access issue.', 'Ticket first', 'Submit a clear ticket and ITS will route it if needed.', 'For broken course items, ITS may fix the issue, route it to ID or multimedia, or flag it as a project if the request is too broad.', 10),
  ('guide-request-enrollment', 'guide-its-ticket-routing', 'enrollment', 'Enrollment or access', 'user-plus', 'Add a student, instructor, PD, or staff member.', 'Not ITS', 'Enrollment requests go to ServiceNow / LMS IT Team.', 'ITS is not the owner for adding people to courses. The clear route is ServiceNow because that is the LMS IT Team path for this type of access work.', 20),
  ('guide-request-template', 'guide-its-ticket-routing', 'template', 'Template request', 'copy', 'Create, clone, prepare, or track a course template.', 'ITS for now', 'Template requests still go to ITS, but only as tickets.', 'Template creation and new-build setup remain with ITS while tracking, naming, date management, and launch-readiness processes are cleaned up.', 30),
  ('guide-request-media', 'guide-its-ticket-routing', 'media', 'Video or media', 'video', 'Kaltura, Captivate, H5P, video, or completion issue.', 'Route by cause', 'Media issues may route to multimedia after a quick review.', 'If the issue is Kaltura, Captivate, H5P, or media content, the multimedia team is usually the owner. ITS may help identify the cause during the transition.', 40),
  ('guide-request-cengage', 'guide-its-ticket-routing', 'cengage', 'Cengage', 'book-open-check', 'Grade sync, launch, activity, or vendor issue.', 'High watch', 'Cengage requests are being sorted into better support paths.', 'Some Cengage issues require ITS for D2L/Cengage connection checks. Others should be handled through Learner Services, faculty guidance, or Cengage support.', 50),
  ('guide-request-project', 'guide-its-ticket-routing', 'project', 'Large change', 'git-pull-request', 'Book changes, many quiz updates, or broad course edits.', 'Not a ticket', 'This sounds like a project, not a support ticket.', 'A ticket is a bounded fix. Broad content replacement, a book edition change, many quiz changes, or multi-course coordination needs a project path.', 60);

INSERT OR IGNORE INTO decision_routing_rules (
  id, guide_id, request_type_id, role_key, route_label, route_class, destination_label, destination_team_id, action_type,
  requires_ticket, requires_project_path, priority_score, urgency_score, ownership_score, confidence_base,
  title, summary, next_steps_json, external_url, sort_order
) VALUES
  ('guide-rule-broken-default', 'guide-its-ticket-routing', 'guide-request-broken', NULL, 'Ticket first', 'route-watch', 'ITS filters first', 'team-instructional-technology', 'submit_ticket', 1, 0, 50, 40, 45, 62, 'Submit a clear ticket and ITS will route it if needed.', 'For broken course items, ITS may fix the issue, route it to ID or multimedia, or flag it as a project if the request is too broad.', '["Include the course, section, week/module, item name, and screenshots or error text.","Say whether students are currently blocked or grades are affected.","If the fix is a content decision, expect the ticket to move to the academic or ID owner."]', NULL, 10),
  ('guide-rule-enrollment-default', 'guide-its-ticket-routing', 'guide-request-enrollment', NULL, 'Not ITS', 'route-not-ticket', 'ServiceNow / LMS IT Team', 'team-lms-it', 'service_now', 0, 0, 40, 35, 95, 86, 'Enrollment requests go to ServiceNow / LMS IT Team.', 'ITS is not the owner for adding people to courses. The clear route is ServiceNow because that is the LMS IT Team path for this type of access work.', '["Do not send enrollment requests by chat.","Submit the request through ServiceNow for the LMS IT Team.","If you do not have access to that system yet, follow the account-request steps in the SOP."]', NULL, 20),
  ('guide-rule-template-default', 'guide-its-ticket-routing', 'guide-request-template', NULL, 'ITS now', 'route-its', 'Avanti ticket', 'team-instructional-technology', 'submit_ticket', 1, 0, 45, 25, 70, 72, 'Template requests still go to ITS, but only as tickets.', 'Template creation and new-build setup remain with ITS while tracking, naming, date management, and launch-readiness processes are cleaned up.', '["Submit an Avanti ticket rather than using the template request chat.","Include whether this is a regular clone or a new-build template.","For new builds, ITS focuses on technical setup: gradebook, dates, nav placement, and course offering checks."]', NULL, 30),
  ('guide-rule-media-default', 'guide-its-ticket-routing', 'guide-request-media', NULL, 'Reroute', 'route-reroute', 'Multimedia', 'team-multimedia', 'reroute', 1, 0, 45, 35, 85, 78, 'Media issues may route to multimedia after a quick review.', 'If the issue is Kaltura, Captivate, H5P, or media content, the multimedia team is usually the owner. ITS may help identify the cause during the transition.', '["Include the exact media item, course location, and what the user sees.","Note whether one student or many students are affected.","If the issue is inside the media asset or platform, expect the ticket to be assigned to multimedia."]', NULL, 40),
  ('guide-rule-cengage-default', 'guide-its-ticket-routing', 'guide-request-cengage', NULL, 'High watch', 'route-watch', 'ITS or Cengage support', 'team-instructional-technology', 'clarify', 1, 0, 70, 55, 55, 68, 'Cengage requests are being sorted into better support paths.', 'Some Cengage issues require ITS for D2L/Cengage connection checks. Others should be handled through Learner Services, faculty guidance, or Cengage support.', '["Say whether this affects one student or the whole course.","For grade sync, check whether other students have grades passing correctly.","Vendor/system errors may move toward a Learner Services-to-Cengage support path."]', NULL, 50),
  ('guide-rule-project-default', 'guide-its-ticket-routing', 'guide-request-project', NULL, 'Not a ticket', 'route-not-ticket', 'Academic/project path', 'team-academic-leadership', 'project_path', 0, 1, 25, 20, 90, 88, 'This sounds like a project, not a support ticket.', 'A ticket is a bounded fix. Broad content replacement, a book edition change, many quiz changes, or multi-course coordination needs a project path.', '["Document the scope and desired outcome.","Do not ask ITS to coordinate the redesign through a ticket.","Work with the academic, PM, or governance path before implementation."]', NULL, 60);

INSERT OR IGNORE INTO decision_rule_signals (id, rule_id, signal_key, signal_value, weight, polarity) VALUES
  ('signal-broken-student-blocked', 'guide-rule-broken-default', 'student_blocked', 'true', 14, 1),
  ('signal-broken-grades', 'guide-rule-broken-default', 'grades_affected', 'true', 16, 1),
  ('signal-broken-bounded', 'guide-rule-broken-default', 'bounded_fix', 'true', 10, 1),
  ('signal-enrollment-access', 'guide-rule-enrollment-default', 'access_request', 'true', 20, 1),
  ('signal-enrollment-add-person', 'guide-rule-enrollment-default', 'add_person', 'true', 20, 1),
  ('signal-template-clone', 'guide-rule-template-default', 'template_clone', 'true', 12, 1),
  ('signal-template-new-build', 'guide-rule-template-default', 'new_build', 'true', 10, 1),
  ('signal-media-kaltura', 'guide-rule-media-default', 'kaltura', 'true', 15, 1),
  ('signal-media-captivate', 'guide-rule-media-default', 'captivate', 'true', 15, 1),
  ('signal-media-h5p', 'guide-rule-media-default', 'h5p', 'true', 15, 1),
  ('signal-cengage-vendor', 'guide-rule-cengage-default', 'vendor_issue', 'true', 12, 1),
  ('signal-cengage-many', 'guide-rule-cengage-default', 'many_students', 'true', 12, 1),
  ('signal-project-broad', 'guide-rule-project-default', 'broad_change', 'true', 20, 1),
  ('signal-project-many-edits', 'guide-rule-project-default', 'many_items', 'true', 18, 1),
  ('signal-project-book-change', 'guide-rule-project-default', 'book_change', 'true', 18, 1);

INSERT OR IGNORE INTO decision_scenarios (
  id, guide_id, request_type_id, title, route_label, route_class, destination_label, why, next_step, sort_order
) VALUES
  ('scenario-broken-link', 'guide-its-ticket-routing', 'guide-request-broken', 'A course link is broken', 'Watch', 'route-watch', 'ITS filters first', 'The issue could be a simple link fix, a content replacement, or an ID decision.', 'Include location, link, screenshot, and whether students are blocked.', 10),
  ('scenario-enrollment-add', 'guide-its-ticket-routing', 'guide-request-enrollment', 'Add someone to a course', 'Not ITS', 'route-not-ticket', 'ServiceNow / LMS IT Team', 'Enrollments belong with the LMS IT Team, not the ITS ticket queue.', 'Submit through ServiceNow; do not ask by chat.', 20),
  ('scenario-template-clone', 'guide-its-ticket-routing', 'guide-request-template', 'Request a template clone', 'ITS now', 'route-its', 'Avanti ticket', 'ITS still needs visibility while template tracking is being cleaned up.', 'Submit the ticket with template name, term/session, and requested timing.', 30),
  ('scenario-template-new-build', 'guide-its-ticket-routing', 'guide-request-template', 'Prepare a new-build template', 'ITS now', 'route-its', 'Avanti ticket', 'ITS still owns technical setup checks for new builds.', 'Expect gradebook, date, nav, and course offering checks; not BrowserStack or end-user review.', 40),
  ('scenario-media-kaltura', 'guide-its-ticket-routing', 'guide-request-media', 'Kaltura recording issue', 'Reroute', 'route-reroute', 'Multimedia', 'Kaltura platform behavior belongs to the media owner.', 'Provide the recording, issue description, and timing details.', 50),
  ('scenario-media-captivate', 'guide-its-ticket-routing', 'guide-request-media', 'Captivate completed, no grade', 'Reroute', 'route-reroute', 'Learner Services and multimedia', 'If other students have grades, the issue is likely a one-off student case.', 'Confirm gradebook evidence, troubleshoot the student, and route media analysis to multimedia.', 60),
  ('scenario-cengage-one-student', 'guide-its-ticket-routing', 'guide-request-cengage', 'One student''s Cengage grade did not sync', 'Watch', 'route-watch', 'ITS for now', 'The team is checking whether faculty or Learner Services can handle one-off sync steps.', 'Check whether other students have grades. If yes, treat it as one-off evidence.', 70),
  ('scenario-cengage-many-students', 'guide-its-ticket-routing', 'guide-request-cengage', 'Cengage activity will not launch for many students', 'Watch', 'route-watch', 'ITS or Cengage support', 'All-student issues may indicate configuration or vendor failure.', 'Report scope clearly and include the exact Cengage activity and error.', 80),
  ('scenario-project-quiz-replace', 'guide-its-ticket-routing', 'guide-request-project', 'Replace all quiz questions in a course', 'Not a ticket', 'route-not-ticket', 'Academic/project path', 'That is course redevelopment work, not a bounded fix.', 'Start with scope, academic approval, and project coordination.', 90);

INSERT OR IGNORE INTO decision_journey_steps (id, guide_id, step_number, title, body) VALUES
  ('journey-ticket-1', 'guide-its-ticket-routing', 1, 'Start with a real ticket', 'The request needs a trackable home. Chat can support the conversation after the ticket exists.'),
  ('journey-ticket-2', 'guide-its-ticket-routing', 2, 'Describe the impact', 'Tell us whether grades, access, active students, or live sections are affected.'),
  ('journey-ticket-3', 'guide-its-ticket-routing', 3, 'ITS checks ownership', 'During the transition, ITS may still filter ambiguous requests so they reach the right owner.'),
  ('journey-ticket-4', 'guide-its-ticket-routing', 4, 'The ticket moves', 'If ID, multimedia, IT, Learner Services, or a vendor owns the work, the ticket follows that ownership.'),
  ('journey-ticket-5', 'guide-its-ticket-routing', 5, 'Patterns become SOPs', 'Repeated examples will become clearer forms, routing rules, and self-service guidance.');

INSERT OR IGNORE INTO decision_faqs (id, guide_id, question, answer, sort_order) VALUES
  ('faq-ticket-chat', 'guide-its-ticket-routing', 'Can I still ask in chat?', 'Yes, for clarification. No, as the actual request. Work starts with a ticket so it can be tracked, prioritized, and routed.', 10),
  ('faq-ticket-right-team', 'guide-its-ticket-routing', 'What if I do not know the right team?', 'Submit the best ticket you can with clear details. ITS will filter during the transition when the destination is not obvious.', 20),
  ('faq-ticket-reassigned', 'guide-its-ticket-routing', 'Why might my ticket be reassigned?', 'Because the person accountable for the work should own the ticket. ITS should not be the middle layer for ID, media, vendor, or academic decisions.', 30),
  ('faq-ticket-urgent', 'guide-its-ticket-routing', 'What counts as urgent?', 'Grade-impacting problems, assignment or quiz blockers, and active student access issues move first.', 40),
  ('faq-ticket-not-ticket', 'guide-its-ticket-routing', 'What is not a ticket?', 'Large course changes, book edition changes, all-quiz updates, broad content replacement, and work that needs cross-team project coordination.', 50),
  ('faq-ticket-include', 'guide-its-ticket-routing', 'What should I include?', 'Course, section, week/module, item name, screenshot or error, how many users are affected, and whether this is live-section or template-only.', 60),
  ('faq-ticket-enrollments', 'guide-its-ticket-routing', 'Where do enrollments go?', 'Enrollment and course-access requests should go through ServiceNow for the LMS IT Team. ITS should not receive those as chat favors.', 70);

INSERT OR IGNORE INTO sop_tags (sop_id, tag_id) VALUES
  ('sop-its-ticket-routing-guide', 'tag-ticketing'),
  ('sop-its-ticket-routing-guide', 'tag-routing'),
  ('sop-its-ticket-routing-guide', 'tag-service-now'),
  ('sop-its-ticket-routing-guide', 'tag-media'),
  ('sop-its-ticket-routing-guide', 'tag-cengage'),
  ('sop-its-ticket-routing-guide', 'tag-project-path');
