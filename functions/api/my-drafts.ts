import { cacheHeaders, failure, optionalText } from "../_shared/api";
import { requireDb } from "../_shared/admin";
import { hasPermission, requirePermission } from "../_shared/auth";
import { type D1DatabaseBinding, type PagesFunctionContext } from "../_shared/cloudflare";
import { resolveRequestedCreatorSubRole, type CreatorSubRole } from "../_shared/ownership";

interface DraftUser {
  id: string;
  name: string;
  email: string;
  accessLevel: string;
  department?: string | null;
  teamId?: string | null;
}

function normalizeDate(value: unknown) {
  if (!value) return "";
  if (typeof value === "number") return new Date(value * 1000).toISOString().slice(0, 10);
  const raw = String(value);
  if (/^\d+$/.test(raw)) return new Date(Number(raw) * 1000).toISOString().slice(0, 10);
  return raw.slice(0, 10);
}

function detailUrl(row: Record<string, unknown>) {
  if (row.slug) return `/sops/detail/?slug=${encodeURIComponent(String(row.slug))}`;
  return `/sops/detail/?id=${encodeURIComponent(String(row.id || ""))}`;
}

function normalizeDraft(row: Record<string, unknown>) {
  const id = String(row.id || "");
  return {
    id,
    title: row.title || "Untitled SOP Draft",
    category: row.category || "Uncategorized",
    status: row.status || "Draft",
    owner: row.owner || row.ownerSubRole || "Unassigned",
    ownerId: row.ownerId || "",
    ownerSubRoleId: row.ownerSubRoleId || "",
    ownerSubRole: row.ownerSubRole || "",
    ownerDepartment: row.ownerDepartment || "",
    reviewDate: normalizeDate(row.reviewDate || row.reviewDueAt),
    assignedReviewer: row.assignedReviewer || "Unassigned",
    updatedDate: normalizeDate(row.updatedAt || row.createdAt),
    detailUrl: detailUrl(row),
    editUrl: `/create/?edit=draft&id=${encodeURIComponent(id)}`,
  };
}

async function fallbackSubRole(db: D1DatabaseBinding) {
  return await db
    .prepare(
      `SELECT id, label, slug, department, team_id AS teamId
       FROM creator_sub_roles
       WHERE status = 'Active'
       ORDER BY sort_order ASC, label ASC
       LIMIT 1`,
    )
    .first<CreatorSubRole>();
}

async function usersForSubRole(db: D1DatabaseBinding, subRole: CreatorSubRole) {
  const result = await db
    .prepare(
      `SELECT DISTINCT
        users.id,
        users.name,
        users.email,
        users.access_level AS accessLevel,
        users.department,
        users.team_id AS teamId
       FROM users
       LEFT JOIN user_sub_roles ON user_sub_roles.user_id = users.id
       WHERE users.status = 'Active'
        AND COALESCE(users.is_active, 1) = 1
        AND users.access_level IN ('Creator / Reviewer', 'Admin')
        AND (
          user_sub_roles.sub_role_id = ?
          OR users.team_id = ?
          OR users.department = ?
        )
       ORDER BY users.name ASC`,
    )
    .bind(subRole.id, subRole.teamId || "", subRole.department)
    .all<DraftUser>();
  return result.results || [];
}

async function resolveDraftContext(db: D1DatabaseBinding, context: PagesFunctionContext) {
  const auth = await requirePermission(context, "Edit Drafts");
  if (auth.response || !auth.user) return { response: auth.response, user: auth.user, subRole: null };

  if (auth.user.role === "normal") {
    return {
      response: failure("FORBIDDEN", "My Drafts is available to Creator / Reviewer and Admin users.", 403),
      user: auth.user,
      subRole: null,
    };
  }

  const requested = await resolveRequestedCreatorSubRole(db, context.request);
  const subRole = requested || auth.user.selectedSubRole || (auth.user.role === "admin" ? await fallbackSubRole(db) : null);
  if (!subRole) {
    return {
      response: failure("SUB_ROLE_REQUIRED", "Select a Creator / Reviewer department before viewing drafts.", 400),
      user: auth.user,
      subRole: null,
    };
  }

  if (auth.user.role === "creator" && !auth.user.subRoles.some((item) => item.id === subRole.id)) {
    return {
      response: failure("FORBIDDEN", "Your account is not assigned to this Creator / Reviewer department.", 403),
      user: auth.user,
      subRole: null,
    };
  }

  return { response: null, user: auth.user, subRole };
}

async function queryDrafts(db: D1DatabaseBinding, subRole: CreatorSubRole, selectedUser: DraftUser | null) {
  const scopeClauses = ["sops.owner_sub_role_id = ?"];
  const scopeValues: unknown[] = [subRole.id];
  if (subRole.teamId) {
    scopeClauses.push("sops.owner_team_id = ?");
    scopeValues.push(subRole.teamId);
    scopeClauses.push(
      `EXISTS (
        SELECT 1 FROM sop_assignments team_assignments
        WHERE team_assignments.sop_id = sops.id
          AND team_assignments.status = 'Active'
          AND team_assignments.team_id = ?
      )`,
    );
    scopeValues.push(subRole.teamId);
  }

  const userClauses: string[] = [];
  const userValues: unknown[] = [];
  if (selectedUser?.id) {
    userClauses.push("COALESCE(sops.owner_id, sops.owner_user_id) = ?");
    userValues.push(selectedUser.id);
    userClauses.push("sops.created_by_user_id = ?");
    userValues.push(selectedUser.id);
    userClauses.push(
      `EXISTS (
        SELECT 1 FROM sop_assignments user_assignments
        WHERE user_assignments.sop_id = sops.id
          AND user_assignments.status = 'Active'
          AND user_assignments.user_id = ?
      )`,
    );
    userValues.push(selectedUser.id);
  }

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
        sops.created_at AS createdAt,
        categories.name AS category,
        owner.id AS ownerId,
        owner.name AS owner,
        sub_roles.id AS ownerSubRoleId,
        sub_roles.label AS ownerSubRole,
        sub_roles.department AS ownerDepartment,
        (
          SELECT reviewer.name
          FROM sop_assignments reviewer_assignment
          JOIN users reviewer ON reviewer.id = reviewer_assignment.user_id
          WHERE reviewer_assignment.sop_id = sops.id
            AND reviewer_assignment.assignment_type = 'Reviewer'
            AND reviewer_assignment.status = 'Active'
          ORDER BY reviewer_assignment.due_at ASC, reviewer.name ASC
          LIMIT 1
        ) AS assignedReviewer
       FROM sops
       LEFT JOIN categories ON categories.id = sops.category_id
       LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
       LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id
       WHERE COALESCE(sops.is_active, 1) = 1
        AND sops.status IN ('Draft', 'Needs Revision', 'In Review', 'Approved')
        AND (${scopeClauses.join(" OR ")})
        ${userClauses.length ? `AND (${userClauses.join(" OR ")})` : ""}
       GROUP BY sops.id
       ORDER BY sops.updated_at DESC, sops.title ASC
       LIMIT 150`,
    )
    .bind(...scopeValues, ...userValues)
    .all<Record<string, unknown>>();

  return (result.results || []).map(normalizeDraft);
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;

  const db = context.env.DB!;
  const resolved = await resolveDraftContext(db, context);
  if (resolved.response || !resolved.subRole || !resolved.user) return resolved.response;

  const users = await usersForSubRole(db, resolved.subRole);
  const url = new URL(context.request.url);
  const requestedUserId = optionalText(url.searchParams.get("userId"), 160);
  const selectedUser =
    users.find((user) => user.id === requestedUserId) ||
    users.find((user) => user.id === resolved.user?.id) ||
    users[0] ||
    null;
  const drafts = await queryDrafts(db, resolved.subRole, selectedUser);

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        context: {
          role: resolved.user.role,
          accessLevel: selectedUser?.accessLevel || resolved.user.accessLevel,
          selectedUser,
          selectedSubRole: resolved.subRole,
          canArchive: hasPermission(resolved.user, "Archive SOPs"),
        },
        viewOptions: { users, subRoles: [resolved.subRole] },
        counts: { drafts: drafts.length },
        drafts,
      },
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders("private"),
        vary: "x-sop-sub-role",
      },
    },
  );
};
