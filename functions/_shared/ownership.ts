import { failure } from "./api";
import { type AuthUser } from "./auth";
import { type D1DatabaseBinding, type PagesFunctionContext } from "./cloudflare";

export interface CreatorSubRole {
  id: string;
  label: string;
  slug: string;
  department: string;
  teamId?: string | null;
}

interface SopOwnershipRow {
  id: string;
  ownerSubRoleId?: string | null;
  ownerTeamId?: string | null;
  ownerUserId?: string | null;
}

export function selectedSubRoleFromRequest(request: Request) {
  const url = new URL(request.url);
  return (
    request.headers.get("x-sop-sub-role") ||
    request.headers.get("x-sop-selected-sub-role") ||
    url.searchParams.get("subRole") ||
    ""
  ).trim();
}

export async function listCreatorSubRoles(db: D1DatabaseBinding) {
  try {
    const result = await db
      .prepare(
        `SELECT
          id,
          label,
          slug,
          department,
          team_id AS teamId
         FROM creator_sub_roles
         WHERE status = 'Active'
         ORDER BY sort_order ASC, label ASC`,
      )
      .all<CreatorSubRole>();
    return result.results || [];
  } catch {
    return [];
  }
}

export async function resolveRequestedCreatorSubRole(db: D1DatabaseBinding, request: Request) {
  const requested = selectedSubRoleFromRequest(request);
  if (!requested) return null;

  const subRoles = await listCreatorSubRoles(db);
  return subRoles.find((subRole) => subRole.id === requested || subRole.slug === requested) || null;
}

export async function listUserSubRoles(db: D1DatabaseBinding, userId: string) {
  if (!userId) return [];

  try {
    const result = await db
      .prepare(
        `SELECT
          sub_roles.id,
          sub_roles.label,
          sub_roles.slug,
          sub_roles.department,
          sub_roles.team_id AS teamId
         FROM user_sub_roles
         JOIN creator_sub_roles sub_roles ON sub_roles.id = user_sub_roles.sub_role_id
         WHERE user_sub_roles.user_id = ?
           AND sub_roles.status = 'Active'
           AND (user_sub_roles.expires_at IS NULL OR user_sub_roles.expires_at > CURRENT_TIMESTAMP)
         ORDER BY sub_roles.sort_order ASC, sub_roles.label ASC`,
      )
      .bind(userId)
      .all<CreatorSubRole>();
    return result.results || [];
  } catch {
    return [];
  }
}

export function resolveSelectedSubRole(user: AuthUser, request: Request) {
  const requested = selectedSubRoleFromRequest(request);
  if (!requested && user.subRoles.length === 1) return user.subRoles[0] || null;
  if (!requested) return null;
  return (
    user.subRoles.find((subRole) => subRole.id === requested || subRole.slug === requested) || null
  );
}

async function getSopOwnership(db: D1DatabaseBinding, sopId: string) {
  return await db
    .prepare(
      `SELECT
        id,
        owner_sub_role_id AS ownerSubRoleId,
        owner_team_id AS ownerTeamId,
        COALESCE(owner_id, owner_user_id) AS ownerUserId
       FROM sops
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(sopId)
    .first<SopOwnershipRow>();
}

export async function requireCreatorSubRoleSelection(context: PagesFunctionContext, user: AuthUser) {
  if (user.role === "admin") return { subRole: null, response: null };
  if (user.role !== "creator") {
    return {
      subRole: null,
      response: failure("FORBIDDEN", "Normal users can view SOPs, but cannot change SOP ownership or workflow.", 403),
    };
  }

  const selected = resolveSelectedSubRole(user, context.request);
  if (!selected) {
    const message = user.subRoles.length
      ? "Select your Creator / Reviewer department before changing SOPs."
      : "Your Creator / Reviewer account is not assigned to a department sub-role.";
    return {
      subRole: null,
      response: failure("SUB_ROLE_REQUIRED", message, 403),
    };
  }

  return { subRole: selected, response: null };
}

export async function requireSopOwnership(context: PagesFunctionContext, user: AuthUser, sopId: string) {
  if (user.role === "admin") return { response: null, ownership: null, subRole: null };
  const selected = await requireCreatorSubRoleSelection(context, user);
  if (selected.response || !selected.subRole) {
    return { response: selected.response, ownership: null, subRole: selected.subRole };
  }

  const ownership = await getSopOwnership(context.env.DB!, sopId);
  if (!ownership) {
    return {
      response: failure("NOT_FOUND", "SOP not found.", 404),
      ownership: null,
      subRole: selected.subRole,
    };
  }

  const subRoleOwnsSop = ownership.ownerSubRoleId
    ? ownership.ownerSubRoleId === selected.subRole.id
    : Boolean(selected.subRole.teamId && ownership.ownerTeamId === selected.subRole.teamId);

  if (!subRoleOwnsSop) {
    return {
      response: failure(
        "SOP_OWNERSHIP_REQUIRED",
        "This SOP belongs to another department. You can view it, but only its owning department can edit, save, update, archive, approve, or publish it.",
        403,
      ),
      ownership,
      subRole: selected.subRole,
    };
  }

  return { response: null, ownership, subRole: selected.subRole };
}
