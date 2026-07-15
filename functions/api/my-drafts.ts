import { cacheHeaders } from "../_shared/api";
import { requireDb } from "../_shared/admin";
import { hasPermission, requirePermission } from "../_shared/auth";
import { type D1DatabaseBinding, type PagesFunctionContext } from "../_shared/cloudflare";
import { resolveCreatorWorkScope, subRoleSopScopeClause, type ResolvedWorkScope } from "../_shared/work-scope";

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

function normalizeDraft(row: Record<string, unknown>, permissions: Set<string>) {
  const id = String(row.id || "");
  const status = String(row.status || "Draft");
  const hasLoadableContent = Boolean(id && row.currentVersionId && row.title && row.purpose);
  const canEdit = permissions.has("Edit Drafts") && ["Draft", "Needs Revision"].includes(status);
  const canSubmitForReview = permissions.has("Edit Drafts") && ["Draft", "Needs Revision"].includes(status);
  const canReview = permissions.has("Review SOPs") && status === "In Review";
  const canApprove = permissions.has("Approve SOPs") && status === "In Review";
  const canRequestChanges = permissions.has("Request Changes") && status === "In Review";
  const canPublish = permissions.has("Publish SOPs") && status === "Approved";
  const canArchive = permissions.has("Archive SOPs") && ["Draft", "Needs Revision", "In Review", "Approved"].includes(status);
  return {
    id,
    sopId: id,
    title: row.title || "Untitled SOP Draft",
    category: row.category || "Uncategorized",
    status,
    owner: row.owner || row.ownerSubRole || "Unassigned",
    ownerId: row.ownerId || "",
    ownerSubRoleId: row.ownerSubRoleId || "",
    ownerSubRole: row.ownerSubRole || "",
    ownerDepartment: row.ownerDepartment || "",
    reviewDate: normalizeDate(row.reviewDate || row.reviewDueAt),
    assignedReviewer: row.assignedReviewer || "Unassigned",
    updatedDate: normalizeDate(row.updatedAt || row.createdAt),
    detailUrl: detailUrl(row),
    previewUrl: `/drafts/preview/?id=${encodeURIComponent(id)}&origin=my-drafts`,
    editUrl: `/create/?edit=draft&id=${encodeURIComponent(id)}&origin=my-drafts&returnTo=${encodeURIComponent("/drafts/")}`,
    reviewUrl: `/review-queue/?review=${encodeURIComponent(`sop:${id}`)}&origin=my-drafts-review`,
    capabilities: {
      canEdit,
      canPreview: hasLoadableContent,
      canSubmitForReview,
      canReview,
      canApprove,
      canRequestChanges,
      canPublish,
      canArchive,
    },
  };
}

async function resolveDraftContext(db: D1DatabaseBinding, context: PagesFunctionContext) {
  const auth = await requirePermission(context, "Edit Drafts");
  if (auth.response || !auth.user) return { response: auth.response, user: auth.user, subRole: null };
  return resolveCreatorWorkScope(db, context);
}

async function queryDrafts(db: D1DatabaseBinding, workScope: ResolvedWorkScope, permissions: Set<string>) {
  const scope = subRoleSopScopeClause("sops", workScope.subRole);
  const clauses: string[] = [];
  const values: unknown[] = [...scope.values];
  if (workScope.scope === "team" && workScope.subRole.teamId) {
    clauses.push(
      `EXISTS (
        SELECT 1 FROM sop_assignments team_assignments
        WHERE team_assignments.sop_id = sops.id
          AND team_assignments.status = 'Active'
          AND team_assignments.team_id = ?
      )`,
    );
    values.push(workScope.subRole.teamId);
  }
  if (workScope.selectedUser?.id) {
    clauses.push("COALESCE(sops.owner_id, sops.owner_user_id) = ?");
    values.push(workScope.selectedUser.id);
    clauses.push("sops.created_by_user_id = ?");
    values.push(workScope.selectedUser.id);
    clauses.push(
      `EXISTS (
        SELECT 1 FROM sop_assignments user_assignments
        WHERE user_assignments.sop_id = sops.id
          AND user_assignments.status = 'Active'
          AND user_assignments.user_id = ?
      )`,
    );
    values.push(workScope.selectedUser.id);
  }
  const scopeFilter = clauses.length
    ? `(${scope.sql}) AND (${clauses.join(" OR ")})`
    : scope.sql;

  const result = await db
    .prepare(
      `SELECT
        sops.id,
        sops.title,
        sops.slug,
        sops.status,
        sops.purpose,
        sops.current_version_id AS currentVersionId,
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
        AND sops.id IS NOT NULL
        AND sops.current_version_id IS NOT NULL
        AND NULLIF(TRIM(sops.title), '') IS NOT NULL
        AND NULLIF(TRIM(sops.purpose), '') IS NOT NULL
        AND (sops.owner_sub_role_id IS NOT NULL OR sops.owner_team_id IS NOT NULL OR COALESCE(sops.owner_id, sops.owner_user_id) IS NOT NULL)
        AND ${scopeFilter}
       GROUP BY sops.id
       ORDER BY sops.updated_at DESC, sops.title ASC
       LIMIT 150`,
    )
    .bind(...values)
    .all<Record<string, unknown>>();

  return (result.results || [])
    .map((row) => normalizeDraft(row, permissions))
    .filter((draft) => Object.values(draft.capabilities).some(Boolean));
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;

  const db = context.env.DB!;
  const resolved = await resolveDraftContext(db, context);
  if (resolved.response || !resolved.subRole || !resolved.user) return resolved.response;

  const permissions = new Set(resolved.user.permissions || []);
  const drafts = await queryDrafts(db, resolved, permissions);

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        context: {
          role: resolved.user.role,
          accessLevel: resolved.selectedUser?.accessLevel || resolved.user.accessLevel,
          selectedUser: resolved.selectedUser,
          selectedSubRole: resolved.subRole,
          workScope: resolved.scope,
          workScopeLabel: resolved.label,
          workScopeDescription: resolved.description,
          canArchive: hasPermission(resolved.user, "Archive SOPs"),
          canPublish: hasPermission(resolved.user, "Publish SOPs"),
          canApprove: hasPermission(resolved.user, "Approve SOPs"),
          canReview: hasPermission(resolved.user, "Review SOPs"),
        },
        viewOptions: {
          users: resolved.users,
          subRoles: [resolved.subRole],
          scopes: [
            {
              id: "team",
              label: `Team Queue - ${resolved.subRole.department}`,
              description: `Team drafts assigned to ${resolved.subRole.label}.`,
            },
            {
              id: "mine",
              label: "My personal drafts",
              description: "Drafts directly assigned to or owned by me.",
            },
          ],
        },
        counts: {
          drafts: drafts.length,
          editableDrafts: drafts.filter((draft) => draft.capabilities.canEdit).length,
          previewableDrafts: drafts.filter((draft) => draft.capabilities.canPreview).length,
          readyToPublish: drafts.filter((draft) => draft.capabilities.canPublish).length,
        },
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
