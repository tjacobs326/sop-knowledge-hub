CREATE INDEX IF NOT EXISTS idx_work_sops_subrole_status_updated
ON sops(owner_sub_role_id, status, is_active, updated_at);

CREATE INDEX IF NOT EXISTS idx_work_sops_team_status_updated
ON sops(owner_team_id, status, is_active, updated_at);

CREATE INDEX IF NOT EXISTS idx_work_sops_owner_status_updated
ON sops(owner_id, status, is_active, updated_at);

CREATE INDEX IF NOT EXISTS idx_work_sops_owner_user_status_updated
ON sops(owner_user_id, status, is_active, updated_at);

CREATE INDEX IF NOT EXISTS idx_work_sop_assignments_team_type_status_due
ON sop_assignments(team_id, assignment_type, status, due_at);

CREATE INDEX IF NOT EXISTS idx_work_sop_assignments_user_type_status_due
ON sop_assignments(user_id, assignment_type, status, due_at);

CREATE INDEX IF NOT EXISTS idx_work_sop_assignments_sop_status
ON sop_assignments(sop_id, status, assignment_type);

CREATE INDEX IF NOT EXISTS idx_work_sop_requests_subrole_status_updated
ON sop_requests(owner_sub_role_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_work_sop_requests_team_status_updated
ON sop_requests(assigned_team_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_work_sop_requests_department_status_updated
ON sop_requests(assigned_department, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_work_sop_requests_submitted_email_status
ON sop_requests(submitted_by_email, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_work_sop_requests_assigned_to_status
ON sop_requests(assigned_to, status, updated_at);
