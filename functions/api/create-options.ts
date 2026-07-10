import { failure, success } from "../_shared/api";
import { requireDb } from "../_shared/admin";
import { getAuthUser, requirePermission } from "../_shared/auth";
import { type PagesFunctionContext } from "../_shared/cloudflare";
import { resolveRequestedCreatorSubRole } from "../_shared/ownership";

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Create SOPs");
  if (auth.response) return auth.response;

  const db = context.env.DB!;
  const user = await getAuthUser(context);
  const selectedSubRole = await resolveRequestedCreatorSubRole(db, context.request);
  const selectedTeamId = selectedSubRole?.teamId || user?.selectedSubRole?.teamId || "";

  const [categories, users, tags] = await Promise.all([
    db
      .prepare(
        `SELECT id, name, slug, description
         FROM categories
         WHERE COALESCE(is_active, 1) = 1
         ORDER BY sort_order ASC, name ASC`,
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT DISTINCT
          users.id,
          users.name,
          users.email,
          users.department,
          users.title,
          users.team_id AS teamId,
          users.access_level AS accessLevel
         FROM users
         LEFT JOIN user_sub_roles ON user_sub_roles.user_id = users.id
         WHERE users.status = 'Active'
          AND COALESCE(users.is_active, 1) = 1
          AND users.access_level IN ('Creator / Reviewer', 'Admin')
          AND (? = '' OR users.team_id = ? OR user_sub_roles.sub_role_id = ?)
         ORDER BY users.name ASC`,
      )
      .bind(selectedTeamId, selectedTeamId, selectedSubRole?.id || user?.selectedSubRole?.id || "")
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT id, name, slug
         FROM tags
         WHERE COALESCE(is_active, 1) = 1
         ORDER BY name ASC
         LIMIT 250`,
      )
      .all<Record<string, unknown>>()
      .catch(() => ({ results: [] })),
  ]);

  if (user?.role === "normal") {
    return failure("FORBIDDEN", "Normal users cannot create SOPs.", 403);
  }

  return success({
    currentUser: user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          accessLevel: user.accessLevel,
          role: user.role,
          permissions: user.permissions,
          selectedSubRole: selectedSubRole || user.selectedSubRole,
        }
      : null,
    categories: categories.results || [],
    users: users.results || [],
    reviewers: users.results || [],
    tags: tags.results || [],
  });
};
