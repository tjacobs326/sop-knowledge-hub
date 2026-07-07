-- Allow the same workflow action from multiple source states.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS sop_workflow_transitions_v2 (
  id TEXT PRIMARY KEY,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  action TEXT NOT NULL,
  label TEXT NOT NULL,
  required_permission TEXT NOT NULL,
  creates_review INTEGER NOT NULL DEFAULT 0 CHECK (creates_review IN (0, 1)),
  requires_notes INTEGER NOT NULL DEFAULT 0 CHECK (requires_notes IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (from_status) REFERENCES sop_workflow_states(status) ON DELETE CASCADE,
  FOREIGN KEY (to_status) REFERENCES sop_workflow_states(status) ON DELETE CASCADE,
  FOREIGN KEY (required_permission) REFERENCES permissions(name) ON DELETE RESTRICT
);

INSERT OR IGNORE INTO sop_workflow_transitions_v2 (
  id, from_status, to_status, action, label, required_permission, creates_review, requires_notes, sort_order
)
SELECT
  id, from_status, to_status, action, label, required_permission, creates_review, requires_notes, sort_order
FROM sop_workflow_transitions;

DROP TABLE sop_workflow_transitions;
ALTER TABLE sop_workflow_transitions_v2 RENAME TO sop_workflow_transitions;

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO sop_workflow_transitions (
  id, from_status, to_status, action, label, required_permission, creates_review, requires_notes, sort_order
) VALUES
  ('transition-submit-review', 'Draft', 'In Review', 'submit-review', 'Submit for review', 'Edit Drafts', 1, 0, 10),
  ('transition-resubmit-review', 'Needs Revision', 'In Review', 'submit-review', 'Resubmit for review', 'Edit Drafts', 1, 0, 20),
  ('transition-request-changes', 'In Review', 'Needs Revision', 'request-changes', 'Request changes', 'Request Changes', 0, 1, 30),
  ('transition-approve', 'In Review', 'Approved', 'approve', 'Approve SOP', 'Approve SOPs', 0, 0, 40),
  ('transition-publish', 'Approved', 'Published', 'publish', 'Publish SOP', 'Publish SOPs', 0, 0, 50),
  ('transition-archive-draft', 'Draft', 'Archived', 'archive', 'Archive draft', 'Archive SOPs', 0, 1, 60),
  ('transition-archive-published', 'Published', 'Archived', 'archive', 'Archive published SOP', 'Archive SOPs', 0, 1, 70);

CREATE INDEX IF NOT EXISTS idx_workflow_transitions_from ON sop_workflow_transitions(from_status, sort_order);
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_action ON sop_workflow_transitions(action, from_status);
