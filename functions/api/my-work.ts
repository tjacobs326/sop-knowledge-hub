import { success } from "../_shared/api";
import { requireDb } from "../_shared/admin";
import { type D1DatabaseBinding, type PagesFunctionContext } from "../_shared/cloudflare";
import {
  resolveCreatorWorkScope,
  subRoleRequestScopeClause,
  subRoleSopScopeClause,
  type ResolvedWorkScope,
} from "../_shared/work-scope";

const requestWorkflowColumns: Record<string, string> = {
  category_id: "TEXT",
  category_name: "TEXT",
  tool_system: "TEXT",
  audience: "TEXT",
  assigned_department: "TEXT",
  assigned_team_id: "TEXT",
  owner_sub_role_id: "TEXT",
  reviewer_notes: "TEXT",
  denial_reason: "TEXT",
  request_notes: "TEXT",
  routing_reason: "TEXT",
  draft_sop_id: "TEXT",
  related_sop_id: "TEXT",
  submitted_by_user_id: "TEXT",
  submitted_at: "INTEGER",
  reviewed_at: "INTEGER",
  assigned_at: "INTEGER",
  accepted_at: "INTEGER",
  declined_at: "INTEGER",
  approved_at: "INTEGER",
  published_at: "INTEGER",
  closed_at: "INTEGER",
};

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function detailUrl(row: Record<string, unknown>) {
  if (row.slug) return `/sops/detail/?slug=${encodeURIComponent(String(row.slug))}`;
  return `/sops/detail/?id=${encodeURIComponent(String(row.id || row.sopId || ""))}`;
}

function normalizeDate(value: unknown) {
  if (!value) return "";
  if (typeof value === "number") return new Date(value * 1000).toISOString().slice(0, 10);
  const raw = String(value);
  if (/^\d+$/.test(raw)) return new Date(Number(raw) * 1000).toISOString().slice(0, 10);
  return raw.slice(0, 10);
}

function normalizeRequest(row: Record<string, unknown>) {
  const id = String(row.id || "");
  return {
    id,
    itemType: "request",
    title: row.title || row.requestedTitle || "Untitled SOP Request",
    status: row.status || "Submitted",
    priority: row.priority || "Medium",
    updatedDate: normalizeDate(row.updatedAt || row.createdAt),
    reviewDate: normalizeDate(row.desiredCompletionAt || row.assignedAt || row.createdAt),
    owner: row.assignedToName || row.assignedDepartment || "Unassigned",
    department: row.assignedDepartment || row.departmentName || "",
    category: row.category || "Uncategorized",
    url: `/review-queue/?review=${encodeURIComponent(`request:${id}`)}&origin=my-work-submitted-requests`,
  };
}

function normalizeSop(row: Record<string, unknown>) {
  const id = String(row.id || "");
  return {
    id,
    title: row.title || "Untitled SOP",
    category: row.category || "Uncategorized",
    status: row.status || "Draft",
    owner: row.owner || row.ownerDepartment || "Unassigned",
    reviewDate: normalizeDate(row.reviewDate || row.reviewDueAt || row.dueAt),
    updatedDate: normalizeDate(row.updatedAt || row.createdAt),
    ownerSubRoleId: row.ownerSubRoleId || "",
    ownerSubRole: row.ownerSubRole || "",
    ownerDepartment: row.ownerDepartment || "",
    assignmentType: row.assignmentType || "",
    url: detailUrl(row),
    editUrl: `/create/?edit=draft&id=${encodeURIComponent(id)}`,
  };
}

function withEditOrigin(url: string, origin: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}origin=${encodeURIComponent(origin)}`;
}

function normalizeReview(row: Record<string, unknown>) {
  const sopId = String(row.sopId || row.id || "");
  return {
    id: `sop:${sopId}`,
    itemType: "sop",
    title: row.title || row.sopTitle || "Untitled Review",
    status: row.status || "Assigned",
    priority: row.priority || "Medium",
    reviewDate: normalizeDate(row.dueDate || row.reviewDate || row.dueAt),
    owner: row.reviewer || row.owner || "Unassigned",
    url: `/review-queue/?review=${encodeURIComponent(`sop:${sopId}`)}`,
  };
}

async function ensureRequestWorkflowSchema(db: D1DatabaseBinding) {
  const info = await db.prepare("PRAGMA table_info(sop_requests)").all<{ name: string }>();
  const existing = new Set((info.results || []).map((row) => row.name));
  for (const [column, type] of Object.entries(requestWorkflowColumns)) {
    if (!existing.has(column)) {
      await db.prepare(`ALTER TABLE sop_requests ADD COLUMN ${column} ${type}`).run();
    }
  }
}

async function querySubmittedRequests(db: D1DatabaseBinding, workScope: ResolvedWorkScope) {
  const scope = subRoleRequestScopeClause("sop_requests", workScope.subRole);
  const personalClauses: string[] = [];
  const values: unknown[] = [...scope.values];
  if (workScope.selectedUser?.email) {
    personalClauses.push("lower(sop_requests.submitted_by_email) = lower(?)");
    values.push(workScope.selectedUser.email);
  }
  if (workScope.selectedUser?.id) {
    personalClauses.push("sop_requests.submitted_by_user_id = ?");
    values.push(workScope.selectedUser.id);
  }
  const scopeFilter = workScope.selectedUser && personalClauses.length
    ? `(${scope.sql}) AND (${personalClauses.join(" OR ")})`
    : scope.sql;

  const result = await db
    .prepare(
      `SELECT
        sop_requests.id,
        sop_requests.requested_title AS title,
        sop_requests.department_name AS departmentName,
        sop_requests.submitted_by_email AS submittedByEmail,
        sop_requests.priority,
        sop_requests.status,
        sop_requests.desired_completion_at AS desiredCompletionAt,
        sop_requests.category_name AS category,
        sop_requests.assigned_department AS assignedDepartment,
        assignee.name AS assignedToName,
        sop_requests.created_at AS createdAt,
        sop_requests.updated_at AS updatedAt
       FROM sop_requests
       LEFT JOIN users assignee ON assignee.id = sop_requests.assigned_to
       WHERE ${scopeFilter}
        AND sop_requests.status NOT IN ('Published', 'Closed', 'Declined', 'Rejected', 'Archived', 'Cancelled')
       ORDER BY sop_requests.updated_at DESC
       LIMIT 100`,
    )
    .bind(...values)
    .all<Record<string, unknown>>();

  return (result.results || []).map(normalizeRequest);
}

async function queryDraftSops(db: D1DatabaseBinding, workScope: ResolvedWorkScope) {
  const scope = subRoleSopScopeClause("sops", workScope.subRole);
  const personalClauses: string[] = [];
  const values: unknown[] = [...scope.values];
  if (workScope.selectedUser?.id) {
    personalClauses.push("COALESCE(sops.owner_id, sops.owner_user_id) = ?");
    personalClauses.push("sops.created_by_user_id = ?");
    personalClauses.push(`EXISTS (
      SELECT 1 FROM sop_assignments user_assignments
      WHERE user_assignments.sop_id = sops.id
       AND user_assignments.status = 'Active'
       AND user_assignments.user_id = ?
    )`);
    values.push(workScope.selectedUser.id, workScope.selectedUser.id, workScope.selectedUser.id);
  }
  const scopeFilter = workScope.selectedUser && personalClauses.length
    ? `(${scope.sql}) AND (${personalClauses.join(" OR ")})`
    : scope.sql;

  const result = await db
    .prepare(
      `SELECT
        sops.id,
        sops.title,
        sops.slug,
        sops.status,
        sops.review_date AS reviewDate,
        sops.review_due_at AS reviewDueAt,
        sops.updated_at AS updatedAt,
        categories.name AS category,
        owner.name AS owner,
        sub_roles.label AS ownerSubRole,
        sub_roles.department AS ownerDepartment,
        sops.owner_sub_role_id AS ownerSubRoleId
       FROM sops
       LEFT JOIN categories ON categories.id = sops.category_id
       LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
       LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id
       WHERE ${scopeFilter}
        AND COALESCE(sops.is_active, 1) = 1
        AND sops.status IN ('Draft', 'Needs Revision', 'In Review', 'Approved')
       ORDER BY sops.updated_at DESC
       LIMIT 100`,
    )
    .bind(...values)
    .all<Record<string, unknown>>();

  return (result.results || []).map((row) => {
    const sop = normalizeSop(row);
    return {
      ...sop,
      editUrl: withEditOrigin(sop.editUrl, "my-work-drafts"),
    };
  });
}

async function queryOwnedSops(db: D1DatabaseBinding, workScope: ResolvedWorkScope) {
  const scope = subRoleSopScopeClause("sops", workScope.subRole);
  const personalClauses: string[] = [];
  const values: unknown[] = [...scope.values];
  if (workScope.selectedUser?.id) {
    personalClauses.push("COALESCE(sops.owner_id, sops.owner_user_id) = ?");
    values.push(workScope.selectedUser.id);
  }
  const scopeFilter = workScope.selectedUser && personalClauses.length
    ? `(${scope.sql}) AND (${personalClauses.join(" OR ")})`
    : scope.sql;
  const result = await db
    .prepare(
      `SELECT
        sops.id,
        sops.title,
        sops.slug,
        sops.status,
        sops.review_date AS reviewDate,
        sops.review_due_at AS reviewDueAt,
        sops.updated_at AS updatedAt,
        categories.name AS category,
        owner.name AS owner,
        sub_roles.label AS ownerSubRole,
        sub_roles.department AS ownerDepartment,
        sops.owner_sub_role_id AS ownerSubRoleId
       FROM sops
       LEFT JOIN categories ON categories.id = sops.category_id
       LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
       LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id
       WHERE ${scopeFilter}
        AND COALESCE(sops.is_active, 1) = 1
        AND sops.status NOT IN ('Archived')
       ORDER BY sops.updated_at DESC
       LIMIT 100`,
    )
    .bind(...values)
    .all<Record<string, unknown>>();
  return (result.results || []).map((row) => {
    const sop = normalizeSop(row);
    return {
      ...sop,
      editUrl: withEditOrigin(sop.editUrl, "owned-sops"),
    };
  });
}

async function queryAssignments(db: D1DatabaseBinding, workScope: ResolvedWorkScope) {
  const sopScope = subRoleSopScopeClause("sops", workScope.subRole);
  const clauses: string[] = [];
  const values: unknown[] = [...sopScope.values];
  if (workScope.scope === "team" && workScope.subRole.teamId) {
    clauses.push("sop_assignments.team_id = ?");
    values.push(workScope.subRole.teamId);
  }
  if (workScope.scope === "team") {
    clauses.push("sops.owner_sub_role_id = ?");
    values.push(workScope.subRole.id);
  }
  if (workScope.selectedUser?.id) {
    clauses.push("sop_assignments.user_id = ?");
    values.push(workScope.selectedUser.id);
  }
  if (!clauses.length) return [];

  const result = await db
    .prepare(
      `SELECT
        sop_assignments.id,
        sop_assignments.assignment_type AS assignmentType,
        sop_assignments.due_at AS dueAt,
        sops.id AS sopId,
        sops.id,
        sops.title,
        sops.slug,
        sops.status,
        sops.review_date AS reviewDate,
        sops.review_due_at AS reviewDueAt,
        sops.updated_at AS updatedAt,
        categories.name AS category,
        COALESCE(assigned.name, owner.name) AS owner,
        sub_roles.label AS ownerSubRole,
        sub_roles.department AS ownerDepartment,
        sops.owner_sub_role_id AS ownerSubRoleId
       FROM sop_assignments
       JOIN sops ON sops.id = sop_assignments.sop_id
       LEFT JOIN categories ON categories.id = sops.category_id
       LEFT JOIN users assigned ON assigned.id = sop_assignments.user_id
       LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
       LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id
       WHERE sop_assignments.status = 'Active'
        AND sop_assignments.assignment_type IN ('Reviewer', 'Approver', 'Publisher')
        AND COALESCE(sops.is_active, 1) = 1
        AND sops.status IN ('In Review', 'Approved')
        AND ${sopScope.sql}
        AND (${clauses.join(" OR ")})
       ORDER BY sop_assignments.due_at ASC, sops.updated_at DESC
       LIMIT 100`,
    )
    .bind(...values)
    .all<Record<string, unknown>>();

  return (result.results || []).map(normalizeSop);
}

async function queryReviewItems(db: D1DatabaseBinding, workScope: ResolvedWorkScope) {
  const requestScope = subRoleRequestScopeClause("sop_requests", workScope.subRole);
  const requestClauses: string[] = [];
  const requestValues: unknown[] = [...requestScope.values];
  if (workScope.selectedUser?.id) {
    requestClauses.push("sop_requests.assigned_to = ?");
    requestValues.push(workScope.selectedUser.id);
  }
  const requestScopeFilter = requestClauses.length
    ? `(${requestScope.sql}) AND (${requestClauses.join(" OR ")})`
    : requestScope.sql;

  const sopScope = subRoleSopScopeClause("sops", workScope.subRole);
  const reviewClauses: string[] = [];
  const reviewValues: unknown[] = [...sopScope.values];
  if (workScope.scope === "team" && workScope.subRole.teamId) {
    reviewClauses.push("sop_assignments.team_id = ?");
    reviewValues.push(workScope.subRole.teamId);
  }
  if (workScope.scope === "team") {
    reviewClauses.push("sops.owner_sub_role_id = ?");
    reviewValues.push(workScope.subRole.id);
  }
  if (workScope.selectedUser?.id) {
    reviewClauses.push("sop_assignments.user_id = ?");
    reviewValues.push(workScope.selectedUser.id);
  }

  const [requestReviews, assignmentReviews] = await Promise.all([
    db
      .prepare(
        `SELECT
          sop_requests.id,
          sop_requests.requested_title AS title,
          sop_requests.priority,
          sop_requests.status,
          sop_requests.desired_completion_at AS desiredCompletionAt,
          sop_requests.assigned_department AS assignedDepartment,
          assignee.name AS assignedToName,
          sop_requests.created_at AS createdAt,
          sop_requests.updated_at AS updatedAt
         FROM sop_requests
         LEFT JOIN users assignee ON assignee.id = sop_requests.assigned_to
         WHERE sop_requests.status IN (
          'Under Review', 'Needs More Information', 'Assigned', 'In Approval'
         )
          AND ${requestScopeFilter}
         ORDER BY sop_requests.updated_at DESC
         LIMIT 100`,
      )
      .bind(...requestValues)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT
          sop_assignments.id,
          sop_assignments.assignment_type AS assignmentType,
          sop_assignments.due_at AS dueDate,
          sops.id AS sopId,
          sops.title AS title,
          sops.status,
          sops.review_date AS reviewDate,
          COALESCE(assigned.name, owner.name) AS reviewer
         FROM sop_assignments
         JOIN sops ON sops.id = sop_assignments.sop_id
         LEFT JOIN users assigned ON assigned.id = sop_assignments.user_id
         LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
         WHERE sop_assignments.status = 'Active'
          AND sop_assignments.assignment_type IN ('Reviewer', 'Approver', 'Publisher')
          AND COALESCE(sops.is_active, 1) = 1
          AND sops.status IN ('In Review', 'Needs Revision', 'Approved')
          AND ${sopScope.sql}
          AND (${reviewClauses.join(" OR ")})
         ORDER BY sop_assignments.due_at ASC, sops.updated_at DESC
         LIMIT 100`,
      )
      .bind(...reviewValues)
      .all<Record<string, unknown>>(),
  ]);

  return [
    ...(requestReviews.results || []).map(normalizeRequest),
    ...(assignmentReviews.results || []).map(normalizeReview),
  ];
}

function uniqueById<T extends { id?: unknown }>(items: T[]) {
  const map = new Map<string, T>();
  items.forEach((item) => {
    const id = String(item.id || "");
    if (id && !map.has(id)) map.set(id, item);
  });
  return Array.from(map.values());
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const db = context.env.DB!;
  await ensureRequestWorkflowSchema(db);

  const resolved = await resolveCreatorWorkScope(db, context);
  if (resolved.response || !resolved.subRole || !resolved.user) return resolved.response;

  const [submittedRequests, draftSops, ownedSops, assignedItems, reviewItems] = await Promise.all([
    querySubmittedRequests(db, resolved),
    queryDraftSops(db, resolved),
    queryOwnedSops(db, resolved),
    queryAssignments(db, resolved),
    queryReviewItems(db, resolved),
  ]);

  const today = isoToday();
  const activeReviewItems = uniqueById(reviewItems);
  const assigned = uniqueById(assignedItems);
  const overdueReviews = uniqueById([
    ...activeReviewItems.filter((item) => item.reviewDate && item.reviewDate < today),
  ]);

  return success({
    context: {
      role: resolved.user.role,
      accessLevel: resolved.selectedUser?.accessLevel || resolved.user.accessLevel,
      selectedUser: resolved.selectedUser,
      selectedSubRole: resolved.subRole,
      workScope: resolved.scope,
      workScopeLabel: resolved.label,
      workScopeDescription: resolved.description,
    },
    viewOptions: {
      users: resolved.users,
      subRoles: [resolved.subRole],
      scopes: [
        {
          id: "team",
          label: `Team Queue - ${resolved.subRole.department}`,
          description: `Team work assigned to ${resolved.subRole.label}.`,
        },
        {
          id: "mine",
          label: "My personal work",
          description: "Work directly assigned to or owned by me.",
        },
        ...(resolved.user.role === "admin"
          ? resolved.users.map((user) => ({
              id: `user:${user.id}`,
              label: `${user.name} - ${user.department || user.title || resolved.subRole.department}`,
              description: `Personal work for ${user.name}.`,
            }))
          : []),
      ],
    },
    counts: {
      submittedRequests: submittedRequests.length,
      draftSops: draftSops.length,
      assignedToTeam: assigned.length,
      teamReviewsNeeded: activeReviewItems.length,
      overdueReviews: overdueReviews.length,
    },
    sections: {
      submittedRequests,
      draftSops,
      assignedItems: assigned,
      ownedSops,
      reviewItems: activeReviewItems,
      overdueReviews,
    },
  });
};
