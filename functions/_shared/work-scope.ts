import { failure } from "./api";
import { getAuthUser, type AuthUser } from "./auth";
import { type D1DatabaseBinding, type PagesFunctionContext } from "./cloudflare";
import { resolveRequestedCreatorSubRole, type CreatorSubRole } from "./ownership";

export interface WorkScopeUser {
  id: string;
  name: string;
  email: string;
  title?: string | null;
  department?: string | null;
  teamId?: string | null;
  accessLevel: string;
}

export interface ResolvedWorkScope {
  user: AuthUser;
  subRole: CreatorSubRole;
  users: WorkScopeUser[];
  scope: "mine" | "team" | "user";
  selectedUser: WorkScopeUser | null;
  label: string;
  description: string;
  response: null;
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

export async function usersForCreatorSubRole(db: D1DatabaseBinding, subRole: CreatorSubRole) {
  const result = await db
    .prepare(
      `SELECT DISTINCT
        users.id,
        users.name,
        users.email,
        users.title,
        users.department,
        users.team_id AS teamId,
        users.access_level AS accessLevel
       FROM users
       LEFT JOIN user_sub_roles ON user_sub_roles.user_id = users.id
        AND (user_sub_roles.expires_at IS NULL OR user_sub_roles.expires_at > CURRENT_TIMESTAMP)
       WHERE users.status = 'Active'
        AND COALESCE(users.is_active, 1) = 1
        AND users.access_level IN ('Creator / Reviewer', 'Admin')
        AND (
          user_sub_roles.sub_role_id = ?
          OR users.department = ?
          OR users.team_id = ?
        )
       ORDER BY users.name ASC`,
    )
    .bind(subRole.id, subRole.department, subRole.teamId || "")
    .all<WorkScopeUser>();

  return result.results || [];
}

export function subRoleSopScopeClause(alias: string, subRole: CreatorSubRole) {
  const clauses = [`${alias}.owner_sub_role_id = ?`];
  const values: unknown[] = [subRole.id];
  if (subRole.teamId) {
    clauses.push(`${alias}.owner_team_id = ?`);
    values.push(subRole.teamId);
  }
  return { sql: `(${clauses.join(" OR ")})`, values };
}

export function subRoleRequestScopeClause(alias: string, subRole: CreatorSubRole) {
  const clauses = [`${alias}.owner_sub_role_id = ?`, `${alias}.assigned_department = ?`];
  const values: unknown[] = [subRole.id, subRole.department];
  if (subRole.teamId) {
    clauses.push(`${alias}.assigned_team_id = ?`);
    values.push(subRole.teamId);
  }
  return { sql: `(${clauses.join(" OR ")})`, values };
}

function requestedScope(url: URL) {
  const scope = String(url.searchParams.get("scope") || "").trim();
  if (scope === "mine" || scope === "team") return scope;
  return "";
}

export async function resolveCreatorWorkScope(db: D1DatabaseBinding, context: PagesFunctionContext) {
  const user = await getAuthUser(context);
  if (!user) {
    return {
      response: failure("UNAUTHENTICATED", "Sign in before using this API.", 401),
      user: null,
      subRole: null,
    };
  }

  if (user.role === "normal") {
    return {
      response: failure("FORBIDDEN", "This work area is available to Creator / Reviewer and Admin users.", 403),
      user,
      subRole: null,
    };
  }

  const requested = await resolveRequestedCreatorSubRole(db, context.request);
  const subRole = requested || user.selectedSubRole || (user.role === "admin" ? await fallbackSubRole(db) : null);
  if (!subRole) {
    return {
      response: failure("SUB_ROLE_REQUIRED", "Select a Creator / Reviewer department before viewing this work.", 400),
      user,
      subRole: null,
    };
  }

  if (user.role === "creator" && !user.subRoles.some((item) => item.id === subRole.id)) {
    return {
      response: failure("FORBIDDEN", "Your account is not assigned to this Creator / Reviewer department.", 403),
      user,
      subRole: null,
    };
  }

  const users = await usersForCreatorSubRole(db, subRole);
  const url = new URL(context.request.url);
  const userId = String(url.searchParams.get("userId") || "").trim();
  const self = users.find((item) => item.id === user.id) || null;
  const requestedUser = users.find((item) => item.id === userId) || null;
  const scope = requestedScope(url) || (userId ? "user" : "team");

  if (scope === "mine") {
    const selectedUser = self || {
      id: user.id,
      name: user.name,
      email: user.email,
      accessLevel: user.accessLevel,
      department: subRole.department,
      teamId: subRole.teamId,
    };
    return {
      response: null,
      user,
      subRole,
      users,
      scope,
      selectedUser,
      label: `My Work - ${subRole.department}`,
      description: `Personal work assigned to or owned by ${selectedUser.name} in ${subRole.department}.`,
    } satisfies ResolvedWorkScope;
  }

  if (scope === "user") {
    if (user.role !== "admin" && requestedUser?.id !== user.id) {
      return {
        response: failure("FORBIDDEN", "You cannot view another user's personal work for this department.", 403),
        user,
        subRole,
      };
    }
    if (!requestedUser) {
      return {
        response: failure("NOT_FOUND", "The selected user is not available for this Creator / Reviewer department.", 404),
        user,
        subRole,
      };
    }
    return {
      response: null,
      user,
      subRole,
      users,
      scope,
      selectedUser: requestedUser,
      label: `${requestedUser.name} - ${subRole.department}`,
      description: `Personal work assigned to or owned by ${requestedUser.name} in ${subRole.department}.`,
    } satisfies ResolvedWorkScope;
  }

  return {
    response: null,
    user,
    subRole,
    users,
    scope: "team",
    selectedUser: null,
    label: `Team Queue - ${subRole.department}`,
    description: `Team work assigned to the active ${subRole.label} role and ${subRole.department} department.`,
  } satisfies ResolvedWorkScope;
}
