import { failure, optionalText, readBody, success, unixNow } from "../_shared/api";
import { requireDb } from "../_shared/admin";
import { getAuthUser, hasPermission } from "../_shared/auth";
import { newId, type D1DatabaseBinding, type PagesFunctionContext } from "../_shared/cloudflare";
import { resolveCreatorWorkScope, subRoleSopScopeClause } from "../_shared/work-scope";

const archiveReasons = [
  "Process retired",
  "Replaced by another SOP",
  "Duplicate SOP",
  "Tool or system discontinued",
  "Department no longer owns the process",
  "Temporarily inactive",
  "Outdated content",
  "Other",
];

const previousStatuses = ["Draft", "In Review", "Approved", "Needs Revision", "Published"];
const retentionDays = 365;

interface ArchivedSopPayload {
  action?: "restore" | "delete";
  id?: string;
  restoreStatus?: "Draft" | "Published";
  ownerId?: string;
  reviewerId?: string;
  department?: string;
  note?: string;
  confirmationStep?: number;
  confirmationPhrase?: string;
}

function like(value: string) {
  return `%${value}%`;
}

function isoNow() {
  return new Date().toISOString();
}

function addArchivedFilters(url: URL) {
  const where = ["sops.status = 'Archived'"];
  const values: unknown[] = [];
  const search = optionalText(url.searchParams.get("q") || url.searchParams.get("search"), 180);
  const exactFilters: Array<[string, string]> = [
    ["department", "COALESCE(sub_roles.department, owner.department) = ?"],
    ["category", "categories.id = ?"],
    ["owner", "owner.id = ?"],
    ["archivedBy", "archived_by.id = ?"],
    ["reason", "sops.archive_reason = ?"],
    ["previousStatus", "sops.previous_status = ?"],
  ];

  if (search) {
    where.push(
      `(sops.title LIKE ?
        OR sops.summary LIKE ?
        OR sops.purpose LIKE ?
        OR categories.name LIKE ?
        OR owner.name LIKE ?
        OR archived_by.name LIKE ?
        OR sops.archive_reason LIKE ?
        OR sops.archive_notes LIKE ?
        OR versions.metadata_json LIKE ?
        OR EXISTS (
          SELECT 1 FROM sop_tags search_st
          JOIN tags search_tags ON search_tags.id = search_st.tag_id
          WHERE search_st.sop_id = sops.id
            AND (search_tags.name LIKE ? OR search_tags.slug LIKE ?)
        ))`,
    );
    values.push(...Array(11).fill(like(search)));
  }

  for (const [param, sql] of exactFilters) {
    const value = optionalText(url.searchParams.get(param), 180);
    if (!value) continue;
    where.push(sql);
    values.push(value);
  }

  const dateFrom = optionalText(url.searchParams.get("archivedFrom"), 40);
  const dateTo = optionalText(url.searchParams.get("archivedTo"), 40);
  if (dateFrom) {
    where.push("date(sops.archived_at) >= date(?)");
    values.push(dateFrom);
  }
  if (dateTo) {
    where.push("date(sops.archived_at) <= date(?)");
    values.push(dateTo);
  }

  return { where, values };
}

function archivedSelect() {
  return `SELECT
    sops.id,
    sops.title,
    sops.slug,
    COALESCE(sops.summary, sops.purpose) AS summary,
    sops.status,
    sops.previous_status AS previousStatus,
    sops.archived_at AS archivedAt,
    sops.archive_reason AS archiveReason,
    sops.archive_notes AS archiveNotes,
    sops.published_at AS publishedAt,
    sops.previous_published_at AS previousPublishedAt,
    sops.updated_at AS updatedAt,
    sops.owner_sub_role_id AS ownerSubRoleId,
    sops.owner_team_id AS ownerTeamId,
    categories.id AS categoryId,
    categories.name AS category,
    COALESCE(sub_roles.department, owner.department) AS department,
    owner.id AS ownerId,
    owner.name AS owner,
    previous_owner.name AS previousOwner,
    archived_by.id AS archivedById,
    archived_by.name AS archivedBy,
    replacement.id AS replacementSopId,
    replacement.title AS replacementSopTitle,
    (
      SELECT reviewer.user_id
      FROM sop_assignments reviewer
      WHERE reviewer.sop_id = sops.id
        AND reviewer.assignment_type = 'Reviewer'
        AND reviewer.status = 'Active'
      ORDER BY reviewer.due_at ASC, reviewer.user_id ASC
      LIMIT 1
    ) AS reviewerId,
    (
      SELECT reviewer_user.name
      FROM sop_assignments reviewer
      JOIN users reviewer_user ON reviewer_user.id = reviewer.user_id
      WHERE reviewer.sop_id = sops.id
        AND reviewer.assignment_type = 'Reviewer'
        AND reviewer.status = 'Active'
      ORDER BY reviewer.due_at ASC, reviewer.user_id ASC
      LIMIT 1
    ) AS reviewer,
    GROUP_CONCAT(DISTINCT tags.name) AS tagsCsv
  FROM sops
  LEFT JOIN categories ON categories.id = sops.category_id
  LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
  LEFT JOIN users previous_owner ON previous_owner.id = sops.previous_owner_user_id
  LEFT JOIN users archived_by ON archived_by.id = sops.archived_by_user_id
  LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id
  LEFT JOIN sops replacement ON replacement.id = sops.replacement_sop_id
  LEFT JOIN sop_versions versions ON versions.id = sops.current_version_id
  LEFT JOIN sop_tags ON sop_tags.sop_id = sops.id
  LEFT JOIN tags ON tags.id = sop_tags.tag_id`;
}

function splitCsv(value: unknown) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeArchived(row: Record<string, unknown>, isAdmin: boolean) {
  const archivedAt = String(row.archivedAt || "");
  const retentionAt = archivedAt ? new Date(new Date(archivedAt).getTime() + retentionDays * 86400000) : null;
  const eligibleForDeletion = Boolean(isAdmin && retentionAt && retentionAt.getTime() <= Date.now());
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    categoryId: row.categoryId,
    category: row.category || "Uncategorized",
    department: row.department || "Unassigned",
    ownerId: row.ownerId,
    owner: row.owner || "Unassigned",
    reviewerId: row.reviewerId,
    reviewer: row.reviewer || "Unassigned",
    archivedAt,
    archivedById: row.archivedById,
    archivedBy: row.archivedBy || "Unknown",
    archiveReason: row.archiveReason || "Not recorded",
    archiveNotes: row.archiveNotes || "",
    previousOwner: row.previousOwner || row.owner || "Unassigned",
    previousReviewer: row.reviewer || "Unassigned",
    previousStatus: row.previousStatus || "Unknown",
    previousPublishedAt: row.previousPublishedAt || row.publishedAt || "",
    updatedAt: row.updatedAt,
    replacementSopId: row.replacementSopId,
    replacementSopTitle: row.replacementSopTitle,
    tags: splitCsv(row.tagsCsv),
    retentionEligibleAt: retentionAt?.toISOString() || "",
    eligibleForDeletion,
    actions: {
      preview: true,
      restore: true,
      details: true,
      history: true,
      duplicate: true,
      export: true,
      permanentDelete: eligibleForDeletion,
    },
  };
}

async function scopedWhere(db: D1DatabaseBinding, context: PagesFunctionContext, url: URL) {
  const user = await getAuthUser(context);
  if (!user) return { response: failure("UNAUTHENTICATED", "Sign in before viewing archived SOPs.", 401) };
  if (user.role === "normal") return { response: failure("FORBIDDEN", "Archived SOPs are available to Creator / Reviewer and Admin users.", 403) };

  if (user.role === "admin") {
    return {
      response: null,
      user,
      where: [] as string[],
      values: [] as unknown[],
      scopeLabel: "Admin Archive - All departments",
      scopeDescription: "All archived SOPs across the organization.",
      subRole: null,
      users: [] as Array<Record<string, unknown>>,
    };
  }

  const resolved = await resolveCreatorWorkScope(db, context);
  if (resolved.response || !resolved.user || !resolved.subRole) return { response: resolved.response };

  const scope = subRoleSopScopeClause("sops", resolved.subRole);
  const accessSql = `(${scope.sql} OR sops.created_by_user_id = ? OR COALESCE(sops.owner_id, sops.owner_user_id) = ? OR EXISTS (
    SELECT 1 FROM sop_assignments scoped_assignment
    WHERE scoped_assignment.sop_id = sops.id
      AND scoped_assignment.status = 'Active'
      AND (
        scoped_assignment.user_id = ?
        OR scoped_assignment.team_id = ?
      )
  ))`;

  return {
    response: null,
    user: resolved.user,
    where: [accessSql],
    values: [...scope.values, resolved.user.id, resolved.user.id, resolved.user.id, resolved.subRole.teamId || ""],
    scopeLabel: `${resolved.subRole.label} Archive - ${resolved.subRole.department}`,
    scopeDescription: "Archived SOPs inside your authorized Creator / Reviewer department and assignment scope.",
    subRole: resolved.subRole,
    users: resolved.users,
  };
}

async function listArchived(context: PagesFunctionContext) {
  const db = context.env.DB!;
  const url = new URL(context.request.url);
  const scoped = await scopedWhere(db, context, url);
  if (scoped.response || !scoped.user) return scoped.response;

  const filters = addArchivedFilters(url);
  const where = [...filters.where, ...(scoped.where || [])];
  const values = [...filters.values, ...(scoped.values || [])];
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 100), 200));
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  const isAdmin = scoped.user.role === "admin";

  const rows = await db
    .prepare(
      `${archivedSelect()}
       WHERE ${where.join(" AND ")}
       GROUP BY sops.id
       ORDER BY datetime(sops.archived_at) DESC, sops.title ASC
       LIMIT ? OFFSET ?`,
    )
    .bind(...values, limit, offset)
    .all<Record<string, unknown>>();
  const sops = (rows.results || []).map((row) => normalizeArchived(row, isAdmin));

  const countRow = await db
    .prepare(
      `SELECT
        COUNT(DISTINCT sops.id) AS total,
        SUM(CASE WHEN date(sops.archived_at) >= date('now', 'start of month') THEN 1 ELSE 0 END) AS thisMonth,
        SUM(CASE WHEN sops.archived_by_user_id = ? THEN 1 ELSE 0 END) AS archivedByMe,
        SUM(CASE WHEN sops.archived_at IS NOT NULL AND date(sops.archived_at) <= date('now', ?) THEN 1 ELSE 0 END) AS eligibleForDeletion
       ${archivedSelect().replace(/^SELECT[\s\S]+?FROM sops/, "FROM sops")}
       WHERE ${where.join(" AND ")}`,
    )
    .bind(scoped.user.id, `-${retentionDays} days`, ...values)
    .first<{ total: number; thisMonth: number; archivedByMe: number; eligibleForDeletion: number }>();

  const facetRows = await db
    .prepare(
      `SELECT DISTINCT
        COALESCE(sub_roles.department, owner.department) AS department,
        categories.id AS categoryId,
        categories.name AS category,
        owner.id AS ownerId,
        owner.name AS owner,
        archived_by.id AS archivedById,
        archived_by.name AS archivedBy,
        sops.archive_reason AS reason,
        sops.previous_status AS previousStatus
       FROM sops
       LEFT JOIN categories ON categories.id = sops.category_id
       LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
       LEFT JOIN users archived_by ON archived_by.id = sops.archived_by_user_id
       LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id
       WHERE ${["sops.status = 'Archived'", ...(scoped.where || [])].join(" AND ")}
       ORDER BY department ASC, category ASC, owner ASC`,
    )
    .bind(...(scoped.values || []))
    .all<Record<string, unknown>>();

  const facets = {
    departments: Array.from(new Set((facetRows.results || []).map((row) => String(row.department || "")).filter(Boolean))).sort(),
    categories: Array.from(new Map((facetRows.results || []).filter((row) => row.categoryId).map((row) => [String(row.categoryId), { id: row.categoryId, label: row.category }])).values()),
    owners: Array.from(new Map((facetRows.results || []).filter((row) => row.ownerId).map((row) => [String(row.ownerId), { id: row.ownerId, label: row.owner }])).values()),
    archivedBy: Array.from(new Map((facetRows.results || []).filter((row) => row.archivedById).map((row) => [String(row.archivedById), { id: row.archivedById, label: row.archivedBy }])).values()),
    reasons: archiveReasons,
    previousStatuses,
  };

  return success({
    sops,
    total: Number(countRow?.total || 0),
    counts: {
      totalArchived: Number(countRow?.total || 0),
      archivedThisMonth: Number(countRow?.thisMonth || 0),
      archivedByMe: Number(countRow?.archivedByMe || 0),
      eligibleForDeletion: isAdmin ? Number(countRow?.eligibleForDeletion || 0) : 0,
    },
    context: {
      role: scoped.user.role,
      canPermanentlyDelete: isAdmin,
      scopeLabel: scoped.scopeLabel,
      scopeDescription: scoped.scopeDescription,
      retentionDays,
    },
    facets,
    limit,
    offset,
  });
}

async function archivedSopInScope(context: PagesFunctionContext, sopId: string) {
  const url = new URL(context.request.url);
  const scoped = await scopedWhere(context.env.DB!, context, url);
  if (scoped.response || !scoped.user) return { response: scoped.response };
  const where = ["sops.id = ?", "sops.status = 'Archived'", ...(scoped.where || [])];
  const row = await context.env.DB!
    .prepare(`${archivedSelect()} WHERE ${where.join(" AND ")} GROUP BY sops.id LIMIT 1`)
    .bind(sopId, ...(scoped.values || []))
    .first<Record<string, unknown>>();
  if (!row) {
    await context.env.DB!
      .prepare(
        `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details, created_at)
         VALUES (?, ?, 'archive_access_denied', 'sop', ?, ?, ?)`,
      )
      .bind(newId("audit"), scoped.user.id, sopId, JSON.stringify({ route: "/api/archived-sops" }), unixNow())
      .run();
    return { response: failure("FORBIDDEN", "You do not have permission to access this archived SOP.", 403) };
  }
  return { response: null, user: scoped.user, sop: normalizeArchived(row, scoped.user.role === "admin") };
}

async function restoreArchived(context: PagesFunctionContext, payload: ArchivedSopPayload) {
  const id = optionalText(payload.id, 160);
  if (!id) return failure("VALIDATION_ERROR", "Archived SOP id is required.", 400, { id: "Required" });
  const scoped = await archivedSopInScope(context, id);
  if (scoped.response || !scoped.user || !scoped.sop) return scoped.response;
  if (!hasPermission(scoped.user, "Archive SOPs")) return failure("FORBIDDEN", "You do not have permission to restore archived SOPs.", 403);

  const restoreStatus = payload.restoreStatus === "Published" ? "Published" : "Draft";
  const now = isoNow();
  await context.env.DB!
    .prepare(
      `UPDATE sops
       SET status = ?,
           is_active = CASE WHEN ? = 'Published' THEN 1 ELSE 0 END,
           archived_at = NULL,
           restored_at = ?,
           restored_by_user_id = ?,
           owner_id = COALESCE(?, owner_id),
           owner_user_id = COALESCE(?, owner_user_id),
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(restoreStatus, restoreStatus, now, scoped.user.id, payload.ownerId || null, payload.ownerId || null, now, id)
    .run();

  if (payload.reviewerId) {
    await context.env.DB!
      .prepare(
        `INSERT INTO sop_assignments (
          id, sop_id, user_id, assignment_type, status, assigned_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, 'Reviewer', 'Active', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .bind(newId("assignment"), id, payload.reviewerId, scoped.user.id)
      .run();
  }

  await context.env.DB!
    .prepare(
      `INSERT INTO sop_archive_events (
        id, sop_id, actor_user_id, event_type, restore_status, owner_user_id, reviewer_user_id,
        department, details_json, created_at
      ) VALUES (?, ?, ?, 'Restored', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId("archive-event"),
      id,
      scoped.user.id,
      restoreStatus,
      payload.ownerId || scoped.sop.ownerId || null,
      payload.reviewerId || scoped.sop.reviewerId || null,
      payload.department || scoped.sop.department || null,
      JSON.stringify({ note: payload.note || "", previousStatus: scoped.sop.previousStatus }),
      now,
    )
    .run();

  await context.env.DB!
    .prepare(
      `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details, created_at)
       VALUES (?, ?, 'restore_archived_sop', 'sop', ?, ?, ?)`,
    )
    .bind(newId("audit"), scoped.user.id, id, JSON.stringify({ restoreStatus, note: payload.note || "" }), unixNow())
    .run();

  return success({ id, restoreStatus, editUrl: restoreStatus === "Draft" ? `/create/?edit=draft&id=${encodeURIComponent(id)}&origin=archived-sops` : "" }, "Archived SOP restored.");
}

async function deleteArchived(context: PagesFunctionContext, payload: ArchivedSopPayload) {
  const user = await getAuthUser(context);
  if (!user || user.role !== "admin") return failure("FORBIDDEN", "Only admins can permanently delete archived SOPs.", 403);
  const id = optionalText(payload.id, 160);
  if (!id) return failure("VALIDATION_ERROR", "Archived SOP id is required.", 400, { id: "Required" });
  const scoped = await archivedSopInScope(context, id);
  if (scoped.response || !scoped.sop) return scoped.response;
  if (!scoped.sop.eligibleForDeletion) {
    return failure("RETENTION_ACTIVE", "This archived SOP is still inside the configured records-retention period.", 409);
  }
  if (payload.confirmationStep !== 2 || payload.confirmationPhrase !== "DELETE ARCHIVED SOP") {
    return failure("CONFIRMATION_REQUIRED", "Complete the two-step confirmation before permanent deletion.", 400, {
      confirmationPhrase: "Type DELETE ARCHIVED SOP to confirm.",
    });
  }

  await context.env.DB!
    .prepare(
      `INSERT INTO sop_archive_events (
        id, sop_id, actor_user_id, event_type, details_json, created_at
      ) VALUES (?, ?, ?, 'Permanent Deleted', ?, ?)`,
    )
    .bind(newId("archive-event"), id, user.id, JSON.stringify({ warningAccepted: true }), isoNow())
    .run();
  await context.env.DB!.prepare("DELETE FROM sops WHERE id = ? AND status = 'Archived'").bind(id).run();
  return success({ id }, "Archived SOP permanently deleted.");
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  return listArchived(context);
};

export const onRequestPost = async (context: PagesFunctionContext) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const [payload, parseError] = await readBody<ArchivedSopPayload>(context.request);
  if (parseError) return parseError;
  if (payload?.action === "restore") return restoreArchived(context, payload);
  if (payload?.action === "delete") return deleteArchived(context, payload);
  return failure("VALIDATION_ERROR", "Unsupported archived SOP action.", 400, { action: "Use restore or delete." });
};
