import { cacheHeaders, failure } from "../_shared/api";
import { requireDb } from "../_shared/admin";
import { getAuthUser } from "../_shared/auth";
import { type D1DatabaseBinding, type PagesFunctionContext } from "../_shared/cloudflare";
import { listSops, normalizeSop } from "../_shared/sop-data";

const NORMAL_USER_LIMIT = 5;

async function userProfile(db: D1DatabaseBinding, userId?: string) {
  if (!userId) return null;
  return db
    .prepare(
      `SELECT id, access_level AS accessLevel, department, team_id AS teamId
       FROM users
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(userId)
    .first<{ id: string; accessLevel?: string; department?: string; teamId?: string }>()
    .catch(() => null);
}

async function querySops(db: D1DatabaseBinding, whereSql: string, values: unknown[], limit = NORMAL_USER_LIMIT) {
  const result = await db
    .prepare(
      `SELECT
        sops.id,
        sops.title,
        sops.slug,
        COALESCE(sops.summary, sops.purpose) AS summary,
        sops.purpose,
        sops.status,
        sops.type,
        sops.estimated_completion_time AS estimatedCompletionTime,
        sops.estimated_minutes AS estimatedMinutes,
        sops.review_date AS reviewDate,
        sops.review_due_at AS reviewDueAt,
        sops.visibility,
        sops.source_type AS sourceType,
        sops.current_version_id AS currentVersionId,
        sops.published_at AS publishedAt,
        sops.updated_at AS updatedAt,
        sops.view_count AS viewCount,
        sops.helpful_count AS helpfulCount,
        sops.not_helpful_count AS notHelpfulCount,
        categories.id AS categoryId,
        categories.name AS category,
        categories.slug AS categorySlug,
        owner.id AS ownerId,
        owner.name AS owner,
        sops.owner_sub_role_id AS ownerSubRoleId,
        sub_roles.label AS ownerSubRole,
        sub_roles.department AS ownerDepartment,
        teams.name AS ownerTeam,
        versions.id AS versionId,
        COALESCE(versions.version_number, versions.version_label) AS versionNumber,
        versions.title AS versionTitle,
        versions.summary AS versionSummary,
        COALESCE(versions.content, versions.body_markdown) AS content,
        versions.body_markdown AS bodyMarkdown,
        versions.before_you_begin AS beforeYouBegin,
        versions.checklist,
        versions.troubleshooting,
        versions.change_summary AS changeSummary,
        versions.status AS versionStatus,
        versions.metadata_json AS metadataJson,
        GROUP_CONCAT(DISTINCT tags.name) AS tagsCsv
       FROM sops
       LEFT JOIN categories ON categories.id = sops.category_id
       LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
       LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id
       LEFT JOIN teams ON teams.id = sops.owner_team_id
       LEFT JOIN sop_versions versions ON versions.id = sops.current_version_id
       LEFT JOIN sop_tags ON sop_tags.sop_id = sops.id
       LEFT JOIN tags ON tags.id = sop_tags.tag_id
       ${whereSql}
       GROUP BY sops.id
       ORDER BY sops.updated_at DESC, sops.title ASC
       LIMIT ?`,
    )
    .bind(...values, limit)
    .all<Record<string, unknown>>();
  return (result.results || []).map(normalizeSop);
}

async function recentlyViewed(db: D1DatabaseBinding, userId?: string) {
  if (!userId) return [];
  return querySops(
    db,
    `JOIN (
       SELECT sop_id, MAX(created_at) AS viewed_at
       FROM sop_view_events
       WHERE user_id = ?
       GROUP BY sop_id
     ) recent_views ON recent_views.sop_id = sops.id
     WHERE sops.status = 'Published'
       AND COALESCE(sops.is_active, 1) = 1`,
    [userId],
  );
}

async function savedSops(db: D1DatabaseBinding, userId?: string) {
  if (!userId) return [];
  return querySops(
    db,
    `JOIN sop_favorites ON sop_favorites.sop_id = sops.id
     WHERE sop_favorites.user_id = ?
       AND sops.status = 'Published'
       AND COALESCE(sops.is_active, 1) = 1`,
    [userId],
  );
}

async function updatedForUser(db: D1DatabaseBinding, userId?: string, department?: string, teamId?: string) {
  if (!userId && !department && !teamId) return [];
  const signals: string[] = [];
  const values: unknown[] = [];

  if (userId) {
    signals.push("sops.id IN (SELECT sop_id FROM sop_favorites WHERE user_id = ?)");
    values.push(userId);
    signals.push("sops.id IN (SELECT sop_id FROM sop_view_events WHERE user_id = ?)");
    values.push(userId);
    signals.push("sops.id IN (SELECT sop_id FROM sop_assignments WHERE user_id = ? AND status = 'Active')");
    values.push(userId);
  }
  if (teamId) {
    signals.push("(sops.owner_team_id = ? OR sops.id IN (SELECT sop_id FROM sop_assignments WHERE team_id = ? AND status = 'Active'))");
    values.push(teamId, teamId);
  }
  if (department) {
    signals.push("(sub_roles.department = ? OR teams.name = ?)");
    values.push(department, department);
  }

  return querySops(
    db,
    `WHERE sops.status = 'Published'
       AND COALESCE(sops.is_active, 1) = 1
       AND (${signals.join(" OR ")})`,
    values,
  );
}

function importantUpdates(recent: Awaited<ReturnType<typeof listSops>>) {
  return recent.slice(0, 3).map((sop) => ({
    id: sop.id,
    title: sop.title,
    body: sop.summary || sop.purpose || "A published SOP was updated.",
    href: sop.slug ? `/sops/detail/?slug=${encodeURIComponent(String(sop.slug))}` : `/sops/detail/?id=${encodeURIComponent(String(sop.id))}`,
    updatedAt: sop.updatedAt || sop.publishedAt || "",
  }));
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;

  try {
    const user = await getAuthUser(context);
    const profile = await userProfile(context.env.DB!, user?.id);
    const [viewed, saved, updated, recentPublished] = await Promise.all([
      recentlyViewed(context.env.DB!, user?.id),
      savedSops(context.env.DB!, user?.id),
      updatedForUser(context.env.DB!, user?.id, profile?.department, profile?.teamId),
      listSops(context.env.DB!, { publicOnly: true, sort: "recent", limit: 3 }),
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: user
            ? {
                id: user.id,
                role: user.role,
                accessLevel: user.accessLevel,
                department: profile?.department || "",
                teamId: profile?.teamId || "",
                permissions: {
                  canCreateSop: user.role === "admin" || user.permissions.includes("Create SOPs"),
                },
              }
            : null,
          activity: {
            recentlyViewed: viewed,
            savedSops: saved,
            recentlyUpdatedForYou: updated,
          },
          importantUpdates: importantUpdates(recentPublished),
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          ...cacheHeaders(user ? "private" : "public"),
        },
      },
    );
  } catch (error) {
    return failure("HOME_DASHBOARD_FAILED", error instanceof Error ? error.message : "Unable to load the home dashboard.", 500);
  }
};
