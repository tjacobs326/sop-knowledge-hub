var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// _shared/cloudflare.ts
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
__name(jsonResponse, "jsonResponse");
function getClientIp(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}
__name(getClientIp, "getClientIp");
function newId(prefix) {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.randomUUID) return `${prefix}-${cryptoObject.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
__name(newId, "newId");
function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
__name(safeJsonParse, "safeJsonParse");

// _shared/api.ts
function success(data, message, status = 200, init) {
  return new Response(JSON.stringify({ success: true, data, message }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": init?.headers ? new Headers(init.headers).get("cache-control") || "no-store" : "no-store"
    }
  });
}
__name(success, "success");
function failure(code, message, status = 400, fields = {}) {
  return jsonResponse(
    {
      success: false,
      error: {
        code,
        message,
        fields
      }
    },
    status
  );
}
__name(failure, "failure");
function cacheHeaders(kind = "private") {
  return {
    "cache-control": kind === "public" ? "public, max-age=60, stale-while-revalidate=120" : "no-store"
  };
}
__name(cacheHeaders, "cacheHeaders");
function roleFromRequest(request) {
  const hostname = new URL(request.url).hostname;
  const allowDevRoleOverride = hostname === "127.0.0.1" || hostname === "localhost";
  const raw = (allowDevRoleOverride ? request.headers.get("x-sop-role") || request.headers.get("x-user-role") || new URL(request.url).searchParams.get("role") : "") || "normal";
  const normalized = raw.toLowerCase();
  if (normalized.includes("admin")) return "admin";
  if (normalized.includes("creator") || normalized.includes("reviewer")) return "creator";
  return "normal";
}
__name(roleFromRequest, "roleFromRequest");
async function readBody(request) {
  try {
    return [await request.json(), null];
  } catch {
    return [null, failure("INVALID_JSON", "Send a valid JSON request body.", 400)];
  }
}
__name(readBody, "readBody");
function getRouteParam(context, key) {
  const maybeParams = context.params;
  const value = maybeParams?.[key];
  return Array.isArray(value) ? value[0] : value || "";
}
__name(getRouteParam, "getRouteParam");
function optionalText(value, maxLength) {
  const text = String(value || "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}
__name(optionalText, "optionalText");
function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
__name(isEmail, "isEmail");
function unixNow() {
  return Math.floor(Date.now() / 1e3);
}
__name(unixNow, "unixNow");
function unixFromDate(value) {
  if (!value) return null;
  const date = new Date(String(value).includes("T") ? String(value) : `${String(value)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / 1e3);
}
__name(unixFromDate, "unixFromDate");

// _shared/admin.ts
function requireDb(db) {
  if (!db) return jsonResponse({ error: "D1 database binding DB is not available." }, 503);
  return null;
}
__name(requireDb, "requireDb");
function slugify(value, fallback) {
  const slug = value.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || fallback;
}
__name(slugify, "slugify");
function idFrom(value, prefix) {
  const slug = slugify(value, "");
  return slug ? `${prefix}-${slug}` : newId(prefix);
}
__name(idFrom, "idFrom");
async function readJsonBody(request) {
  try {
    return [await request.json(), null];
  } catch {
    return [null, jsonResponse({ error: "Send valid JSON." }, 400)];
  }
}
__name(readJsonBody, "readJsonBody");
function listFromJson(value) {
  return safeJsonParse(value, []);
}
__name(listFromJson, "listFromJson");

// _shared/auth.ts
var roleByAccessLevel = {
  "Normal User": "normal",
  "Creator / Reviewer": "creator",
  Admin: "admin"
};
var fallbackPermissionsByRole = {
  normal: ["Search SOPs", "Use Guided Finder", "Browse Categories", "Submit Requests"],
  creator: [
    "Search SOPs",
    "Use Guided Finder",
    "Browse Categories",
    "Submit Requests",
    "Create SOPs",
    "Edit Drafts",
    "Review SOPs",
    "Request Changes",
    "Approve SOPs",
    "Publish SOPs",
    "Archive SOPs",
    "Upload Media"
  ],
  admin: [
    "Search SOPs",
    "Use Guided Finder",
    "Browse Categories",
    "Submit Requests",
    "Create SOPs",
    "Edit Drafts",
    "Review SOPs",
    "Request Changes",
    "Approve SOPs",
    "Publish SOPs",
    "Archive SOPs",
    "Manage Users",
    "Manage Categories",
    "Manage Tags",
    "View Analytics",
    "Upload Media",
    "Manage Media",
    "Settings"
  ]
};
function isLocalRequest(request) {
  const host = new URL(request.url).hostname;
  return host === "127.0.0.1" || host === "localhost";
}
__name(isLocalRequest, "isLocalRequest");
function normalizeRole(value) {
  const role = String(value || "").toLowerCase();
  if (role.includes("admin")) return "admin";
  if (role.includes("creator") || role.includes("reviewer")) return "creator";
  return "normal";
}
__name(normalizeRole, "normalizeRole");
function accessLevelForRole(role) {
  if (role === "admin") return "Admin";
  if (role === "creator") return "Creator / Reviewer";
  return "Normal User";
}
__name(accessLevelForRole, "accessLevelForRole");
function emailFromRequest(request) {
  return (request.headers.get("cf-access-authenticated-user-email") || request.headers.get("x-authenticated-user-email") || request.headers.get("x-forwarded-email") || "").trim().toLowerCase();
}
__name(emailFromRequest, "emailFromRequest");
function localDevUser(request) {
  if (!isLocalRequest(request)) return null;
  const role = normalizeRole(request.headers.get("x-sop-dev-role") || "admin");
  const email = String(request.headers.get("x-sop-dev-email") || "tjacobs@example.org").trim().toLowerCase();
  const devSubRoles = [
    {
      id: "subrole-instructional-technology-specialist",
      label: "Instructional Technologist",
      slug: "instructional-technologist",
      department: "Instructional Technology",
      teamId: "team-instructional-technology-specialists"
    },
    {
      id: "subrole-instructional-designer",
      label: "Instructional Designer",
      slug: "instructional-designer",
      department: "Instructional Design",
      teamId: "team-instructional-designers"
    },
    {
      id: "subrole-project-manager",
      label: "Project Manager",
      slug: "project-manager",
      department: "Project Management",
      teamId: "team-project-managers"
    },
    {
      id: "subrole-quality-assurance-specialist",
      label: "Quality Assurance Specialist",
      slug: "quality-assurance-specialist",
      department: "Quality Assurance",
      teamId: "team-quality-assurance-specialists"
    },
    {
      id: "subrole-multimedia",
      label: "Multimedia",
      slug: "multimedia",
      department: "Multimedia",
      teamId: "team-multimedia"
    }
  ];
  const subRoles = role === "creator" ? devSubRoles : [];
  const user = {
    id: role === "admin" ? "tarek-jacobs" : role === "creator" ? "maya-patel" : "staff-user",
    name: role === "admin" ? "Tarek Jacobs" : role === "creator" ? "Maya Patel" : "Staff User",
    email,
    accessLevel: accessLevelForRole(role),
    role,
    permissions: fallbackPermissionsByRole[role],
    subRoles,
    selectedSubRole: null,
    isLocalDev: true
  };
  user.selectedSubRole = resolveSelectedSubRole(user, request);
  return user;
}
__name(localDevUser, "localDevUser");
function normalizePermissions(row) {
  const fromRoleJson = safeJsonParse(row.permissionsJson, []);
  const fromJoin = String(row.rolePermissionsCsv || "").split(",").map((item) => item.trim()).filter(Boolean);
  return Array.from(/* @__PURE__ */ new Set([...fromRoleJson, ...fromJoin]));
}
__name(normalizePermissions, "normalizePermissions");
async function findUserByEmail(db, email) {
  return await db.prepare(
    `SELECT
        users.id,
        users.name,
        users.email,
        users.access_level AS accessLevel,
        roles.permissions_json AS permissionsJson,
        GROUP_CONCAT(DISTINCT permissions.name) AS rolePermissionsCsv
       FROM users
       LEFT JOIN user_roles ON user_roles.user_id = users.id
         AND (user_roles.expires_at IS NULL OR user_roles.expires_at > CURRENT_TIMESTAMP)
       LEFT JOIN roles ON roles.id = COALESCE(user_roles.role_id, users.role_id)
       LEFT JOIN role_permissions ON role_permissions.role_id = roles.id
       LEFT JOIN permissions ON permissions.id = role_permissions.permission_id
       WHERE lower(users.email) = lower(?)
         AND users.status = 'Active'
         AND COALESCE(users.is_active, 1) = 1
       GROUP BY users.id
       LIMIT 1`
  ).bind(email).first();
}
__name(findUserByEmail, "findUserByEmail");
async function previewCreatorUser(request, db) {
  const requested = selectedSubRoleFromRequest(request);
  if (!requested) return null;
  const subRoles = await listCreatorSubRoles(db);
  const selected = subRoles.find((subRole) => subRole.id === requested || subRole.slug === requested);
  if (!selected) return null;
  const user = await db.prepare(
    `SELECT users.id, users.name, users.email, users.access_level AS accessLevel
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
       ORDER BY CASE users.access_level WHEN 'Admin' THEN 2 ELSE 1 END, users.name ASC
       LIMIT 1`
  ).bind(selected.id, selected.teamId || "", selected.department).first().catch(() => null);
  return {
    id: user?.id || "preview-creator-reviewer",
    name: user?.name || "Creator / Reviewer Preview",
    email: user?.email || "creator-reviewer-preview@example.org",
    accessLevel: user?.accessLevel || "Creator / Reviewer",
    role: user?.accessLevel === "Admin" ? "admin" : "creator",
    permissions: user?.accessLevel === "Admin" ? fallbackPermissionsByRole.admin : fallbackPermissionsByRole.creator,
    subRoles: [selected],
    selectedSubRole: selected,
    isLocalDev: false
  };
}
__name(previewCreatorUser, "previewCreatorUser");
async function getAuthUser(context) {
  const local = localDevUser(context.request);
  if (local) return local;
  const email = emailFromRequest(context.request);
  if (!context.env.DB) return null;
  if (!email) return previewCreatorUser(context.request, context.env.DB);
  const row = await findUserByEmail(context.env.DB, email);
  if (!row) return null;
  const accessLevel = row.accessLevel || "Normal User";
  const role = roleByAccessLevel[accessLevel] || "normal";
  const permissions = normalizePermissions(row);
  const subRoles = role === "creator" ? await listUserSubRoles(context.env.DB, row.id) : [];
  const user = {
    id: row.id,
    name: row.name,
    email: row.email,
    accessLevel,
    role,
    permissions: permissions.length ? permissions : fallbackPermissionsByRole[role],
    subRoles,
    selectedSubRole: null,
    isLocalDev: false
  };
  user.selectedSubRole = resolveSelectedSubRole(user, context.request);
  return user;
}
__name(getAuthUser, "getAuthUser");
function hasPermission(user, permission) {
  return user.role === "admin" || user.permissions.includes(permission);
}
__name(hasPermission, "hasPermission");
async function requireAuth(context) {
  const user = await getAuthUser(context);
  if (!user) {
    return {
      user: null,
      response: failure("UNAUTHENTICATED", "Sign in before using this API.", 401)
    };
  }
  return { user, response: null };
}
__name(requireAuth, "requireAuth");
async function requirePermission(context, permission) {
  const { user, response } = await requireAuth(context);
  if (response || !user) return { user, response };
  if (!hasPermission(user, permission)) {
    return {
      user,
      response: failure("FORBIDDEN", "You do not have permission to perform this action.", 403)
    };
  }
  return { user, response: null };
}
__name(requirePermission, "requirePermission");

// _shared/ownership.ts
function selectedSubRoleFromRequest(request) {
  const url = new URL(request.url);
  return (request.headers.get("x-sop-sub-role") || request.headers.get("x-sop-selected-sub-role") || url.searchParams.get("subRole") || "").trim();
}
__name(selectedSubRoleFromRequest, "selectedSubRoleFromRequest");
async function listCreatorSubRoles(db) {
  try {
    const result = await db.prepare(
      `SELECT
          id,
          label,
          slug,
          department,
          team_id AS teamId
         FROM creator_sub_roles
         WHERE status = 'Active'
         ORDER BY sort_order ASC, label ASC`
    ).all();
    return result.results || [];
  } catch {
    return [];
  }
}
__name(listCreatorSubRoles, "listCreatorSubRoles");
async function resolveRequestedCreatorSubRole(db, request) {
  const requested = selectedSubRoleFromRequest(request);
  if (!requested) return null;
  const subRoles = await listCreatorSubRoles(db);
  return subRoles.find((subRole) => subRole.id === requested || subRole.slug === requested) || null;
}
__name(resolveRequestedCreatorSubRole, "resolveRequestedCreatorSubRole");
async function listUserSubRoles(db, userId) {
  if (!userId) return [];
  try {
    const result = await db.prepare(
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
         ORDER BY sub_roles.sort_order ASC, sub_roles.label ASC`
    ).bind(userId).all();
    return result.results || [];
  } catch {
    return [];
  }
}
__name(listUserSubRoles, "listUserSubRoles");
function resolveSelectedSubRole(user, request) {
  const requested = selectedSubRoleFromRequest(request);
  if (!requested && user.subRoles.length === 1) return user.subRoles[0] || null;
  if (!requested) return null;
  return user.subRoles.find((subRole) => subRole.id === requested || subRole.slug === requested) || null;
}
__name(resolveSelectedSubRole, "resolveSelectedSubRole");
async function getSopOwnership(db, sopId) {
  return await db.prepare(
    `SELECT
        id,
        owner_sub_role_id AS ownerSubRoleId,
        owner_team_id AS ownerTeamId,
        COALESCE(owner_id, owner_user_id) AS ownerUserId
       FROM sops
       WHERE id = ?
       LIMIT 1`
  ).bind(sopId).first();
}
__name(getSopOwnership, "getSopOwnership");
async function requireCreatorSubRoleSelection(context, user) {
  if (user.role === "admin") return { subRole: null, response: null };
  if (user.role !== "creator") {
    return {
      subRole: null,
      response: failure("FORBIDDEN", "Normal users can view SOPs, but cannot change SOP ownership or workflow.", 403)
    };
  }
  const selected = resolveSelectedSubRole(user, context.request);
  if (!selected) {
    const message = user.subRoles.length ? "Select your Creator / Reviewer department before changing SOPs." : "Your Creator / Reviewer account is not assigned to a department sub-role.";
    return {
      subRole: null,
      response: failure("SUB_ROLE_REQUIRED", message, 403)
    };
  }
  return { subRole: selected, response: null };
}
__name(requireCreatorSubRoleSelection, "requireCreatorSubRoleSelection");
async function requireSopOwnership(context, user, sopId) {
  if (user.role === "admin") return { response: null, ownership: null, subRole: null };
  const selected = await requireCreatorSubRoleSelection(context, user);
  if (selected.response || !selected.subRole) {
    return { response: selected.response, ownership: null, subRole: selected.subRole };
  }
  const ownership = await getSopOwnership(context.env.DB, sopId);
  if (!ownership) {
    return {
      response: failure("NOT_FOUND", "SOP not found.", 404),
      ownership: null,
      subRole: selected.subRole
    };
  }
  const subRoleOwnsSop = ownership.ownerSubRoleId ? ownership.ownerSubRoleId === selected.subRole.id : Boolean(selected.subRole.teamId && ownership.ownerTeamId === selected.subRole.teamId);
  if (!subRoleOwnsSop) {
    return {
      response: failure(
        "SOP_OWNERSHIP_REQUIRED",
        "This SOP belongs to another department. You can view it, but only its owning department can edit, save, update, archive, approve, or publish it.",
        403
      ),
      ownership,
      subRole: selected.subRole
    };
  }
  return { response: null, ownership, subRole: selected.subRole };
}
__name(requireSopOwnership, "requireSopOwnership");

// _shared/sop-data.ts
var publishedStatus = "Published";
function normalizeLimit(value) {
  if (!Number.isFinite(value || NaN)) return 100;
  return Math.max(1, Math.min(Number(value), 100));
}
__name(normalizeLimit, "normalizeLimit");
function normalizeOffset(value) {
  if (!Number.isFinite(value || NaN)) return 0;
  return Math.max(0, Number(value));
}
__name(normalizeOffset, "normalizeOffset");
function sopSelect() {
  return `SELECT
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
    (
      SELECT reviewer_assignment.user_id
      FROM sop_assignments reviewer_assignment
      WHERE reviewer_assignment.sop_id = sops.id
        AND reviewer_assignment.assignment_type = 'Reviewer'
        AND reviewer_assignment.status = 'Active'
      ORDER BY reviewer_assignment.due_at ASC, reviewer_assignment.user_id ASC
      LIMIT 1
    ) AS reviewerId,
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
  LEFT JOIN tags ON tags.id = sop_tags.tag_id`;
}
__name(sopSelect, "sopSelect");
function splitCsv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}
__name(splitCsv, "splitCsv");
function normalizeSop(row) {
  const metadata = safeJsonParse(String(row.metadataJson || "{}"), {});
  const tools = Array.isArray(metadata.tools) ? metadata.tools.map(String) : [];
  const audience = Array.isArray(metadata.audience) ? metadata.audience.map(String) : [];
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    purpose: row.purpose,
    categoryId: row.categoryId,
    category: row.category,
    categorySlug: row.categorySlug,
    ownerId: row.ownerId,
    owner: row.owner,
    reviewerId: row.reviewerId,
    ownerSubRoleId: row.ownerSubRoleId,
    ownerSubRole: row.ownerSubRole,
    ownerDepartment: row.ownerDepartment,
    ownerTeam: row.ownerTeam,
    status: row.status,
    type: row.type,
    estimatedCompletionTime: row.estimatedCompletionTime,
    estimatedMinutes: row.estimatedMinutes,
    audience,
    tools,
    tags: splitCsv(row.tagsCsv),
    currentVersionId: row.currentVersionId,
    version: {
      id: row.versionId,
      number: row.versionNumber,
      title: row.versionTitle,
      summary: row.versionSummary,
      content: row.content || row.bodyMarkdown,
      beforeYouBegin: row.beforeYouBegin,
      checklist: row.checklist,
      troubleshooting: row.troubleshooting,
      changeSummary: row.changeSummary,
      status: row.versionStatus,
      metadata
    },
    bodyMarkdown: row.bodyMarkdown || row.content,
    metadata,
    reviewDate: row.reviewDate,
    reviewDueAt: row.reviewDueAt,
    visibility: row.visibility,
    sourceType: row.sourceType,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    viewCount: Number(row.viewCount || 0),
    helpfulCount: Number(row.helpfulCount || 0),
    notHelpfulCount: Number(row.notHelpfulCount || 0)
  };
}
__name(normalizeSop, "normalizeSop");
function addFilters(filters) {
  const where = [];
  const values = [];
  if (filters.publicOnly !== false) {
    where.push("sops.status = ?");
    values.push(publishedStatus);
    where.push("COALESCE(sops.is_active, 1) = 1");
  } else if (filters.status) {
    where.push("(sops.status = ? OR lower(sops.status) = lower(?))");
    values.push(filters.status, filters.status);
  }
  if (filters.categoryId) {
    where.push("sops.category_id = ?");
    values.push(filters.categoryId);
  }
  if (filters.category) {
    where.push("(categories.slug = ? OR categories.name = ?)");
    values.push(filters.category, filters.category);
  }
  if (filters.owner) {
    where.push("(owner.id = ? OR owner.name = ?)");
    values.push(filters.owner, filters.owner);
  }
  if (filters.ownerSubRoleId) {
    where.push("sops.owner_sub_role_id = ?");
    values.push(filters.ownerSubRoleId);
  }
  if (filters.tag) {
    where.push(
      `EXISTS (
        SELECT 1 FROM sop_tags st
        JOIN tags tag_filter ON tag_filter.id = st.tag_id
        WHERE st.sop_id = sops.id AND (tag_filter.slug = ? OR tag_filter.name = ?)
      )`
    );
    values.push(filters.tag, filters.tag);
  }
  if (filters.tool) {
    where.push("versions.metadata_json LIKE ?");
    values.push(`%${filters.tool}%`);
  }
  if (filters.search) {
    where.push(
      `(sops.title LIKE ?
        OR sops.purpose LIKE ?
        OR sops.summary LIKE ?
        OR versions.title LIKE ?
        OR versions.summary LIKE ?
        OR versions.body_markdown LIKE ?
        OR versions.content LIKE ?
        OR versions.before_you_begin LIKE ?
        OR versions.checklist LIKE ?
        OR versions.troubleshooting LIKE ?
        OR versions.metadata_json LIKE ?
        OR categories.name LIKE ?
        OR categories.slug LIKE ?
        OR owner.name LIKE ?
        OR EXISTS (
          SELECT 1 FROM sop_tags search_st
          JOIN tags search_tags ON search_tags.id = search_st.tag_id
          WHERE search_st.sop_id = sops.id
          AND (search_tags.name LIKE ? OR search_tags.slug LIKE ?)
        ))`
    );
    const q = `%${filters.search}%`;
    values.push(q, q, q, q, q, q, q, q, q, q, q, q, q, q, q, q);
  }
  return { where, values };
}
__name(addFilters, "addFilters");
function orderBy(sort) {
  switch (sort) {
    case "popular":
      return "ORDER BY COALESCE(sops.view_count, 0) DESC, sops.title ASC";
    case "title":
      return "ORDER BY sops.title ASC";
    case "oldest":
      return "ORDER BY sops.updated_at ASC, sops.title ASC";
    case "recent":
    default:
      return "ORDER BY sops.updated_at DESC, sops.title ASC";
  }
}
__name(orderBy, "orderBy");
async function listSops(db, filters = {}) {
  const { where, values } = addFilters(filters);
  const limit = normalizeLimit(filters.limit);
  const offset = normalizeOffset(filters.offset);
  const sql = `${sopSelect()}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY sops.id
    ${orderBy(filters.sort)}
    LIMIT ? OFFSET ?`;
  const result = await db.prepare(sql).bind(...values, limit, offset).all();
  return (result.results || []).map(normalizeSop);
}
__name(listSops, "listSops");
async function countSops(db, filters = {}) {
  const { where, values } = addFilters(filters);
  const result = await db.prepare(
    `SELECT COUNT(DISTINCT sops.id) AS total
       FROM sops
       LEFT JOIN categories ON categories.id = sops.category_id
       LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
       LEFT JOIN sop_versions versions ON versions.id = sops.current_version_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`
  ).bind(...values).first();
  return Number(result?.total || 0);
}
__name(countSops, "countSops");
function uniqueSorted(values) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}
__name(uniqueSorted, "uniqueSorted");
function addPublicFacetFilters(filters = {}) {
  const where = ["sops.status = ?", "COALESCE(sops.is_active, 1) = 1"];
  const values = [publishedStatus];
  if (filters.ownerSubRoleId) {
    where.push("sops.owner_sub_role_id = ?");
    values.push(filters.ownerSubRoleId);
  }
  return { where, values };
}
__name(addPublicFacetFilters, "addPublicFacetFilters");
async function listSopFacets(db, filters = {}) {
  const { where, values } = addPublicFacetFilters(filters);
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const [categories, owners, statuses4, tags, metadataRows] = await Promise.all([
    db.prepare(
      `SELECT DISTINCT categories.name AS value
         FROM sops
         JOIN categories ON categories.id = sops.category_id
         ${whereSql}
         ORDER BY categories.name ASC`
    ).bind(...values).all(),
    db.prepare(
      `SELECT DISTINCT owner.name AS value
         FROM sops
         LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
         ${whereSql}
         AND owner.name IS NOT NULL
         ORDER BY owner.name ASC`
    ).bind(...values).all(),
    db.prepare(
      `SELECT DISTINCT sops.status AS value
         FROM sops
         ${whereSql}
         ORDER BY sops.status ASC`
    ).bind(...values).all(),
    db.prepare(
      `SELECT DISTINCT tags.name AS value
         FROM sops
         JOIN sop_tags ON sop_tags.sop_id = sops.id
         JOIN tags ON tags.id = sop_tags.tag_id
         ${whereSql}
         AND COALESCE(tags.is_active, 1) = 1
         ORDER BY tags.name ASC`
    ).bind(...values).all(),
    db.prepare(
      `SELECT versions.metadata_json AS metadataJson
         FROM sops
         LEFT JOIN sop_versions versions ON versions.id = sops.current_version_id
         ${whereSql}`
    ).bind(...values).all()
  ]);
  const tools = uniqueSorted(
    (metadataRows.results || []).flatMap((row) => {
      const metadata = safeJsonParse(String(row.metadataJson || "{}"), {});
      if (Array.isArray(metadata.tools)) return metadata.tools.map(String);
      return String(metadata.tools || "").split(/[\n,|]/).map((tool) => tool.trim()).filter(Boolean);
    })
  );
  return {
    categories: uniqueSorted((categories.results || []).map((row) => String(row.value || ""))),
    tools,
    owners: uniqueSorted((owners.results || []).map((row) => String(row.value || ""))),
    statuses: uniqueSorted((statuses4.results || []).map((row) => String(row.value || ""))),
    tags: uniqueSorted((tags.results || []).map((row) => String(row.value || "")))
  };
}
__name(listSopFacets, "listSopFacets");
async function getSopById(db, id, publicOnly = true) {
  if (!id) return null;
  const row = await db.prepare(
    `${sopSelect()}
       WHERE sops.id = ? ${publicOnly ? "AND sops.status = ? AND COALESCE(sops.is_active, 1) = 1" : ""}
       GROUP BY sops.id
       LIMIT 1`
  ).bind(...publicOnly ? [id, publishedStatus] : [id]).first();
  return row ? normalizeSop(row) : null;
}
__name(getSopById, "getSopById");
async function getSopBySlug(db, slug, publicOnly = true) {
  const row = await db.prepare(
    `${sopSelect()}
       WHERE sops.slug = ? ${publicOnly ? "AND sops.status = ? AND COALESCE(sops.is_active, 1) = 1" : ""}
       GROUP BY sops.id
       LIMIT 1`
  ).bind(...publicOnly ? [slug, publishedStatus] : [slug]).first();
  return row ? normalizeSop(row) : null;
}
__name(getSopBySlug, "getSopBySlug");
async function listCategories(db, filters = {}) {
  const values = [publishedStatus];
  const ownerSubRoleClause = filters.ownerSubRoleId ? "AND sops.owner_sub_role_id = ?" : "";
  if (filters.ownerSubRoleId) values.push(filters.ownerSubRoleId);
  const result = await db.prepare(
    `SELECT
        categories.id,
        categories.name,
        categories.slug,
        categories.description,
        categories.icon,
        categories.color,
        categories.is_active AS isActive,
        COUNT(DISTINCT sops.id) AS sopCount
      FROM categories
      LEFT JOIN sops ON sops.category_id = categories.id
        AND sops.status = ?
        AND COALESCE(sops.is_active, 1) = 1
        ${ownerSubRoleClause}
      WHERE COALESCE(categories.is_active, 1) = 1
      GROUP BY categories.id
      HAVING sopCount > 0
      ORDER BY categories.sort_order ASC, categories.name ASC`
  ).bind(...values).all();
  const categories = result.results || [];
  if (!categories.length) return categories;
  const categoryIds = categories.map((category) => String(category.id || "")).filter(Boolean);
  if (!categoryIds.length) return categories;
  const relatedValues = [publishedStatus, ...categoryIds];
  const relatedOwnerSubRoleClause = filters.ownerSubRoleId ? "AND sops.owner_sub_role_id = ?" : "";
  if (filters.ownerSubRoleId) relatedValues.push(filters.ownerSubRoleId);
  const placeholders = categoryIds.map(() => "?").join(", ");
  const related = await db.prepare(
    `SELECT
        sops.id,
        sops.title,
        sops.slug,
        sops.category_id AS categoryId,
        COALESCE(sops.summary, sops.purpose) AS summary,
        sops.updated_at AS updatedAt
       FROM sops
       WHERE sops.status = ?
        AND COALESCE(sops.is_active, 1) = 1
        AND sops.category_id IN (${placeholders})
        ${relatedOwnerSubRoleClause}
       ORDER BY sops.category_id ASC, sops.updated_at DESC, sops.title ASC`
  ).bind(...relatedValues).all();
  const relatedByCategory = /* @__PURE__ */ new Map();
  (related.results || []).forEach((sop) => {
    const categoryId = String(sop.categoryId || "");
    const bucket = relatedByCategory.get(categoryId) || [];
    if (bucket.length < 3) {
      bucket.push({
        id: sop.id,
        title: sop.title,
        slug: sop.slug,
        summary: sop.summary,
        updatedAt: sop.updatedAt,
        detailUrl: sop.slug ? `/sops/detail/?slug=${encodeURIComponent(String(sop.slug))}` : `/sops/detail/?id=${encodeURIComponent(String(sop.id || ""))}`
      });
      relatedByCategory.set(categoryId, bucket);
    }
  });
  return categories.map((category) => ({
    ...category,
    detailUrl: `/categories/detail/?slug=${encodeURIComponent(String(category.slug || ""))}`,
    relatedSops: relatedByCategory.get(String(category.id || "")) || []
  }));
}
__name(listCategories, "listCategories");
async function listTags(db) {
  const result = await db.prepare(
    `SELECT
        tags.id,
        tags.name,
        tags.slug,
        tags.is_active AS isActive,
        COUNT(DISTINCT sops.id) AS sopCount
      FROM tags
      LEFT JOIN sop_tags ON sop_tags.tag_id = tags.id
      LEFT JOIN sops ON sops.id = sop_tags.sop_id
        AND sops.status = ?
        AND COALESCE(sops.is_active, 1) = 1
      WHERE COALESCE(tags.is_active, 1) = 1
      GROUP BY tags.id
      ORDER BY tags.name ASC`
  ).bind(publishedStatus).all();
  return result.results || [];
}
__name(listTags, "listTags");

// api/sops/slug/[slug].ts
var onRequestGet = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const slug = getRouteParam(context, "slug");
  const publicOnly = roleFromRequest(context.request) === "normal";
  const sop = await getSopBySlug(context.env.DB, slug, publicOnly);
  if (!sop) return failure("NOT_FOUND", "SOP not found.", 404);
  const selectedSubRole = await resolveRequestedCreatorSubRole(context.env.DB, context.request);
  if (selectedSubRole && sop.ownerSubRoleId !== selectedSubRole.id) {
    return failure(
      "SOP_OWNERSHIP_REQUIRED",
      "This SOP belongs to another department. Switch back to Normal User mode to view it without creator/reviewer controls.",
      403
    );
  }
  return new Response(JSON.stringify({ success: true, data: { sop }, sop }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...cacheHeaders(selectedSubRole || !publicOnly ? "private" : "public"),
      vary: "x-sop-sub-role"
    }
  });
}, "onRequestGet");

// _shared/decision-guides.ts
var keywordSignals = [
  ["student_blocked", /\b(blocked|cannot access|can't access|unable to access|student can't|student cannot)\b/i],
  ["grades_affected", /\b(grade|gradebook|score|sync|passed back|completion|assessment)\b/i],
  ["many_students", /\b(all students|many students|multiple students|whole course|everyone|classwide)\b/i],
  ["one_student", /\b(one student|single student|individual student|just one)\b/i],
  ["access_request", /\b(enroll|enrollment|access|add .* course|add .* shell|role)\b/i],
  ["add_person", /\b(add (a )?(student|instructor|pd|staff|user|person))\b/i],
  ["template_clone", /\b(template|clone|copy (a )?(course )?shell|clone (a )?(course )?shell)\b/i],
  ["new_build", /\b(new build|new-build|launch readiness|course offering)\b/i],
  ["kaltura", /\bkaltura\b/i],
  ["captivate", /\bcaptivate\b/i],
  ["h5p", /\bh5p\b/i],
  ["vendor_issue", /\b(vendor|cengage|provider|external tool)\b/i],
  ["broad_change", /\b(project|redesign|broad|large change|replace all|coursewide|course-wide)\b/i],
  ["many_items", /\b(many quiz|all quiz|many items|bulk|multiple items|all questions)\b/i],
  ["book_change", /\b(book edition|textbook|edition change|book change)\b/i],
  ["bounded_fix", /\b(fix|broken|link|error|issue|not working)\b/i]
];
function normalizeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
__name(normalizeKey, "normalizeKey");
function boolSignal(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const normalized = String(value || "").toLowerCase();
  return ["1", "true", "yes", "y"].includes(normalized);
}
__name(boolSignal, "boolSignal");
function deriveRoutingSignals(input) {
  const details = String(input.details || "");
  const signals = {};
  for (const [key, pattern] of keywordSignals) {
    signals[key] = pattern.test(details);
  }
  const impact = input.impact || {};
  if (impact.studentBlocked !== void 0) signals.student_blocked = Boolean(impact.studentBlocked);
  if (impact.gradesAffected !== void 0) signals.grades_affected = Boolean(impact.gradesAffected);
  if (impact.manyStudents !== void 0) signals.many_students = Boolean(impact.manyStudents);
  if (impact.oneStudent !== void 0) signals.one_student = Boolean(impact.oneStudent);
  if (impact.liveCourse !== void 0) signals.live_course = Boolean(impact.liveCourse);
  Object.entries(input.signals || {}).forEach(([key, value]) => {
    signals[normalizeKey(key).replace(/-/g, "_")] = boolSignal(value);
  });
  return signals;
}
__name(deriveRoutingSignals, "deriveRoutingSignals");
async function getDecisionGuide(db, slug) {
  const guide = await db.prepare("SELECT * FROM decision_guides WHERE slug = ? AND status = 'Published' LIMIT 1").bind(slug).first();
  if (!guide) return null;
  const guideId = String(guide.id);
  const [roles, requestTypes2, roleAdjustments, scenarios, journey, faqs] = await Promise.all([
    db.prepare("SELECT role_key AS roleKey, label, icon, hint, sort_order AS sortOrder FROM decision_guide_roles WHERE guide_id = ? ORDER BY sort_order ASC").bind(guideId).all(),
    db.prepare("SELECT request_key AS requestKey, label, icon, hint, default_badge AS defaultBadge, default_title AS defaultTitle, default_summary AS defaultSummary, sort_order AS sortOrder FROM decision_request_types WHERE guide_id = ? AND status = 'Active' ORDER BY sort_order ASC").bind(guideId).all(),
    db.prepare("SELECT role_key AS roleKey, display_name AS displayName, note, sort_order AS sortOrder FROM decision_role_adjustments WHERE guide_id = ? ORDER BY sort_order ASC").bind(guideId).all(),
    db.prepare(`SELECT scenarios.id, request_types.request_key AS requestKey, scenarios.title, scenarios.route_label AS routeLabel, scenarios.route_class AS routeClass, scenarios.destination_label AS destinationLabel, scenarios.why, scenarios.next_step AS nextStep, scenarios.sort_order AS sortOrder
      FROM decision_scenarios scenarios
      JOIN decision_request_types request_types ON request_types.id = scenarios.request_type_id
      WHERE scenarios.guide_id = ?
      ORDER BY scenarios.sort_order ASC`).bind(guideId).all(),
    db.prepare("SELECT step_number AS stepNumber, title, body FROM decision_journey_steps WHERE guide_id = ? ORDER BY step_number ASC").bind(guideId).all(),
    db.prepare("SELECT question, answer, sort_order AS sortOrder FROM decision_faqs WHERE guide_id = ? ORDER BY sort_order ASC").bind(guideId).all()
  ]);
  return {
    id: guide.id,
    slug: guide.slug,
    title: guide.title,
    summary: guide.summary,
    sourceUrl: guide.source_url,
    categoryId: guide.category_id,
    ownerTeamId: guide.owner_team_id,
    defaultSopId: guide.default_sop_id,
    roles: roles.results || [],
    requestTypes: requestTypes2.results || [],
    roleAdjustments: roleAdjustments.results || [],
    scenarios: scenarios.results || [],
    journey: journey.results || [],
    faqs: faqs.results || []
  };
}
__name(getDecisionGuide, "getDecisionGuide");
async function getGuideId(db, slug) {
  const row = await db.prepare("SELECT id FROM decision_guides WHERE slug = ? AND status = 'Published' LIMIT 1").bind(slug).first();
  return row?.id || "";
}
__name(getGuideId, "getGuideId");
async function getGuideRecommendation(db, guideId) {
  return db.prepare(
    `SELECT
        sops.id,
        sops.title,
        sops.slug,
        categories.name AS category,
        categories.slug AS categorySlug
       FROM decision_guides guides
       JOIN sops ON sops.id = guides.default_sop_id
       LEFT JOIN categories ON categories.id = sops.category_id
       WHERE guides.id = ?
       LIMIT 1`
  ).bind(guideId).first();
}
__name(getGuideRecommendation, "getGuideRecommendation");
function scoreRule(rule, signals, signalRows, roleKey) {
  const signalScore = signalRows.filter((signal) => signal.ruleId === rule.id).reduce((total, signal) => {
    const active = signals[signal.signalKey] === boolSignal(signal.signalValue);
    return total + (active ? signal.weight * signal.polarity : 0);
  }, 0);
  const roleScore = rule.roleKey && rule.roleKey === roleKey ? 8 : rule.roleKey ? -20 : 0;
  const score = rule.confidenceBase + rule.priorityScore * 0.15 + rule.urgencyScore * 0.15 + rule.ownershipScore * 0.2 + signalScore + roleScore;
  return Math.max(0, Math.min(100, Math.round(score)));
}
__name(scoreRule, "scoreRule");
async function routeDecisionGuide(db, slug, input) {
  const guideId = await getGuideId(db, slug);
  if (!guideId) return null;
  const requestKey = normalizeKey(input.requestType || "broken");
  const roleKey = normalizeKey(input.role || "learner-services");
  const signals = deriveRoutingSignals(input);
  const rulesResult = await db.prepare(
    `SELECT
        rules.id,
        rules.guide_id AS guideId,
        rules.request_type_id AS requestTypeId,
        request_types.request_key AS requestKey,
        rules.role_key AS roleKey,
        rules.route_label AS routeLabel,
        rules.route_class AS routeClass,
        rules.destination_label AS destinationLabel,
        rules.destination_team_id AS destinationTeamId,
        rules.action_type AS actionType,
        rules.requires_ticket AS requiresTicket,
        rules.requires_project_path AS requiresProjectPath,
        rules.priority_score AS priorityScore,
        rules.urgency_score AS urgencyScore,
        rules.ownership_score AS ownershipScore,
        rules.confidence_base AS confidenceBase,
        rules.title,
        rules.summary,
        rules.next_steps_json AS nextStepsJson,
        rules.external_url AS externalUrl,
        rules.sort_order AS sortOrder
       FROM decision_routing_rules rules
       JOIN decision_request_types request_types ON request_types.id = rules.request_type_id
       WHERE rules.guide_id = ?
         AND request_types.request_key = ?
         AND (rules.role_key IS NULL OR rules.role_key = ?)
       ORDER BY rules.sort_order ASC`
  ).bind(guideId, requestKey, roleKey).all();
  let rules = rulesResult.results || [];
  if (!rules.length) {
    const fallback = await db.prepare(
      `SELECT
          rules.id,
          rules.guide_id AS guideId,
          rules.request_type_id AS requestTypeId,
          request_types.request_key AS requestKey,
          rules.role_key AS roleKey,
          rules.route_label AS routeLabel,
          rules.route_class AS routeClass,
          rules.destination_label AS destinationLabel,
          rules.destination_team_id AS destinationTeamId,
          rules.action_type AS actionType,
          rules.requires_ticket AS requiresTicket,
          rules.requires_project_path AS requiresProjectPath,
          rules.priority_score AS priorityScore,
          rules.urgency_score AS urgencyScore,
          rules.ownership_score AS ownershipScore,
          rules.confidence_base AS confidenceBase,
          rules.title,
          rules.summary,
          rules.next_steps_json AS nextStepsJson,
          rules.external_url AS externalUrl,
          rules.sort_order AS sortOrder
         FROM decision_routing_rules rules
         JOIN decision_request_types request_types ON request_types.id = rules.request_type_id
         WHERE rules.guide_id = ?
           AND request_types.request_key = 'broken'
         ORDER BY rules.sort_order ASC
         LIMIT 1`
    ).bind(guideId).all();
    rules = fallback.results || [];
  }
  const ruleIds = rules.map((rule) => rule.id);
  const signalRows = ruleIds.length ? (await db.prepare(
    `SELECT rule_id AS ruleId, signal_key AS signalKey, signal_value AS signalValue, weight, polarity
             FROM decision_rule_signals
             WHERE rule_id IN (${ruleIds.map(() => "?").join(",")})`
  ).bind(...ruleIds).all()).results || [] : [];
  const ranked = rules.map((rule) => ({
    rule,
    score: scoreRule(rule, signals, signalRows, roleKey)
  })).sort((a, b) => b.score - a.score || a.rule.sortOrder - b.rule.sortOrder);
  const best = ranked[0];
  if (!best) return null;
  const recommendedSop = await getGuideRecommendation(db, guideId);
  const recommendedSopSlug = String(recommendedSop?.slug || "");
  const result = {
    guideId,
    selectedRoleKey: roleKey,
    selectedRequestKey: requestKey,
    matchedRuleId: best.rule.id,
    confidenceScore: best.score,
    routeLabel: best.rule.routeLabel,
    routeClass: best.rule.routeClass,
    destinationLabel: best.rule.destinationLabel,
    destinationTeamId: best.rule.destinationTeamId,
    actionType: best.rule.actionType,
    requiresTicket: Boolean(best.rule.requiresTicket),
    requiresProjectPath: Boolean(best.rule.requiresProjectPath),
    title: best.rule.title,
    summary: best.rule.summary,
    nextSteps: safeJsonParse(best.rule.nextStepsJson, []),
    externalUrl: best.rule.externalUrl,
    recommendedSop: recommendedSop ? {
      id: recommendedSop.id,
      title: recommendedSop.title,
      slug: recommendedSop.slug,
      category: recommendedSop.category,
      categorySlug: recommendedSop.categorySlug,
      detailUrl: recommendedSopSlug ? `/sops/detail/?slug=${encodeURIComponent(recommendedSopSlug)}` : `/sops/detail/?id=${encodeURIComponent(String(recommendedSop.id || ""))}`
    } : null,
    signals,
    alternatives: ranked.slice(1, 4).map(({ rule, score }) => ({
      ruleId: rule.id,
      score,
      routeLabel: rule.routeLabel,
      destinationLabel: rule.destinationLabel,
      title: rule.title
    }))
  };
  return result;
}
__name(routeDecisionGuide, "routeDecisionGuide");

// api/guides/[slug]/route.ts
function routeParam(context, key) {
  const params = context.params;
  const value = params?.[key];
  return Array.isArray(value) ? value[0] : value || "";
}
__name(routeParam, "routeParam");
var onRequestPost = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const [payload, parseError] = await readBody(context.request);
  if (parseError) return parseError;
  try {
    const slug = routeParam(context, "slug");
    const result = await routeDecisionGuide(context.env.DB, slug, payload || {});
    if (!result) return failure("ROUTE_NOT_FOUND", "No routing rule matched this guide request.", 404);
    const authUser = await getAuthUser(context);
    const sessionId = context.request.headers.get("x-sop-session-id") || "";
    await context.env.DB.prepare(
      `INSERT INTO decision_routing_events (
        id,
        guide_id,
        selected_role_key,
        selected_request_key,
        matched_rule_id,
        input_json,
        result_json,
        confidence_score,
        session_id,
        user_id,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      newId("decision-event"),
      result.guideId,
      result.selectedRoleKey,
      result.selectedRequestKey,
      result.matchedRuleId,
      JSON.stringify(payload || {}),
      JSON.stringify(result),
      result.confidenceScore,
      sessionId,
      authUser?.id || null,
      (/* @__PURE__ */ new Date()).toISOString()
    ).run();
    return success({ result });
  } catch (error) {
    return failure(
      "ROUTE_EVALUATION_FAILED",
      error instanceof Error ? error.message : "Unable to evaluate routing guide.",
      500
    );
  }
}, "onRequestPost");
var onRequestGet2 = /* @__PURE__ */ __name(() => success({
  service: "Decision Guide Routing",
  method: "POST",
  example: {
    role: "learner-services",
    requestType: "media",
    details: "A Captivate activity completed but did not pass a grade back for one student.",
    impact: { gradesAffected: true, oneStudent: true }
  }
}), "onRequestGet");

// _shared/sop-workflow.ts
var statusByAction = {
  "submit-review": "In Review",
  "request-changes": "Needs Revision",
  approve: "Approved",
  publish: "Published",
  archive: "Archived"
};
async function runStatements(db, statements) {
  if (typeof db.batch === "function") {
    await db.batch(statements);
    return;
  }
  for (const statement of statements) {
    await statement.run();
  }
}
__name(runStatements, "runStatements");
async function configuredTransition(db, action, currentStatus) {
  try {
    return await db.prepare(
      `SELECT
          to_status AS toStatus,
          creates_review AS createsReview,
          requires_notes AS requiresNotes
         FROM sop_workflow_transitions
         WHERE action = ? AND from_status = ?
         LIMIT 1`
    ).bind(action, currentStatus).first();
  } catch {
    return null;
  }
}
__name(configuredTransition, "configuredTransition");
async function transitionSop(db, input) {
  const sop = await db.prepare("SELECT id, status, current_version_id AS currentVersionId FROM sops WHERE id = ? LIMIT 1").bind(input.sopId).first();
  if (!sop) return null;
  const configured = await configuredTransition(db, input.action, sop.status);
  const newStatus = configured?.toStatus || statusByAction[input.action];
  const versionId = input.versionId || sop.currentVersionId || null;
  const now = Math.floor(Date.now() / 1e3);
  const nowIso2 = new Date(now * 1e3).toISOString();
  const statements = [];
  if (configured?.requiresNotes && !input.notes?.trim()) {
    throw new Error("This workflow transition requires notes.");
  }
  if (input.action === "publish") {
    statements.push(
      db.prepare(
        `UPDATE sops
           SET status = ?, current_version_id = COALESCE(?, current_version_id), published_at = ?,
               approved_by_user_id = ?, archived_at = NULL, is_active = 1, updated_at = ?
           WHERE id = ?`
      ).bind(newStatus, versionId, nowIso2, input.actorUserId || null, nowIso2, input.sopId)
    );
  } else if (input.action === "archive") {
    statements.push(
      db.prepare("UPDATE sops SET status = ?, archived_at = ?, is_active = 0, updated_at = ? WHERE id = ?").bind(newStatus, nowIso2, nowIso2, input.sopId)
    );
  } else {
    statements.push(
      db.prepare(
        `UPDATE sops
           SET status = ?, current_version_id = COALESCE(?, current_version_id),
               approved_by_user_id = CASE WHEN ? = 'Approved' THEN ? ELSE approved_by_user_id END,
               updated_at = ?
           WHERE id = ?`
      ).bind(newStatus, versionId, newStatus, input.actorUserId || null, nowIso2, input.sopId)
    );
  }
  if (versionId) {
    statements.push(
      db.prepare(
        `UPDATE sop_versions
           SET status = ?,
               reviewed_by_user_id = CASE WHEN ? IN ('Needs Revision', 'Approved', 'Published') THEN ? ELSE reviewed_by_user_id END,
               approved_by_user_id = CASE WHEN ? IN ('Approved', 'Published') THEN ? ELSE approved_by_user_id END,
               reviewed_at = CASE WHEN ? IN ('Needs Revision', 'Approved', 'Published') THEN COALESCE(reviewed_at, ?) ELSE reviewed_at END,
               approved_at = CASE WHEN ? IN ('Approved', 'Published') THEN COALESCE(approved_at, ?) ELSE approved_at END,
               published_at = CASE WHEN ? = 'Published' THEN ? ELSE published_at END,
               updated_at = ?
           WHERE id = ?`
      ).bind(
        newStatus,
        newStatus,
        input.actorUserId || null,
        newStatus,
        input.actorUserId || null,
        newStatus,
        nowIso2,
        newStatus,
        nowIso2,
        newStatus,
        now,
        now,
        versionId
      )
    );
  }
  statements.push(
    db.prepare(
      `INSERT INTO sop_status_history (
          id, sop_id, version_id, previous_status, new_status, changed_by, notes, changed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      newId("status"),
      input.sopId,
      versionId,
      sop.status,
      newStatus,
      input.actorUserId || null,
      input.notes || null,
      now
    )
  );
  statements.push(
    db.prepare(
      `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      newId("audit"),
      input.actorUserId || null,
      input.action,
      "sop",
      input.sopId,
      JSON.stringify({ previousStatus: sop.status, newStatus, versionId, notes: input.notes || "" }),
      now
    )
  );
  if (configured?.createsReview && versionId) {
    statements.push(
      db.prepare(
        `INSERT INTO sop_reviews (
            id, sop_id, version_id, reviewer_id, status, comments, created_at, updated_at
          ) VALUES (?, ?, ?, NULL, 'assigned', ?, ?, ?)`
      ).bind(
        newId("review"),
        input.sopId,
        versionId,
        input.notes || "Submitted for review.",
        now,
        now
      )
    );
  }
  await runStatements(db, statements);
  return { previousStatus: sop.status, newStatus, versionId };
}
__name(transitionSop, "transitionSop");

// api/sops/[id]/approve.ts
var onRequestPost2 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Approve SOPs");
  if (auth.response) return auth.response;
  const ownership = await requireSopOwnership(context, auth.user, getRouteParam(context, "id"));
  if (ownership.response) return ownership.response;
  const [payload, parseError] = await readBody(context.request);
  if (parseError) return parseError;
  const transition = await transitionSop(context.env.DB, {
    sopId: getRouteParam(context, "id"),
    versionId: payload?.versionId,
    actorUserId: payload?.actorUserId || auth.user?.id,
    notes: payload?.notes || "Approved.",
    action: "approve"
  });
  if (!transition) return failure("NOT_FOUND", "SOP not found.", 404);
  return success({ transition }, "SOP approved.");
}, "onRequestPost");

// api/sops/[id]/archive.ts
var onRequestPost3 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Archive SOPs");
  if (auth.response) return auth.response;
  const ownership = await requireSopOwnership(context, auth.user, getRouteParam(context, "id"));
  if (ownership.response) return ownership.response;
  const [payload, parseError] = await readBody(context.request);
  if (parseError) return parseError;
  const transition = await transitionSop(context.env.DB, {
    sopId: getRouteParam(context, "id"),
    versionId: payload?.versionId,
    actorUserId: payload?.actorUserId || auth.user?.id,
    notes: payload?.notes || "Archived.",
    action: "archive"
  });
  if (!transition) return failure("NOT_FOUND", "SOP not found.", 404);
  return success({ transition }, "SOP archived.");
}, "onRequestPost");

// api/sops/[id]/feedback.ts
var onRequestPost4 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const [payload, parseError] = await readBody(context.request);
  if (parseError) return parseError;
  const id = getRouteParam(context, "id");
  if (!id) return failure("VALIDATION_ERROR", "SOP id is required.", 400, { id: "Required" });
  if (typeof payload?.isHelpful !== "boolean") {
    return failure("VALIDATION_ERROR", "Feedback must specify whether the SOP was helpful.", 400, {
      isHelpful: "Required"
    });
  }
  const sop = await context.env.DB.prepare("SELECT id FROM sops WHERE id = ?").bind(id).first();
  if (!sop) return failure("NOT_FOUND", "SOP not found.", 404);
  const feedbackId = newId("feedback");
  const now = unixNow();
  const helpful = payload.isHelpful ? 1 : 0;
  await context.env.DB.prepare(
    `INSERT INTO sop_feedback (id, sop_id, user_id, is_helpful, comment, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(feedbackId, id, payload.userId || null, helpful, optionalText(payload.comment, 1e3), now).run();
  await context.env.DB.prepare(
    `UPDATE sops
     SET helpful_count = COALESCE(helpful_count, 0) + ?,
         not_helpful_count = COALESCE(not_helpful_count, 0) + ?
     WHERE id = ?`
  ).bind(helpful ? 1 : 0, helpful ? 0 : 1, id).run();
  return success({ id: feedbackId }, "Feedback saved.", 201);
}, "onRequestPost");

// api/sops/[id]/publish.ts
var onRequestPost5 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Publish SOPs");
  if (auth.response) return auth.response;
  const ownership = await requireSopOwnership(context, auth.user, getRouteParam(context, "id"));
  if (ownership.response) return ownership.response;
  const [payload, parseError] = await readBody(context.request);
  if (parseError) return parseError;
  const transition = await transitionSop(context.env.DB, {
    sopId: getRouteParam(context, "id"),
    versionId: payload?.versionId,
    actorUserId: payload?.actorUserId || auth.user?.id,
    notes: payload?.notes || "Published.",
    action: "publish"
  });
  if (!transition) return failure("NOT_FOUND", "SOP not found.", 404);
  return success({ transition }, "SOP published.");
}, "onRequestPost");

// api/sops/[id]/request-changes.ts
var onRequestPost6 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Request Changes");
  if (auth.response) return auth.response;
  const ownership = await requireSopOwnership(context, auth.user, getRouteParam(context, "id"));
  if (ownership.response) return ownership.response;
  const [payload, parseError] = await readBody(context.request);
  if (parseError) return parseError;
  const transition = await transitionSop(context.env.DB, {
    sopId: getRouteParam(context, "id"),
    versionId: payload?.versionId,
    actorUserId: payload?.actorUserId || auth.user?.id,
    notes: payload?.notes || "Changes requested.",
    action: "request-changes"
  });
  if (!transition) return failure("NOT_FOUND", "SOP not found.", 404);
  return success({ transition }, "Changes requested.");
}, "onRequestPost");

// api/sops/[id]/submit-review.ts
var onRequestPost7 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Edit Drafts");
  if (auth.response) return auth.response;
  const ownership = await requireSopOwnership(context, auth.user, getRouteParam(context, "id"));
  if (ownership.response) return ownership.response;
  const [payload, parseError] = await readBody(context.request);
  if (parseError) return parseError;
  const transition = await transitionSop(context.env.DB, {
    sopId: getRouteParam(context, "id"),
    versionId: payload?.versionId,
    actorUserId: payload?.actorUserId || auth.user?.id,
    notes: payload?.notes || "Submitted for review.",
    action: "submit-review"
  });
  if (!transition) return failure("NOT_FOUND", "SOP not found.", 404);
  return success({ transition }, "SOP submitted for review.");
}, "onRequestPost");

// api/sops/[id]/versions.ts
function listValue(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "").split(/[\n,|]/).map((item) => item.trim()).filter(Boolean);
}
__name(listValue, "listValue");
var onRequestGet3 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const sopId = getRouteParam(context, "id");
  const result = await context.env.DB.prepare(
    `SELECT
      id,
      sop_id AS sopId,
      version_label AS versionLabel,
      version_number AS versionNumber,
      title,
      summary,
      purpose,
      COALESCE(content, body_markdown) AS content,
      before_you_begin AS beforeYouBegin,
      checklist,
      troubleshooting,
      change_summary AS changeSummary,
      status,
      created_by_user_id AS createdByUserId,
      created_by AS createdBy,
      created_at AS createdAt,
      updated_at AS updatedAt,
      reviewed_at AS reviewedAt,
      approved_at AS approvedAt,
      published_at AS publishedAt
     FROM sop_versions
     WHERE sop_id = ?
     ORDER BY created_at DESC`
  ).bind(sopId).all();
  return success({ versions: result.results || [] });
}, "onRequestGet");
var onRequestPost8 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Edit Drafts");
  if (auth.response) return auth.response;
  const sopId = getRouteParam(context, "id");
  const ownership = await requireSopOwnership(context, auth.user, sopId);
  if (ownership.response) return ownership.response;
  const [payload, parseError] = await readBody(context.request);
  if (parseError) return parseError;
  const fields = {};
  const title = optionalText(payload?.title, 180);
  const purpose = optionalText(payload?.purpose || payload?.summary, 4e3);
  const content = optionalText(payload?.content || purpose, 5e4);
  if (!title) fields.title = "Title is required.";
  if (!purpose) fields.purpose = "Purpose is required.";
  if (!content) fields.content = "Content is required.";
  if (Object.keys(fields).length) return failure("VALIDATION_ERROR", "Please correct the highlighted fields.", 400, fields);
  const versionCount = await context.env.DB.prepare("SELECT COUNT(*) AS total FROM sop_versions WHERE sop_id = ?").bind(sopId).first();
  const versionNumber = `0.${Number(versionCount?.total || 0) + 1}`;
  const id = newId("version");
  const now = unixNow();
  const nowIso2 = new Date(now * 1e3).toISOString();
  const metadata = JSON.stringify({
    tools: listValue(payload?.tools),
    audience: listValue(payload?.audience)
  });
  await context.env.DB.prepare(
    `INSERT INTO sop_versions (
      id, sop_id, version_label, version_number, title, summary, purpose, body_markdown,
      content, before_you_begin, checklist, troubleshooting, metadata_json, change_summary,
      status, created_by_user_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    sopId,
    versionNumber,
    versionNumber,
    title,
    optionalText(payload?.summary || purpose, 1e3),
    purpose,
    content,
    content,
    optionalText(payload?.beforeYouBegin, 4e3),
    optionalText(payload?.checklist, 8e3),
    optionalText(payload?.troubleshooting, 8e3),
    metadata,
    optionalText(payload?.changeSummary || "Draft version created.", 2e3),
    "Draft",
    payload?.actorUserId || auth.user?.id || null,
    payload?.actorUserId || auth.user?.id || null,
    nowIso2,
    now
  ).run();
  await context.env.DB.prepare(
    "UPDATE sops SET current_version_id = ?, status = 'Draft', updated_at = ? WHERE id = ?"
  ).bind(id, nowIso2, sopId).run();
  return success({ version: { id, sopId, versionNumber } }, "SOP version created.", 201);
}, "onRequestPost");

// api/sops/[id]/view.ts
var onRequestPost9 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const id = getRouteParam(context, "id");
  if (!id) return failure("VALIDATION_ERROR", "SOP id is required.", 400, { id: "Required" });
  const sop = await context.env.DB.prepare("SELECT id, current_version_id FROM sops WHERE id = ?").bind(id).first();
  if (!sop) return failure("NOT_FOUND", "SOP not found.", 404);
  const now = unixNow();
  await context.env.DB.prepare("UPDATE sops SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?").bind(id).run();
  await context.env.DB.prepare(
    `INSERT INTO sop_view_events (id, sop_id, sop_version_id, source, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(newId("sop-view"), id, sop.current_version_id || null, "Direct", now).run();
  return success({ id }, "SOP view recorded.");
}, "onRequestPost");

// api/admin/categories.ts
function categorySelect() {
  return `SELECT
    id,
    name,
    slug,
    description,
    icon,
    color,
    sort_order AS sortOrder,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM categories`;
}
__name(categorySelect, "categorySelect");
var onRequestGet4 = /* @__PURE__ */ __name(async (context) => {
  const { env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Categories");
  if (auth.response) return auth.response;
  const db = env.DB;
  const result = await db.prepare(`${categorySelect()} ORDER BY sort_order ASC, name ASC`).all();
  return jsonResponse({ categories: result.results || [] });
}, "onRequestGet");
var onRequestPost10 = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Categories");
  if (auth.response) return auth.response;
  const db = env.DB;
  const [payload, parseError] = await readJsonBody(request);
  if (parseError) return parseError;
  const name = String(payload?.name || "").trim();
  if (!name) return jsonResponse({ error: "Category name is required." }, 400);
  const slug = slugify(String(payload?.slug || name), "category");
  const id = payload?.id || idFrom(slug, "category");
  await db.prepare(
    `INSERT INTO categories (id, name, slug, description, icon, color, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  ).bind(
    id,
    name,
    slug,
    String(payload?.description || ""),
    String(payload?.icon || ""),
    String(payload?.color || "#f8fafc"),
    Number(payload?.sortOrder || 0)
  ).run();
  const category = await db.prepare(`${categorySelect()} WHERE id = ?`).bind(id).first();
  return jsonResponse({ category }, 201);
}, "onRequestPost");
var onRequestPut = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Categories");
  if (auth.response) return auth.response;
  const db = env.DB;
  const [payload, parseError] = await readJsonBody(request);
  if (parseError) return parseError;
  const originalSlug = String(payload?.originalSlug || payload?.slug || "").trim();
  const name = String(payload?.name || "").trim();
  if (!originalSlug) return jsonResponse({ error: "originalSlug is required." }, 400);
  if (!name) return jsonResponse({ error: "Category name is required." }, 400);
  const slug = slugify(String(payload?.slug || name), "category");
  const existing = await db.prepare("SELECT id, sort_order FROM categories WHERE slug = ?").bind(originalSlug).first();
  if (!existing) return jsonResponse({ error: "Category not found." }, 404);
  await db.prepare(
    `UPDATE categories
     SET name = ?, slug = ?, description = ?, icon = ?, color = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(
    name,
    slug,
    String(payload?.description || ""),
    String(payload?.icon || ""),
    String(payload?.color || "#f8fafc"),
    Number(payload?.sortOrder ?? existing.sort_order ?? 0),
    existing.id
  ).run();
  const category = await db.prepare(`${categorySelect()} WHERE id = ?`).bind(existing.id).first();
  return jsonResponse({ category });
}, "onRequestPut");
var onRequestDelete = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Categories");
  if (auth.response) return auth.response;
  const db = env.DB;
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  if (!slug) return jsonResponse({ error: "slug is required." }, 400);
  const category = await db.prepare("SELECT id FROM categories WHERE slug = ?").bind(slug).first();
  if (!category) return jsonResponse({ error: "Category not found." }, 404);
  await db.prepare("DELETE FROM categories WHERE id = ?").bind(category.id).run();
  return jsonResponse({ ok: true });
}, "onRequestDelete");

// api/admin/tags.ts
var allowedStatuses = /* @__PURE__ */ new Set(["Active", "Needs Review", "Deprecated"]);
function tagSelect() {
  return `SELECT
    tags.id,
    tags.name,
    tags.slug,
    tags.status,
    tags.notes,
    tags.created_at AS createdAt,
    tags.updated_at AS updatedAt,
    COUNT(sop_tags.sop_id) AS usageCount
  FROM tags
  LEFT JOIN sop_tags ON sop_tags.tag_id = tags.id`;
}
__name(tagSelect, "tagSelect");
var onRequestGet5 = /* @__PURE__ */ __name(async (context) => {
  const { env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Tags");
  if (auth.response) return auth.response;
  const db = env.DB;
  const result = await db.prepare(
    `${tagSelect()}
     GROUP BY tags.id
     ORDER BY tags.name ASC`
  ).all();
  return jsonResponse({ tags: result.results || [] });
}, "onRequestGet");
var onRequestPost11 = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Tags");
  if (auth.response) return auth.response;
  const db = env.DB;
  const [payload, parseError] = await readJsonBody(request);
  if (parseError) return parseError;
  const name = String(payload?.name || "").trim();
  if (!name) return jsonResponse({ error: "Tag name is required." }, 400);
  const slug = slugify(String(payload?.slug || name), "tag");
  const status = allowedStatuses.has(String(payload?.status)) ? payload?.status : "Active";
  const id = payload?.id || idFrom(slug, "tag");
  await db.prepare(
    `INSERT INTO tags (id, name, slug, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  ).bind(id, name, slug, status, String(payload?.notes || "")).run();
  const tag = await db.prepare(`${tagSelect()} WHERE tags.id = ? GROUP BY tags.id`).bind(id).first();
  return jsonResponse({ tag }, 201);
}, "onRequestPost");
var onRequestPut2 = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Tags");
  if (auth.response) return auth.response;
  const db = env.DB;
  const [payload, parseError] = await readJsonBody(request);
  if (parseError) return parseError;
  const originalName = String(payload?.originalName || payload?.name || "").trim();
  const name = String(payload?.name || "").trim();
  if (!originalName) return jsonResponse({ error: "originalName is required." }, 400);
  if (!name) return jsonResponse({ error: "Tag name is required." }, 400);
  const status = allowedStatuses.has(String(payload?.status)) ? payload?.status : "Active";
  const slug = slugify(String(payload?.slug || name), "tag");
  const existing = await db.prepare("SELECT id FROM tags WHERE name = ?").bind(originalName).first();
  if (!existing) return jsonResponse({ error: "Tag not found." }, 404);
  await db.prepare(
    `UPDATE tags
     SET name = ?, slug = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(name, slug, status, String(payload?.notes || ""), existing.id).run();
  const tag = await db.prepare(`${tagSelect()} WHERE tags.id = ? GROUP BY tags.id`).bind(existing.id).first();
  return jsonResponse({ tag });
}, "onRequestPut");
var onRequestDelete2 = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Tags");
  if (auth.response) return auth.response;
  const db = env.DB;
  const name = new URL(request.url).searchParams.get("name");
  if (!name) return jsonResponse({ error: "name is required." }, 400);
  const tag = await db.prepare("SELECT id FROM tags WHERE name = ?").bind(name).first();
  if (!tag) return jsonResponse({ error: "Tag not found." }, 404);
  await db.prepare("DELETE FROM tags WHERE id = ?").bind(tag.id).run();
  return jsonResponse({ ok: true });
}, "onRequestDelete");

// api/admin/users.ts
var accessLevels = /* @__PURE__ */ new Set(["Normal User", "Creator / Reviewer", "Admin"]);
var statuses = /* @__PURE__ */ new Set(["Active", "Pending", "Suspended", "Archived"]);
function usersSelect() {
  return `SELECT
    users.id,
    users.name,
    users.email,
    users.department,
    users.title,
    users.access_level AS accessLevel,
    users.status,
    users.role_id AS roleId,
    roles.permissions_json AS permissionsJson,
    users.created_at AS createdAt,
    users.updated_at AS updatedAt
  FROM users
  LEFT JOIN roles ON roles.id = users.role_id`;
}
__name(usersSelect, "usersSelect");
function rolesSelect() {
  return `SELECT
    id,
    name,
    description,
    permissions_json AS permissionsJson,
    access_level AS accessLevel,
    access_group AS accessGroup,
    landing_page AS landingPage,
    status,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM roles`;
}
__name(rolesSelect, "rolesSelect");
function normalizeUser(row) {
  return {
    ...row,
    permissions: listFromJson(String(row.permissionsJson || "[]")),
    permissionsJson: void 0,
    roleIds: row.roleId ? [row.roleId] : []
  };
}
__name(normalizeUser, "normalizeUser");
function normalizeRole2(row) {
  return {
    ...row,
    permissions: listFromJson(String(row.permissionsJson || "[]")),
    permissionsJson: void 0
  };
}
__name(normalizeRole2, "normalizeRole");
async function roleForAccessLevel(db, accessLevel) {
  return await db.prepare("SELECT id FROM roles WHERE access_level = ? AND status != 'Archived' LIMIT 1").bind(accessLevel).first();
}
__name(roleForAccessLevel, "roleForAccessLevel");
async function replaceUserRole(db, userId, roleId) {
  await db.prepare("DELETE FROM user_roles WHERE user_id = ?").bind(userId).run();
  if (roleId) {
    await db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)").bind(userId, roleId).run();
  }
}
__name(replaceUserRole, "replaceUserRole");
var onRequestGet6 = /* @__PURE__ */ __name(async (context) => {
  const { env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Users");
  if (auth.response) return auth.response;
  const db = env.DB;
  const [usersResult, rolesResult] = await Promise.all([
    db.prepare(`${usersSelect()} ORDER BY users.name ASC`).all(),
    db.prepare(`${rolesSelect()} ORDER BY CASE access_level WHEN 'Normal User' THEN 1 WHEN 'Creator / Reviewer' THEN 2 WHEN 'Admin' THEN 3 ELSE 4 END`).all()
  ]);
  return jsonResponse({
    users: (usersResult.results || []).map(normalizeUser),
    roles: (rolesResult.results || []).map(normalizeRole2)
  });
}, "onRequestGet");
var onRequestPost12 = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Users");
  if (auth.response) return auth.response;
  const db = env.DB;
  const url = new URL(request.url);
  if (url.searchParams.get("type") === "role") return saveRole(request, db, false);
  return saveUser(request, db, false);
}, "onRequestPost");
var onRequestPut3 = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Users");
  if (auth.response) return auth.response;
  const db = env.DB;
  const url = new URL(request.url);
  if (url.searchParams.get("type") === "role") return saveRole(request, db, true);
  return saveUser(request, db, true);
}, "onRequestPut");
var onRequestDelete3 = /* @__PURE__ */ __name(async (context) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Users");
  if (auth.response) return auth.response;
  const db = env.DB;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonResponse({ error: "id is required." }, 400);
  await db.prepare("UPDATE users SET status = 'Archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  return jsonResponse({ ok: true });
}, "onRequestDelete");
async function saveUser(request, db, isUpdate) {
  const [payload, parseError] = await readJsonBody(request);
  if (parseError) return parseError;
  const name = String(payload?.name || "").trim();
  const email = String(payload?.email || "").trim().toLowerCase();
  if (!name) return jsonResponse({ error: "User name is required." }, 400);
  if (!email) return jsonResponse({ error: "Email is required." }, 400);
  const accessLevel = accessLevels.has(String(payload?.accessLevel)) ? String(payload?.accessLevel) : "Normal User";
  const status = statuses.has(String(payload?.status)) ? String(payload?.status) : "Active";
  const id = payload?.id || idFrom(email, "user");
  const role = await roleForAccessLevel(db, accessLevel);
  if (isUpdate) {
    await db.prepare(
      `UPDATE users
       SET name = ?, email = ?, department = ?, title = ?, access_level = ?, role_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      name,
      email,
      String(payload?.department || ""),
      String(payload?.title || ""),
      accessLevel,
      role?.id || null,
      status,
      id
    ).run();
  } else {
    await db.prepare(
      `INSERT INTO users (id, name, email, department, title, access_level, role_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(
      id,
      name,
      email,
      String(payload?.department || ""),
      String(payload?.title || ""),
      accessLevel,
      role?.id || null,
      status
    ).run();
  }
  await replaceUserRole(db, id, role?.id || null);
  const user = await db.prepare(`${usersSelect()} WHERE users.id = ?`).bind(id).first();
  return jsonResponse({ user: user ? normalizeUser(user) : null }, isUpdate ? 200 : 201);
}
__name(saveUser, "saveUser");
async function saveRole(request, db, isUpdate) {
  const [payload, parseError] = await readJsonBody(request);
  if (parseError) return parseError;
  const id = String(payload?.id || "").trim();
  const name = String(payload?.name || "").trim();
  if (!id) return jsonResponse({ error: "Role id is required." }, 400);
  if (!name) return jsonResponse({ error: "Role name is required." }, 400);
  const permissionsJson = JSON.stringify(payload?.permissions || []);
  const current = await db.prepare("SELECT access_level FROM roles WHERE id = ?").bind(id).first();
  if (!current && isUpdate) return jsonResponse({ error: "Role not found." }, 404);
  if (isUpdate) {
    await db.prepare(
      `UPDATE roles
       SET name = ?, description = ?, permissions_json = ?, access_group = ?, landing_page = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      name,
      String(payload?.description || ""),
      permissionsJson,
      String(payload?.accessGroup || ""),
      String(payload?.landingPage || ""),
      id
    ).run();
  } else {
    await db.prepare(
      `INSERT INTO roles (id, name, description, permissions_json, access_group, landing_page, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(
      id,
      name,
      String(payload?.description || ""),
      permissionsJson,
      String(payload?.accessGroup || ""),
      String(payload?.landingPage || "")
    ).run();
  }
  const role = await db.prepare(`${rolesSelect()} WHERE id = ?`).bind(id).first();
  return jsonResponse({ role: role ? normalizeRole2(role) : null }, isUpdate ? 200 : 201);
}
__name(saveRole, "saveRole");

// api/analytics/summary.ts
async function safeAll(env, query) {
  if (!env.DB) return [];
  try {
    const result = await env.DB.prepare(query).all();
    return result.results || [];
  } catch {
    return [];
  }
}
__name(safeAll, "safeAll");
async function safeFirst(env, query) {
  if (!env.DB) return null;
  try {
    return await env.DB.prepare(query).first();
  } catch {
    return null;
  }
}
__name(safeFirst, "safeFirst");
var onRequestGet7 = /* @__PURE__ */ __name(async (context) => {
  const { env } = context;
  if (!env.DB) return jsonResponse({ error: "D1 database binding DB is not available." }, 503);
  const auth = await requirePermission(context, "View Analytics");
  if (auth.response) return auth.response;
  const [
    totals,
    mostViewedSops,
    mostSearchedTerms,
    noResultSearches,
    categoryCounts,
    helpfulRatings,
    mediaSummary,
    pageViews,
    pastReview
  ] = await Promise.all([
    safeFirst(
      env,
      `SELECT
        (SELECT COUNT(*) FROM page_view_events) AS page_views,
        (SELECT COUNT(*) FROM sop_view_events) AS sop_views,
        (SELECT COUNT(*) FROM search_logs) AS searches,
        (SELECT COUNT(*) FROM media_assets WHERE status = 'Active') AS uploads,
        (SELECT COUNT(*) FROM feedback) AS feedback_count`
    ),
    safeAll(
      env,
      `SELECT sops.id AS sop_id, sops.title, COUNT(sop_view_events.id) AS views
       FROM sop_view_events
       JOIN sops ON sops.id = sop_view_events.sop_id
       GROUP BY sops.id, sops.title
       ORDER BY views DESC, sops.title ASC
       LIMIT 10`
    ),
    safeAll(
      env,
      `SELECT query, COUNT(*) AS searches
       FROM search_logs
       WHERE no_results = 0
       GROUP BY query
       ORDER BY searches DESC, query ASC
       LIMIT 10`
    ),
    safeAll(
      env,
      `SELECT query, COUNT(*) AS searches
       FROM search_logs
       WHERE no_results = 1
       GROUP BY query
       ORDER BY searches DESC, query ASC
       LIMIT 10`
    ),
    safeAll(
      env,
      `SELECT COALESCE(categories.name, 'Uncategorized') AS category, COUNT(sops.id) AS count
       FROM sops
       LEFT JOIN categories ON categories.id = sops.category_id
       GROUP BY category
       ORDER BY count DESC, category ASC`
    ),
    safeAll(
      env,
      `SELECT rating, COUNT(*) AS count
       FROM feedback
       GROUP BY rating`
    ),
    safeAll(
      env,
      `SELECT asset_type, COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes
       FROM media_assets
       WHERE status = 'Active'
       GROUP BY asset_type
       ORDER BY count DESC`
    ),
    safeAll(
      env,
      `SELECT path, COUNT(*) AS views
       FROM page_view_events
       GROUP BY path
       ORDER BY views DESC, path ASC
       LIMIT 10`
    ),
    safeAll(
      env,
      `SELECT id, title, review_date, status
       FROM sops
       WHERE review_date IS NOT NULL
         AND review_date < DATE('now')
         AND status != 'Archived'
       ORDER BY review_date ASC
       LIMIT 20`
    )
  ]);
  return jsonResponse({
    source: "Cloudflare D1",
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    totals: totals || {
      page_views: 0,
      sop_views: 0,
      searches: 0,
      uploads: 0,
      feedback_count: 0
    },
    mostViewedSops,
    mostSearchedTerms,
    noResultSearches,
    categoryCounts,
    helpfulRatings,
    mediaSummary,
    pageViews,
    pastReview
  });
}, "onRequestGet");

// api/analytics/track.ts
var allowedPaths = /* @__PURE__ */ new Set(["Direct", "Search", "Guided Finder", "Related SOP", "Admin", "External"]);
var onRequestPost13 = /* @__PURE__ */ __name(async ({ request, env }) => {
  if (!env.DB) return jsonResponse({ error: "D1 database binding DB is not available." }, 503);
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Send valid JSON." }, 400);
  }
  const eventType = payload.eventType;
  const userAgent = request.headers.get("user-agent") || "";
  const ipAddress = getClientIp(request);
  const sessionId = String(payload.sessionId || "") || null;
  const userId = String(payload.userId || "") || null;
  if (!eventType) return jsonResponse({ error: "eventType is required." }, 400);
  if (eventType === "page_view") {
    await env.DB.prepare(
      `INSERT INTO page_view_events (id, user_id, path, referrer, user_agent, session_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      newId("pageview"),
      userId,
      String(payload.path || "/"),
      String(payload.referrer || ""),
      userAgent,
      sessionId
    ).run();
  }
  if (eventType === "sop_view" && payload.sopId) {
    const source = allowedPaths.has(String(payload.source)) ? String(payload.source) : "Direct";
    await env.DB.prepare(
      `INSERT INTO sop_view_events (id, sop_id, sop_version_id, user_id, session_id, source)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(newId("sopview"), payload.sopId, payload.sopVersionId || null, userId, sessionId, source).run();
  }
  if (eventType === "sop_export" && payload.sopId) {
    await env.DB.prepare(
      `INSERT INTO sop_export_events (id, sop_id, user_id, export_type)
       VALUES (?, ?, ?, ?)`
    ).bind(newId("export"), payload.sopId, userId, payload.exportType || "Copy Link").run();
  }
  if (eventType === "search" && payload.query) {
    const resultsCount = Number(payload.resultsCount || 0);
    await env.DB.prepare(
      `INSERT INTO search_logs (
        id, user_id, query, filters_json, results_count, clicked_sop_id, no_results
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      newId("search"),
      userId,
      String(payload.query).slice(0, 250),
      JSON.stringify(payload.filters || {}),
      resultsCount,
      payload.clickedSopId || null,
      resultsCount === 0 ? 1 : 0
    ).run();
  }
  if (eventType === "feedback" && payload.sopId && payload.rating) {
    await env.DB.prepare(
      `INSERT INTO feedback (id, sop_id, user_id, rating, comment)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(newId("feedback"), payload.sopId, userId, payload.rating, payload.comment || null).run();
  }
  env.SOP_ANALYTICS?.writeDataPoint({
    blobs: [
      eventType,
      String(payload.path || ""),
      String(payload.sopId || ""),
      String(payload.query || ""),
      String(payload.rating || "")
    ],
    doubles: [1, Number(payload.resultsCount || 0)],
    indexes: [sessionId || userId || ipAddress || "anonymous"]
  });
  return jsonResponse({ ok: true });
}, "onRequestPost");

// api/search/facets.ts
var onRequestGet8 = /* @__PURE__ */ __name(async ({ request, env }) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  try {
    const selectedSubRole = await resolveRequestedCreatorSubRole(env.DB, request);
    const facets = await listSopFacets(env.DB, { ownerSubRoleId: selectedSubRole?.id });
    return new Response(JSON.stringify({ success: true, data: { facets }, facets }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders(selectedSubRole ? "private" : "public"),
        vary: "x-sop-sub-role"
      }
    });
  } catch (error) {
    return failure(
      "SEARCH_FACETS_READ_FAILED",
      error instanceof Error ? error.message : "Unable to load search filters.",
      500
    );
  }
}, "onRequestGet");

// api/search/log.ts
var onRequestPost14 = /* @__PURE__ */ __name(async ({ request, env }) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const [payload, parseError] = await readBody(request);
  if (parseError) return parseError;
  const query = optionalText(payload?.query, 240);
  if (!query) return failure("VALIDATION_ERROR", "Search query is required.", 400, { query: "Required" });
  const resultCount = Math.max(0, Number(payload?.resultCount || 0));
  const id = newId("search");
  const now = unixNow();
  await env.DB.prepare(
    `INSERT INTO search_logs (id, user_id, query, filters_json, results_count, no_results, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, payload?.userId || null, query, JSON.stringify(payload?.filters || {}), resultCount, resultCount === 0 ? 1 : 0, now).run();
  return success({ id }, "Search logged.", 201);
}, "onRequestPost");

// api/sops/popular.ts
var onRequestGet9 = /* @__PURE__ */ __name(async ({ request, env }) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || "10");
    const selectedSubRole = await resolveRequestedCreatorSubRole(env.DB, request);
    const sops = await listSops(env.DB, {
      sort: "popular",
      limit,
      publicOnly: true,
      ownerSubRoleId: selectedSubRole?.id
    });
    return new Response(JSON.stringify({ success: true, data: { sops }, sops }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders(selectedSubRole ? "private" : "public"),
        vary: "x-sop-sub-role"
      }
    });
  } catch (error) {
    return failure("POPULAR_SOPS_FAILED", error instanceof Error ? error.message : "Unable to load popular SOPs.", 500);
  }
}, "onRequestGet");

// api/sops/recent.ts
var onRequestGet10 = /* @__PURE__ */ __name(async ({ request, env }) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || "10");
    const selectedSubRole = await resolveRequestedCreatorSubRole(env.DB, request);
    const sops = await listSops(env.DB, {
      sort: "recent",
      limit,
      publicOnly: true,
      ownerSubRoleId: selectedSubRole?.id
    });
    return new Response(JSON.stringify({ success: true, data: { sops }, sops }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders(selectedSubRole ? "private" : "public"),
        vary: "x-sop-sub-role"
      }
    });
  } catch (error) {
    return failure("RECENT_SOPS_FAILED", error instanceof Error ? error.message : "Unable to load recent SOPs.", 500);
  }
}, "onRequestGet");

// api/guides/[slug].ts
function routeParam2(context, key) {
  const params = context.params;
  const value = params?.[key];
  return Array.isArray(value) ? value[0] : value || "";
}
__name(routeParam2, "routeParam");
var onRequestGet11 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  try {
    const slug = routeParam2(context, "slug");
    const guide = await getDecisionGuide(context.env.DB, slug);
    if (!guide) return failure("GUIDE_NOT_FOUND", "Decision guide not found.", 404);
    return new Response(JSON.stringify({ success: true, data: { guide }, guide }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders("public")
      }
    });
  } catch (error) {
    return failure(
      "GUIDE_READ_FAILED",
      error instanceof Error ? error.message : "Unable to load decision guide.",
      500
    );
  }
}, "onRequestGet");

// api/sop-requests/[id].ts
var priorities = /* @__PURE__ */ new Set(["Low", "Medium", "High", "Urgent"]);
var statuses2 = /* @__PURE__ */ new Set(["new", "triage", "assigned", "drafting", "in_review", "needs_revision", "approved", "published", "archived"]);
function selectRequest() {
  return `SELECT
    sop_requests.id,
    sop_requests.request_type AS requestType,
    sop_requests.requested_title AS requestedTitle,
    sop_requests.department_name AS departmentName,
    sop_requests.submitted_by_name AS submittedByName,
    sop_requests.submitted_by_email AS submittedByEmail,
    sop_requests.role_title AS roleTitle,
    sop_requests.description,
    sop_requests.priority,
    sop_requests.desired_completion_at AS desiredCompletionAt,
    sop_requests.existing_sop_id AS existingSopId,
    sops.title AS existingSopTitle,
    sop_requests.draft_content AS draftContent,
    sop_requests.related_links AS relatedLinks,
    sop_requests.documentation_location AS documentationLocation,
    sop_requests.status,
    sop_requests.assigned_to AS assignedTo,
    assignee.name AS assignedToName,
    sop_requests.created_at AS createdAt,
    sop_requests.updated_at AS updatedAt
  FROM sop_requests
  LEFT JOIN sops ON sops.id = sop_requests.existing_sop_id
  LEFT JOIN users assignee ON assignee.id = sop_requests.assigned_to
  WHERE sop_requests.id = ?`;
}
__name(selectRequest, "selectRequest");
var onRequestGet12 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const user = await getAuthUser(context);
  if (!user) return failure("UNAUTHENTICATED", "Sign in before using this API.", 401);
  const id = getRouteParam(context, "id");
  const request = await context.env.DB.prepare(selectRequest()).bind(id).first();
  if (!request) return failure("NOT_FOUND", "SOP request not found.", 404);
  if (user.role === "normal" && String(request.submittedByEmail || "").toLowerCase() !== user.email) {
    return failure("FORBIDDEN", "You can only view your own SOP requests.", 403);
  }
  return success({ request });
}, "onRequestGet");
var onRequestPut4 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Review SOPs");
  if (auth.response) return auth.response;
  const id = getRouteParam(context, "id");
  const [payload, parseError] = await readBody(context.request);
  if (parseError) return parseError;
  const status = statuses2.has(String(payload?.status)) ? String(payload?.status) : "triage";
  const priority = priorities.has(String(payload?.priority)) ? String(payload?.priority) : "Medium";
  const now = unixNow();
  await context.env.DB.prepare(
    `UPDATE sop_requests
     SET status = ?, priority = ?, assigned_to = ?, updated_at = ?
     WHERE id = ?`
  ).bind(status, priority, optionalText(payload?.assignedTo, 120) || null, now, id).run();
  const request = await context.env.DB.prepare(selectRequest()).bind(id).first();
  return success({ request }, "SOP request updated.");
}, "onRequestPut");

// api/sops/[id].ts
var onRequestGet13 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const id = getRouteParam(context, "id");
  const user = await getAuthUser(context);
  const publicOnly = !user || user.role === "normal";
  const sop = await getSopById(context.env.DB, id, publicOnly);
  if (!sop) return failure("NOT_FOUND", "SOP not found.", 404);
  const selectedSubRole = await resolveRequestedCreatorSubRole(context.env.DB, context.request);
  if (selectedSubRole && sop.ownerSubRoleId !== selectedSubRole.id) {
    return failure(
      "SOP_OWNERSHIP_REQUIRED",
      "This SOP belongs to another department. Switch back to Normal User mode to view it without creator/reviewer controls.",
      403
    );
  }
  return new Response(JSON.stringify({ success: true, data: { sop }, sop }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...cacheHeaders(selectedSubRole || !publicOnly ? "private" : "public"),
      vary: "x-sop-sub-role"
    }
  });
}, "onRequestGet");
function listValue2(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "").split(/[\n,|]/).map((item) => item.trim()).filter(Boolean);
}
__name(listValue2, "listValue");
var onRequestPut5 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Edit Drafts");
  if (auth.response) return auth.response;
  const id = getRouteParam(context, "id");
  const existing = await getSopById(context.env.DB, id, false);
  if (!existing) return failure("NOT_FOUND", "SOP not found.", 404);
  const ownership = await requireSopOwnership(context, auth.user, id);
  if (ownership.response) return ownership.response;
  const selectedSubRole = ownership.subRole || await resolveRequestedCreatorSubRole(context.env.DB, context.request);
  const [payload, parseError] = await readBody(context.request);
  if (parseError) return parseError;
  const now = unixNow();
  const nowIso2 = new Date(now * 1e3).toISOString();
  const title = optionalText(payload?.title || existing.title, 180);
  const purpose = optionalText(payload?.purpose || existing.purpose, 4e3);
  const summary = optionalText(payload?.summary || existing.summary || purpose, 1e3);
  const audience = listValue2(payload?.audience).join("|") || (Array.isArray(existing.audience) ? existing.audience.join("|") : "");
  const tools = listValue2(payload?.tools);
  const metadata = JSON.stringify({
    audience: listValue2(payload?.audience),
    tools,
    tags: listValue2(payload?.tags)
  });
  const content = optionalText(payload?.content || existing.bodyMarkdown || purpose, 5e4);
  const estimatedMinutes = Number(payload?.estimatedMinutes || existing.estimatedMinutes || 0) || null;
  const reviewDueAt = typeof payload?.reviewDueAt === "number" ? payload.reviewDueAt : payload?.reviewDueAt ? Math.floor(new Date(String(payload.reviewDueAt)).getTime() / 1e3) : payload?.reviewDate ? Math.floor((/* @__PURE__ */ new Date(`${String(payload.reviewDate)}T00:00:00`)).getTime() / 1e3) : null;
  await context.env.DB.prepare(
    `UPDATE sops
     SET title = ?, summary = ?, purpose = ?, category_id = ?, owner_id = ?, owner_user_id = ?,
         owner_team_id = ?, owner_sub_role_id = ?, estimated_minutes = ?, estimated_completion_time = ?, audience = ?,
         type = ?, review_date = COALESCE(?, review_date), review_due_at = COALESCE(?, review_due_at), updated_at = ?
     WHERE id = ?`
  ).bind(
    title,
    summary,
    purpose,
    payload?.categoryId || existing.categoryId || null,
    payload?.ownerId || existing.ownerId || null,
    payload?.ownerId || existing.ownerId || null,
    payload?.ownerTeamId || selectedSubRole?.teamId || null,
    selectedSubRole?.id || existing.ownerSubRoleId || null,
    estimatedMinutes,
    optionalText(payload?.estimatedCompletionTime, 120) || (estimatedMinutes ? `${estimatedMinutes} minutes` : existing.estimatedCompletionTime || null),
    audience,
    optionalText(payload?.type || existing.type || "Process", 80),
    optionalText(payload?.reviewDate, 40) || null,
    Number.isFinite(reviewDueAt) ? reviewDueAt : null,
    nowIso2,
    id
  ).run();
  if (existing.currentVersionId) {
    await context.env.DB.prepare(
      `UPDATE sop_versions
       SET title = ?, summary = ?, purpose = ?, body_markdown = ?, content = ?,
           before_you_begin = COALESCE(?, before_you_begin),
           checklist = COALESCE(?, checklist),
           troubleshooting = COALESCE(?, troubleshooting),
           metadata_json = ?, change_summary = COALESCE(?, change_summary), updated_at = ?
       WHERE id = ?`
    ).bind(
      title,
      summary,
      purpose,
      content,
      content,
      optionalText(payload?.beforeYouBegin, 4e3) || null,
      optionalText(payload?.checklist, 8e3) || null,
      optionalText(payload?.troubleshooting, 8e3) || null,
      metadata,
      optionalText(payload?.changeSummary, 2e3) || null,
      now,
      existing.currentVersionId
    ).run();
  }
  await context.env.DB.prepare(
    `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, after_json, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    newId("audit"),
    payload?.actorUserId || auth.user?.id || null,
    "update_sop",
    "sop",
    id,
    JSON.stringify({ title, summary, purpose }),
    "SOP metadata updated through API.",
    now
  ).run();
  const sop = await getSopById(context.env.DB, id, false);
  return success({ sop }, "SOP updated.");
}, "onRequestPut");

// api/ai-assist.ts
var MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
var MAX_SOURCE_CHARS = 7e3;
var MAX_PROMPT_CHARS = 4e3;
var actionLabels = {
  ask: "Ask a question",
  "draft-sop": "Draft SOP",
  "improve-draft": "Improve draft",
  "summarize-sop": "Summarize SOP",
  "review-gaps": "Review for gaps",
  "review-comments": "Create review comments",
  "suggest-taxonomy": "Suggest tags/category"
};
function extractAiText(value) {
  if (typeof value === "string") return value;
  const response = value;
  return response.response || response.result?.response || "";
}
__name(extractAiText, "extractAiText");
function sourceUrl(row) {
  if (row.slug) return `/sops/detail/?slug=${encodeURIComponent(String(row.slug))}`;
  return `/sops/detail/?id=${encodeURIComponent(String(row.id || ""))}`;
}
__name(sourceUrl, "sourceUrl");
function normalizeSource(row, includeContent = false) {
  const source = {
    id: row.id,
    title: row.title || "Untitled SOP",
    summary: row.summary || row.purpose || "",
    category: row.category || "Uncategorized",
    owner: row.owner || row.ownerSubRole || "Unassigned",
    ownerSubRoleId: row.ownerSubRoleId || "",
    ownerSubRole: row.ownerSubRole || "",
    ownerDepartment: row.ownerDepartment || "",
    status: row.status || "Draft",
    sourceType: row.sourceType || "Database SOP",
    tools: String(row.metadataJson || "").includes("tools") ? [] : [],
    url: sourceUrl(row),
    updatedAt: row.updatedAt || ""
  };
  if (includeContent) {
    source.content = [
      row.title,
      row.summary,
      row.purpose,
      row.content,
      row.beforeYouBegin,
      row.checklist,
      row.troubleshooting,
      row.metadataJson
    ].filter(Boolean).join("\n\n").slice(0, MAX_SOURCE_CHARS);
  }
  return source;
}
__name(normalizeSource, "normalizeSource");
async function fallbackSubRole(db) {
  return await db.prepare(
    `SELECT id, label, slug, department, team_id AS teamId
       FROM creator_sub_roles
       WHERE status = 'Active'
       ORDER BY sort_order ASC, label ASC
       LIMIT 1`
  ).first();
}
__name(fallbackSubRole, "fallbackSubRole");
async function resolveAssistContext(db, context) {
  const user = await getAuthUser(context);
  const requested = await resolveRequestedCreatorSubRole(db, context.request);
  const subRole = requested || user?.selectedSubRole || (user?.role === "admin" ? await fallbackSubRole(db) : null);
  if (user?.role === "creator" && requested && !user.subRoles.some((item) => item.id === requested.id)) {
    return {
      response: failure("FORBIDDEN", "Your account is not assigned to this Creator / Reviewer department.", 403),
      user,
      subRole: null
    };
  }
  return { response: null, user, subRole };
}
__name(resolveAssistContext, "resolveAssistContext");
function allowedStatusClause(user, subRole) {
  const canUseInternal = Boolean(user && user.role !== "normal" && subRole) && (hasPermission(user, "Edit Drafts") || hasPermission(user, "Review SOPs") || hasPermission(user, "Approve SOPs"));
  if (!canUseInternal) {
    return {
      sql: "sops.status IN ('Published', 'Approved')",
      values: [],
      sourcePolicy: "Only approved or published SOP records are available."
    };
  }
  const scopeClauses = ["sops.owner_sub_role_id = ?"];
  const values = [subRole.id];
  if (subRole.teamId) {
    scopeClauses.push("sops.owner_team_id = ?");
    values.push(subRole.teamId);
    scopeClauses.push(
      `EXISTS (
        SELECT 1 FROM sop_assignments
        WHERE sop_assignments.sop_id = sops.id
          AND sop_assignments.status = 'Active'
          AND sop_assignments.team_id = ?
      )`
    );
    values.push(subRole.teamId);
  }
  values.push(user.id);
  scopeClauses.push(
    `EXISTS (
      SELECT 1 FROM sop_assignments
      WHERE sop_assignments.sop_id = sops.id
        AND sop_assignments.status = 'Active'
        AND sop_assignments.user_id = ?
    )`
  );
  return {
    sql: `(sops.status IN ('Published', 'Approved') OR (sops.status IN ('Draft', 'In Review', 'Needs Revision', 'Approved') AND (${scopeClauses.join(" OR ")})))`,
    values,
    sourcePolicy: "Published/approved SOPs plus internal SOPs owned by or assigned to the selected Creator / Reviewer department are available."
  };
}
__name(allowedStatusClause, "allowedStatusClause");
async function queryAllowedSources(db, user, subRole, sourceId = "", includeContent = false) {
  const access = allowedStatusClause(user, subRole);
  const idClause = sourceId ? "AND sops.id = ?" : "";
  const values = sourceId ? [...access.values, sourceId] : access.values;
  const result = await db.prepare(
    `SELECT
        sops.id,
        sops.title,
        sops.slug,
        COALESCE(sops.summary, sops.purpose) AS summary,
        sops.purpose,
        sops.status,
        sops.source_type AS sourceType,
        sops.updated_at AS updatedAt,
        categories.name AS category,
        owner.name AS owner,
        sops.owner_sub_role_id AS ownerSubRoleId,
        sub_roles.label AS ownerSubRole,
        sub_roles.department AS ownerDepartment,
        COALESCE(versions.content, versions.body_markdown) AS content,
        versions.before_you_begin AS beforeYouBegin,
        versions.checklist,
        versions.troubleshooting,
        versions.metadata_json AS metadataJson
       FROM sops
       LEFT JOIN categories ON categories.id = sops.category_id
       LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
       LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id
       LEFT JOIN sop_versions versions ON versions.id = sops.current_version_id
       WHERE COALESCE(sops.is_active, 1) = 1
        AND ${access.sql}
        ${idClause}
       GROUP BY sops.id
       ORDER BY CASE sops.status WHEN 'Published' THEN 1 WHEN 'Approved' THEN 2 ELSE 3 END, sops.updated_at DESC, sops.title ASC
       LIMIT ${sourceId ? "1" : "250"}`
  ).bind(...values).all();
  return {
    sources: (result.results || []).map((row) => normalizeSource(row, includeContent)),
    sourcePolicy: access.sourcePolicy
  };
}
__name(queryAllowedSources, "queryAllowedSources");
function buildSystemPrompt() {
  return `You are AI Assist for an SOP Knowledge Hub.
Use only the provided backend source content and the user's notes.
Do not invent SOP titles, policies, owners, links, dates, categories, approvals, or workflow facts.
If the provided source and notes are insufficient, say what is missing and ask one follow-up question.
Keep output practical, structured, and ready for a creator/reviewer to use.
Do not reveal any content outside the provided source.`;
}
__name(buildSystemPrompt, "buildSystemPrompt");
function buildUserPrompt(action, source, prompt, user, subRole) {
  return `Requested action: ${actionLabels[action] || action}
User role: ${user?.role || "normal"}
Access level: ${user?.accessLevel || "Normal User"}
Selected department/sub-role: ${subRole?.label || "none"}

Allowed backend source:
${source ? `ID: ${source.id}
Title: ${source.title}
Status: ${source.status}
Category: ${source.category}
Owner: ${source.owner}
Content:
${source.content || source.summary || ""}` : "No source selected or no authorized source available."}

User notes/question:
${prompt || "(none)"}

Return:
1. AI answer
2. Source used
3. Limitation note
4. Suggested next action if applicable`;
}
__name(buildUserPrompt, "buildUserPrompt");
function fallbackAnswer(source, prompt) {
  if (!source && !prompt) {
    return "I do not have enough approved source information or user notes to help yet. Which SOP, request, or draft should I use?";
  }
  const title = source?.title ? ` using ${source.title}` : "";
  return `AI service is unavailable, so here is a grounded fallback${title}: review the selected source and notes, keep only verified steps, identify missing owner/review details, and route the item through the normal SOP workflow before publishing.`;
}
__name(fallbackAnswer, "fallbackAnswer");
async function logAssist(db, user, action, sourceId, status) {
  await db.prepare(
    `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    newId("audit"),
    user?.id || null,
    "ai_assist",
    "sop",
    sourceId || "none",
    JSON.stringify({ action, sourceStatus: status, promptStored: false }),
    new Date(unixNow() * 1e3).toISOString()
  ).run().catch(() => void 0);
}
__name(logAssist, "logAssist");
var onRequestGet14 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const resolved = await resolveAssistContext(context.env.DB, context);
  if (resolved.response) return resolved.response;
  const { sources, sourcePolicy } = await queryAllowedSources(context.env.DB, resolved.user, resolved.subRole);
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        currentUser: resolved.user ? {
          id: resolved.user.id,
          name: resolved.user.name,
          email: resolved.user.email,
          role: resolved.user.role,
          accessLevel: resolved.user.accessLevel,
          permissions: resolved.user.permissions,
          selectedSubRole: resolved.subRole
        } : null,
        roleOptions: [
          {
            id: resolved.user?.role || "normal",
            label: resolved.user?.accessLevel || "Normal User",
            selected: true
          }
        ],
        actions: Object.entries(actionLabels).map(([id, label]) => ({ id, label })),
        sources,
        sourcePolicy,
        model: MODEL
      }
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders("private"),
        vary: "x-sop-sub-role"
      }
    }
  );
}, "onRequestGet");
var onRequestPost15 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const resolved = await resolveAssistContext(context.env.DB, context);
  if (resolved.response) return resolved.response;
  const [payload, parseError] = await readBody(context.request);
  if (parseError) return parseError;
  const action = optionalText(payload?.action || "ask", 80);
  const prompt = optionalText(payload?.prompt || payload?.notes, MAX_PROMPT_CHARS);
  const sourceId = optionalText(payload?.sourceId, 180);
  if (!actionLabels[action]) return failure("VALIDATION_ERROR", "Choose a valid AI Assist action.", 400, { action: "Invalid action" });
  if (!sourceId && !prompt) return failure("VALIDATION_ERROR", "Choose a source or enter notes before using AI Assist.", 400, { prompt: "Required" });
  const { sources, sourcePolicy } = await queryAllowedSources(context.env.DB, resolved.user, resolved.subRole, sourceId, true);
  const source = sources[0] || null;
  if (sourceId && !source) {
    return failure("SOURCE_NOT_ALLOWED", "That SOP source is not available for the selected role, sub-role, or permissions.", 403);
  }
  let answer = "";
  let model = MODEL;
  let limitation = source ? "Response is grounded in the selected backend SOP source and the provided notes." : "No authorized source was selected; response is limited to user-provided notes.";
  if (context.env.AI) {
    try {
      const aiResult = await context.env.AI.run(MODEL, {
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(action, source, prompt, resolved.user, resolved.subRole) }
        ],
        max_tokens: 900,
        temperature: 0.2
      });
      answer = extractAiText(aiResult).trim();
    } catch {
      model = "deterministic-fallback";
      answer = fallbackAnswer(source, prompt);
      limitation = "Workers AI could not complete the request, so a deterministic grounded fallback was returned.";
    }
  } else {
    model = "deterministic-fallback";
    answer = fallbackAnswer(source, prompt);
    limitation = "Workers AI binding is unavailable, so a deterministic grounded fallback was returned.";
  }
  await logAssist(context.env.DB, resolved.user, action, String(source?.id || sourceId || ""), String(source?.status || ""));
  return success({
    answer: answer || fallbackAnswer(source, prompt),
    source: source ? {
      id: source.id,
      title: source.title,
      status: source.status,
      sourceType: source.sourceType,
      url: source.url
    } : null,
    action,
    model,
    sourcePolicy,
    limitation,
    suggestedNextAction: action === "draft-sop" ? "Review the draft, then save it through Create SOP." : action === "review-comments" ? "Add the comments to the relevant review item if they are accurate." : "Verify the output against the source before changing an SOP."
  });
}, "onRequestPost");

// api/categories.ts
var onRequestGet15 = /* @__PURE__ */ __name(async ({ request, env }) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  try {
    const selectedSubRole = await resolveRequestedCreatorSubRole(env.DB, request);
    const categories = await listCategories(env.DB, { ownerSubRoleId: selectedSubRole?.id });
    return new Response(JSON.stringify({ success: true, data: { categories }, categories }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders(selectedSubRole ? "private" : "public"),
        vary: "x-sop-sub-role"
      }
    });
  } catch (error) {
    return failure(
      "CATEGORIES_READ_FAILED",
      error instanceof Error ? error.message : "Unable to load categories.",
      500
    );
  }
}, "onRequestGet");

// ../src/data/ai-knowledge.ts
var aiKnowledgeSources = [
  {
    id: "sop-ivanti-submit-ticket",
    title: "Submit a New Ivanti Ticket",
    category: "Ivanti / Ticketing System",
    status: "Published",
    sourceType: "Published SOP",
    access: "published",
    url: "/sops/ivanti-ticketing-system/submit-a-new-ivanti-ticket/",
    purpose: "Explains how to submit a new Ivanti ticket with the required details for faster routing and resolution.",
    owner: "Instructional Technology",
    tools: ["Ivanti"],
    tags: ["ticketing", "support", "ivanti", "request"],
    excerpt: "Gather the affected user's name, email address, course or section code, relevant dates, and screenshots. Open Ivanti, select New Ticket, choose the closest request category, enter a clear title, describe the issue, add affected course or user information, attach screenshots, set priority by impact, submit the ticket, and save the ticket number."
  },
  {
    id: "sop-copy-d2l-course-shell",
    title: "Copy a Brightspace D2L Course Shell",
    category: "Brightspace D2L",
    status: "Published",
    sourceType: "Published SOP",
    access: "published",
    url: "/sops/brightspace-d2l/copy-a-brightspace-d2l-course-shell/",
    purpose: "Explains how to copy course content from one Brightspace D2L shell into another.",
    owner: "Learning Systems",
    tools: ["Brightspace D2L"],
    tags: ["d2l", "course copy", "shell setup"],
    excerpt: "Confirm the source course shell, destination shell, term, owner, and component scope. In the destination shell, open Course Admin, then Import/Export/Copy Components. Choose Copy Components from another Org Unit, select the source shell, choose components, start the copy, review the log, and spot check modules, assessments, links, and dates."
  },
  {
    id: "sop-course-build-request",
    title: "Prepare a Course Build Request",
    category: "Course Builds",
    status: "Published",
    sourceType: "Published SOP",
    access: "published",
    url: "/sops/course-builds/prepare-a-course-build-request/",
    purpose: "Explains how to gather and submit the information needed before beginning a course build.",
    owner: "Course Operations",
    tools: ["Brightspace D2L", "Ivanti"],
    tags: ["course build", "intake", "request"],
    excerpt: "Identify the target course, launch term, program owner, source materials, and constraints. Confirm the course code, section, term, launch date, course owner, reviewer, required D2L tools, integrations, accessibility requirements, source files, and known content concerns before submitting through the approved intake channel."
  },
  {
    id: "sop-final-course-qa",
    title: "Complete Final Course QA",
    category: "QA Processes",
    status: "Published",
    sourceType: "Published SOP",
    access: "published",
    url: "/sops/qa-processes/complete-final-course-qa/",
    purpose: "Explains how to complete a final quality assurance review before a course is approved for launch.",
    owner: "Quality Assurance",
    tools: ["Brightspace D2L", "QA Checklist"],
    tags: ["qa", "launch", "review", "accessibility"],
    excerpt: "Confirm the course build is ready, the owner has completed changes, and the QA checklist is available. Review homepage, navigation, dates, modules, links, media, documents, external tools, assessments, gradebook, rubrics, accessibility items, and screenshots. Document issues, send them to owners, recheck fixes, and approve launch only when blocking findings are resolved."
  },
  {
    id: "sop-use-ai-to-draft-course-content",
    title: "Use AI to Draft Course Content",
    category: "AI Tools",
    status: "Published",
    sourceType: "Published SOP",
    access: "published",
    url: "/sops/ai-tools/use-ai-to-draft-course-content/",
    purpose: "Explains how to responsibly use approved AI tools to draft instructional content for review.",
    owner: "Learning Innovation",
    tools: ["Approved AI Tools", "Source Documents"],
    tags: ["ai", "drafting", "review", "responsible use"],
    excerpt: "Use only organization-approved AI tools and approved source material. Do not enter confidential, student, or sensitive data unless the tool and use case have been approved. Identify the learning outcome, audience, source material, and content format. Ask the tool to cite sources, then review for accuracy, bias, accessibility, and alignment before publishing."
  },
  {
    id: "sop-troubleshoot-missing-d2l-content",
    title: "Troubleshoot Missing D2L Content",
    category: "Troubleshooting",
    status: "Published",
    sourceType: "Published SOP",
    access: "published",
    url: "/sops/troubleshooting/troubleshoot-missing-d2l-content/",
    purpose: "Explains how to investigate and resolve missing content in a Brightspace D2L course shell.",
    owner: "Learning Systems",
    tools: ["Brightspace D2L", "Ivanti"],
    tags: ["d2l", "missing content", "troubleshooting"],
    excerpt: "Collect the course code, content title, user role, screenshot, and expected availability date. Confirm the content exists, check visibility, dates, release conditions, group restrictions, user enrollment, and source shell differences. Test as the correct role, correct authorized settings, or submit an Ivanti ticket with screenshots and findings."
  },
  {
    id: "sop-course-build-request-template",
    title: "Course Build Request Template",
    category: "Templates",
    status: "Published",
    sourceType: "Published SOP",
    access: "published",
    url: "/sops/templates/course-build-request-template/",
    purpose: "Provides a reusable template for submitting a complete course build request.",
    owner: "Course Operations",
    tools: ["Course Build Intake Form", "Brightspace D2L"],
    tags: ["template", "course build", "intake"],
    excerpt: "Use the template before opening a course build request. Include course code, course title, term, launch date, request type, course owner, reviewer, source material location, required D2L tools, accessibility notes, known issues, deadline, and priority. Mark unknown fields as pending and assign an owner."
  },
  {
    id: "draft-ai-content-review-checklist",
    title: "AI Content Review Checklist",
    category: "AI Tools",
    status: "Draft",
    sourceType: "Draft SOP",
    access: "admin",
    url: "/drafts/",
    purpose: "Draft checklist for reviewing AI-assisted course content before approval.",
    owner: "Curriculum Design",
    tools: ["Approved AI Tools"],
    tags: ["ai", "checklist", "review", "draft"],
    excerpt: "Admin-only draft source. Review AI-assisted course content for factual accuracy, source alignment, tone, accessibility, learning outcome alignment, documented reviewer changes, and readiness for normal QA."
  },
  {
    id: "request-d2l-access-troubleshooting",
    title: "Clarify D2L Access Troubleshooting Steps",
    category: "Troubleshooting",
    status: "Triage",
    sourceType: "Request / Review Item",
    access: "admin",
    url: "/admin/review/",
    purpose: "Request to clarify first-response troubleshooting steps for missing D2L course access.",
    owner: "Instructional Technology",
    tools: ["Brightspace D2L", "Ivanti"],
    tags: ["d2l", "access", "troubleshooting", "triage"],
    excerpt: "Admin-only request source. Support staff need consistent steps before escalating missing course access. Confirm learner, course code, term, enrollment status, active shell visibility, access error screenshots, and timing delays after section changes."
  }
];

// api/chat.ts
var MODEL2 = "@cf/meta/llama-3.2-3b-instruct";
var MIN_RELEVANCE_SCORE = 1;
function jsonResponse2(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
__name(jsonResponse2, "jsonResponse");
function tokenize(value) {
  const stopWords2 = /* @__PURE__ */ new Set([
    "about",
    "after",
    "again",
    "also",
    "and",
    "are",
    "can",
    "for",
    "from",
    "have",
    "how",
    "into",
    "need",
    "that",
    "the",
    "this",
    "what",
    "when",
    "where",
    "with",
    "you"
  ]);
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 2 && !stopWords2.has(word));
}
__name(tokenize, "tokenize");
function sourceText(source) {
  return [
    source.title,
    source.category,
    source.purpose,
    source.owner,
    source.tools.join(" "),
    source.tags.join(" "),
    source.excerpt
  ].join(" ").toLowerCase();
}
__name(sourceText, "sourceText");
function getAllowedSources(role) {
  return aiKnowledgeSources.filter((source) => {
    if (source.access === "published") return true;
    return role === "admin";
  });
}
__name(getAllowedSources, "getAllowedSources");
function rankSources(message, role) {
  const tokens = tokenize(message);
  const allowedSources = getAllowedSources(role);
  return allowedSources.map((source) => {
    const haystack = sourceText(source);
    const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
    return { source, score };
  }).filter((match2) => match2.score >= MIN_RELEVANCE_SCORE).sort((a, b) => b.score - a.score || a.source.title.localeCompare(b.source.title)).slice(0, 4);
}
__name(rankSources, "rankSources");
function buildContext(matches) {
  return matches.map(
    ({ source }, index) => `[${index + 1}] ${source.title}
Status: ${source.status}
Source type: ${source.sourceType}
Category: ${source.category}
Owner: ${source.owner}
Tools: ${source.tools.join(", ")}
URL: ${source.url}
Purpose: ${source.purpose}
Excerpt: ${source.excerpt}`
  ).join("\n\n");
}
__name(buildContext, "buildContext");
function extractAiText2(value) {
  if (typeof value === "string") return value;
  const response = value;
  return response.response || response.result?.response || "";
}
__name(extractAiText2, "extractAiText");
var onRequestPost16 = /* @__PURE__ */ __name(async ({ request, env }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse2({ error: "Send a valid JSON request." }, 400);
  }
  const message = String(body.message || "").trim();
  const authUser = await getAuthUser({ request, env });
  const role = authUser?.role === "admin" ? "admin" : authUser?.role === "creator" ? "creator" : "normal";
  if (!message) {
    return jsonResponse2({ error: "Ask a question first." }, 400);
  }
  if (!env.AI) {
    return jsonResponse2(
      {
        error: "Cloudflare Workers AI is not available yet. Confirm the AI binding is enabled on the Pages project."
      },
      503
    );
  }
  const matches = rankSources(message, role);
  if (!matches.length) {
    return jsonResponse2({
      answer: "I could not find an approved SOP source that answers that. Please try a more specific question or submit a request for a missing SOP.",
      sources: [],
      role,
      sourcePolicy: role === "admin" ? "Admin mode can include published SOPs plus draft and review items." : "Only approved or published SOPs were searched."
    });
  }
  const systemPrompt = `You are the SOP Knowledge Hub assistant. Answer only from the provided sources.
If the sources do not answer the question, say you do not have enough approved SOP information.
Do not invent policies, steps, owners, tools, dates, or links.
Keep the answer concise and practical.
Always include a short "Sources" line using the source titles.`;
  const userPrompt = `User role: ${role}
Source policy: ${role === "admin" ? "Admin mode can include published SOPs plus draft and review items." : "Use approved or published SOP sources only."}

Question:
${message}

Allowed SOP source excerpts:
${buildContext(matches)}`;
  try {
    const aiResult = await env.AI.run(MODEL2, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 600
    });
    return jsonResponse2({
      answer: extractAiText2(aiResult).trim(),
      sources: matches.map(({ source }) => ({
        id: source.id,
        title: source.title,
        url: source.url,
        status: source.status,
        sourceType: source.sourceType
      })),
      role,
      sourcePolicy: role === "admin" ? "Admin mode can include published SOPs plus draft and review items." : "Only approved or published SOPs were searched."
    });
  } catch (error) {
    return jsonResponse2(
      {
        error: "The AI service could not answer right now. Please try again in a moment.",
        detail: error instanceof Error ? error.message : "Unknown Workers AI error"
      },
      502
    );
  }
}, "onRequestPost");
var onRequestGet16 = /* @__PURE__ */ __name(() => jsonResponse2({
  ok: true,
  service: "SOP Knowledge Hub AI Chat",
  model: MODEL2,
  sourcePolicy: "Normal users and creators search approved/published SOPs only. Admins can include draft/review sources."
}), "onRequestGet");

// api/create-options.ts
var onRequestGet17 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Create SOPs");
  if (auth.response) return auth.response;
  const db = context.env.DB;
  const user = await getAuthUser(context);
  const selectedSubRole = await resolveRequestedCreatorSubRole(db, context.request);
  const selectedTeamId = selectedSubRole?.teamId || user?.selectedSubRole?.teamId || "";
  const [categories, users, tags] = await Promise.all([
    db.prepare(
      `SELECT id, name, slug, description
         FROM categories
         WHERE COALESCE(is_active, 1) = 1
         ORDER BY sort_order ASC, name ASC`
    ).all(),
    db.prepare(
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
         ORDER BY users.name ASC`
    ).bind(selectedTeamId, selectedTeamId, selectedSubRole?.id || user?.selectedSubRole?.id || "").all(),
    db.prepare(
      `SELECT id, name, slug
         FROM tags
         WHERE COALESCE(is_active, 1) = 1
         ORDER BY name ASC
         LIMIT 250`
    ).all().catch(() => ({ results: [] }))
  ]);
  if (user?.role === "normal") {
    return failure("FORBIDDEN", "Normal users cannot create SOPs.", 403);
  }
  return success({
    currentUser: user ? {
      id: user.id,
      name: user.name,
      email: user.email,
      accessLevel: user.accessLevel,
      role: user.role,
      permissions: user.permissions,
      selectedSubRole: selectedSubRole || user.selectedSubRole
    } : null,
    categories: categories.results || [],
    users: users.results || [],
    reviewers: users.results || [],
    tags: tags.results || []
  });
}, "onRequestGet");

// api/finder.ts
var MODEL3 = "@cf/meta/llama-3.1-8b-instruct-fast";
var stopWords = /* @__PURE__ */ new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "can",
  "for",
  "from",
  "have",
  "help",
  "how",
  "into",
  "need",
  "that",
  "the",
  "this",
  "what",
  "when",
  "where",
  "with",
  "you"
]);
function extractAiText3(value) {
  if (typeof value === "string") return value;
  const response = value;
  const text = response.response || response.result?.response || "";
  return typeof text === "string" ? text : JSON.stringify(text);
}
__name(extractAiText3, "extractAiText");
function parseJsonObject(value) {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match2 = trimmed.match(/\{[\s\S]*\}/);
    if (!match2) return {};
    try {
      return JSON.parse(match2[0]);
    } catch {
      return {};
    }
  }
}
__name(parseJsonObject, "parseJsonObject");
function tokenize2(value) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).map((word) => word.trim()).filter((word) => word.length > 2 && !stopWords.has(word));
}
__name(tokenize2, "tokenize");
function textList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || "").split(/[,|]/).map((item) => item.trim()).filter(Boolean);
}
__name(textList, "textList");
function fallbackCriteria(message) {
  const keywords = Array.from(new Set(tokenize2(message))).slice(0, 8);
  return {
    needsFollowUp: keywords.length < 2,
    followUpQuestion: keywords.length < 2 ? "What task, system, or process are you trying to complete?" : "",
    taskIntent: message,
    keywords,
    confidence: keywords.length < 2 ? 30 : 55
  };
}
__name(fallbackCriteria, "fallbackCriteria");
function buildCriteriaPrompt(message, history) {
  const recentHistory = (history || []).slice(-6).map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${String(item.content || "").slice(0, 500)}`).join("\n");
  return `You classify a normal user's SOP-finding request.
Return only valid compact JSON with these keys:
needsFollowUp boolean
followUpQuestion string
role string
department string
taskIntent string
systemTool string
keywords array of strings
category string
confidence number from 0 to 100

Ask for one follow-up only if the user's request does not include enough task/system/process detail to search SOPs.
Do not invent SOP titles.

Conversation:
${recentHistory || "(none)"}

Latest user request:
${message}`;
}
__name(buildCriteriaPrompt, "buildCriteriaPrompt");
async function classifyWithAi(env, message, history) {
  if (!env.AI) return fallbackCriteria(message);
  const aiResult = await env.AI.run(MODEL3, {
    messages: [
      {
        role: "system",
        content: "You extract structured search criteria for an SOP finder. Return JSON only. Never recommend SOPs."
      },
      { role: "user", content: buildCriteriaPrompt(message, history) }
    ],
    max_tokens: 500,
    temperature: 0.1
  });
  const parsed = parseJsonObject(extractAiText3(aiResult));
  const fallback = fallbackCriteria(message);
  const keywords = Array.from(
    /* @__PURE__ */ new Set([...textList(parsed.keywords), ...tokenize2([parsed.taskIntent, parsed.systemTool, parsed.category].join(" "))])
  ).slice(0, 10);
  const hasSearchableDetail = (fallback.keywords || []).length >= 3 || keywords.length >= 3;
  return {
    ...fallback,
    ...parsed,
    needsFollowUp: hasSearchableDetail ? false : Boolean(parsed.needsFollowUp ?? fallback.needsFollowUp),
    keywords: keywords.length ? keywords : fallback.keywords
  };
}
__name(classifyWithAi, "classifyWithAi");
async function fetchPublishedSops(db) {
  const records = [];
  let offset = 0;
  const limit = 100;
  while (offset < 600) {
    const batch = await listSops(db, { limit, offset, sort: "recent", publicOnly: true });
    records.push(...batch);
    if (batch.length < limit) break;
    offset += batch.length;
  }
  return records;
}
__name(fetchPublishedSops, "fetchPublishedSops");
function sopUrl(sop) {
  if (sop.slug) return `/sops/detail/?slug=${encodeURIComponent(String(sop.slug))}`;
  return `/sops/detail/?id=${encodeURIComponent(String(sop.id || ""))}`;
}
__name(sopUrl, "sopUrl");
function searchableText(sop) {
  const version = sop.version || {};
  return [
    sop.title,
    sop.summary,
    sop.purpose,
    sop.category,
    sop.owner,
    sop.ownerDepartment,
    ...Array.isArray(sop.tags) ? sop.tags : [],
    ...Array.isArray(sop.tools) ? sop.tools : [],
    version.summary,
    version.content
  ].join(" ").toLowerCase();
}
__name(searchableText, "searchableText");
function rankSops(sops, criteria, message) {
  const tokens = Array.from(
    /* @__PURE__ */ new Set([
      ...tokenize2(message),
      ...textList(criteria.keywords).flatMap(tokenize2),
      ...tokenize2([criteria.taskIntent, criteria.systemTool, criteria.category, criteria.department].join(" "))
    ])
  ).slice(0, 18);
  const category = String(criteria.category || "").toLowerCase();
  const tool = String(criteria.systemTool || "").toLowerCase();
  const intent = String(criteria.taskIntent || "").toLowerCase();
  return sops.map((sop) => {
    const title = String(sop.title || "").toLowerCase();
    const sopCategory = String(sop.category || "").toLowerCase();
    const haystack = searchableText(sop);
    let score = 0;
    tokens.forEach((token) => {
      if (title.includes(token)) score += 5;
      else if (sopCategory.includes(token)) score += 4;
      else if (haystack.includes(token)) score += 1;
    });
    if (category && (sopCategory.includes(category) || category.includes(sopCategory))) score += 8;
    if (tool && haystack.includes(tool)) score += 6;
    if (intent && title.includes(intent)) score += 8;
    score += Math.min(Number(sop.viewCount || 0) / 100, 2);
    return { sop, score };
  }).filter((match2) => match2.score > 0).sort((a, b) => b.score - a.score || String(a.sop.title || "").localeCompare(String(b.sop.title || ""))).slice(0, 5);
}
__name(rankSops, "rankSops");
function summarizeSop(sop, score) {
  return {
    id: sop.id,
    title: sop.title,
    summary: sop.summary || sop.purpose,
    category: sop.category,
    owner: sop.owner,
    status: sop.status,
    tools: sop.tools || [],
    tags: sop.tags || [],
    updatedAt: sop.updatedAt,
    url: sopUrl(sop),
    matchScore: Math.round(score)
  };
}
__name(summarizeSop, "summarizeSop");
var onRequestPost17 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const [payload, parseError] = await readBody(context.request);
  if (parseError) return parseError;
  const message = String(payload?.message || "").trim().slice(0, 1200);
  if (!message) return failure("FINDER_INPUT_REQUIRED", "Describe the task or SOP you need help finding.", 400);
  try {
    const criteria = await classifyWithAi(context.env, message, payload?.history || []);
    if (criteria.needsFollowUp) {
      return success({
        mode: "follow_up",
        question: criteria.followUpQuestion || "Which system, tool, or process is this about?",
        criteria,
        sops: [],
        sourcePolicy: "Only published SOP records are searched for Normal Users.",
        model: context.env.AI ? MODEL3 : "deterministic-fallback"
      });
    }
    const sops = await fetchPublishedSops(context.env.DB);
    const ranked = rankSops(sops, criteria, message);
    const exactEnough = ranked.some((match2) => match2.score >= 8);
    return success({
      mode: ranked.length ? "results" : "no_results",
      criteria,
      sops: ranked.map((match2) => summarizeSop(match2.sop, match2.score)),
      explanation: ranked.length ? exactEnough ? "These SOPs matched the extracted task, system/tool, category, or keywords." : "No exact match was found, so these are the closest related published SOPs." : "No published SOP records matched the extracted criteria. Try adding the system, tool, or task name.",
      sourcePolicy: "Only real published SOP records from the Cloudflare database are returned.",
      model: context.env.AI ? MODEL3 : "deterministic-fallback"
    });
  } catch (error) {
    return failure(
      "FINDER_FAILED",
      error instanceof Error ? error.message : "The Guided Finder could not process that request.",
      500
    );
  }
}, "onRequestPost");
var onRequestGet18 = /* @__PURE__ */ __name(() => success({
  service: "AI Guided SOP Finder",
  model: MODEL3,
  sourcePolicy: "AI extracts search criteria; final results are published SOP records from D1."
}), "onRequestGet");

// api/media.ts
var MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
var ALLOWED_MIME_PREFIXES = ["image/", "video/"];
var ALLOWED_MIME_TYPES = /* @__PURE__ */ new Set([
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);
function inferAssetType(mimeType) {
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType === "application/pdf" || mimeType.startsWith("text/") || mimeType.includes("document")) {
    return "Document";
  }
  return "Other";
}
__name(inferAssetType, "inferAssetType");
function sanitizeFileName(value) {
  return value.normalize("NFKD").replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 120) || "upload";
}
__name(sanitizeFileName, "sanitizeFileName");
function isAllowedFile(file) {
  return ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix)) || ALLOWED_MIME_TYPES.has(file.type);
}
__name(isAllowedFile, "isAllowedFile");
var onRequestPost18 = /* @__PURE__ */ __name(async ({ request, env }) => {
  if (!env.DB) {
    return jsonResponse({ error: "D1 database binding DB is not available." }, 503);
  }
  if (!env.SOP_MEDIA) {
    return jsonResponse(
      { error: "R2 media binding SOP_MEDIA is not available. Enable R2 and bind the bucket first." },
      503
    );
  }
  const auth = await requirePermission({ request, env }, "Upload Media");
  if (auth.response) return auth.response;
  const formData = await request.formData();
  const uploadedByUserId = String(formData.get("uploadedByUserId") || auth.user?.id || "") || null;
  const purpose = String(formData.get("purpose") || "Other");
  const entityType = String(formData.get("entityType") || "");
  const entityId = String(formData.get("entityId") || "") || null;
  const altText = String(formData.get("altText") || "") || null;
  const caption = String(formData.get("caption") || "") || null;
  const files = formData.getAll("files").filter((value) => value instanceof File);
  if (!files.length) {
    const singleFile = formData.get("file");
    if (singleFile instanceof File) files.push(singleFile);
  }
  if (!files.length) {
    return jsonResponse({ error: "Attach at least one file." }, 400);
  }
  const saved = [];
  for (const file of files) {
    if (!isAllowedFile(file)) {
      return jsonResponse({ error: `${file.name} is not an allowed image, video, or document type.` }, 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonResponse({ error: `${file.name} is larger than the 50 MB upload limit.` }, 413);
    }
    const id = newId("media");
    const safeFileName = sanitizeFileName(file.name);
    const objectKey = `media/${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}/${id}/${safeFileName}`;
    const arrayBuffer = await file.arrayBuffer();
    await env.SOP_MEDIA.put(objectKey, arrayBuffer, {
      httpMetadata: {
        contentType: file.type || "application/octet-stream",
        contentDisposition: `inline; filename="${safeFileName}"`
      },
      customMetadata: {
        originalFileName: file.name,
        uploadedByUserId: uploadedByUserId || "",
        purpose
      }
    });
    await env.DB.prepare(
      `INSERT INTO media_assets (
        id, asset_type, purpose, original_file_name, display_name, mime_type, size_bytes,
        storage_provider, bucket_name, object_key, public_url, alt_text, caption,
        uploaded_by_user_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'r2', ?, ?, ?, ?, ?, ?, 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(
      id,
      inferAssetType(file.type),
      purpose,
      file.name,
      file.name,
      file.type || "application/octet-stream",
      file.size,
      "sop-knowledge-hub-media",
      objectKey,
      `/api/media?id=${encodeURIComponent(id)}`,
      altText,
      caption,
      uploadedByUserId
    ).run();
    if (entityType === "sop" && entityId) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO sop_media (sop_id, media_asset_id, relationship, sort_order)
         VALUES (?, ?, ?, 0)`
      ).bind(entityId, id, purpose === "SOP Step" ? "Screenshot" : "Attachment").run();
    }
    env.SOP_ANALYTICS?.writeDataPoint({
      blobs: ["media_upload", inferAssetType(file.type), purpose, file.type || "unknown"],
      doubles: [1, file.size],
      indexes: [uploadedByUserId || getClientIp(request) || "anonymous"]
    });
    saved.push({
      id,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      assetType: inferAssetType(file.type),
      url: `/api/media?id=${encodeURIComponent(id)}`
    });
  }
  return jsonResponse({ uploaded: saved }, 201);
}, "onRequestPost");
var onRequestGet19 = /* @__PURE__ */ __name(async ({ request, env }) => {
  if (!env.DB || !env.SOP_MEDIA) {
    return jsonResponse({ error: "Media storage is not configured." }, 503);
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonResponse({ error: "Missing media id." }, 400);
  const asset = await env.DB.prepare(
    `SELECT id, object_key, mime_type, original_file_name, status
     FROM media_assets
     WHERE id = ? AND status = 'Active'`
  ).bind(id).first();
  if (!asset) return jsonResponse({ error: "Media asset not found." }, 404);
  const object = await env.SOP_MEDIA.get(asset.object_key);
  if (!object?.body) return jsonResponse({ error: "Media object not found." }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", asset.mime_type || headers.get("content-type") || "application/octet-stream");
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  headers.set("content-disposition", `inline; filename="${sanitizeFileName(asset.original_file_name)}"`);
  return new Response(object.body, { headers });
}, "onRequestGet");

// api/my-drafts.ts
function normalizeDate(value) {
  if (!value) return "";
  if (typeof value === "number") return new Date(value * 1e3).toISOString().slice(0, 10);
  const raw = String(value);
  if (/^\d+$/.test(raw)) return new Date(Number(raw) * 1e3).toISOString().slice(0, 10);
  return raw.slice(0, 10);
}
__name(normalizeDate, "normalizeDate");
function detailUrl(row) {
  if (row.slug) return `/sops/detail/?slug=${encodeURIComponent(String(row.slug))}`;
  return `/sops/detail/?id=${encodeURIComponent(String(row.id || ""))}`;
}
__name(detailUrl, "detailUrl");
function normalizeDraft(row) {
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
    editUrl: `/create/?edit=draft&id=${encodeURIComponent(id)}`
  };
}
__name(normalizeDraft, "normalizeDraft");
async function fallbackSubRole2(db) {
  return await db.prepare(
    `SELECT id, label, slug, department, team_id AS teamId
       FROM creator_sub_roles
       WHERE status = 'Active'
       ORDER BY sort_order ASC, label ASC
       LIMIT 1`
  ).first();
}
__name(fallbackSubRole2, "fallbackSubRole");
async function usersForSubRole(db, subRole) {
  const result = await db.prepare(
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
       ORDER BY users.name ASC`
  ).bind(subRole.id, subRole.teamId || "", subRole.department).all();
  return result.results || [];
}
__name(usersForSubRole, "usersForSubRole");
async function resolveDraftContext(db, context) {
  const auth = await requirePermission(context, "Edit Drafts");
  if (auth.response || !auth.user) return { response: auth.response, user: auth.user, subRole: null };
  if (auth.user.role === "normal") {
    return {
      response: failure("FORBIDDEN", "My Drafts is available to Creator / Reviewer and Admin users.", 403),
      user: auth.user,
      subRole: null
    };
  }
  const requested = await resolveRequestedCreatorSubRole(db, context.request);
  const subRole = requested || auth.user.selectedSubRole || (auth.user.role === "admin" ? await fallbackSubRole2(db) : null);
  if (!subRole) {
    return {
      response: failure("SUB_ROLE_REQUIRED", "Select a Creator / Reviewer department before viewing drafts.", 400),
      user: auth.user,
      subRole: null
    };
  }
  if (auth.user.role === "creator" && !auth.user.subRoles.some((item) => item.id === subRole.id)) {
    return {
      response: failure("FORBIDDEN", "Your account is not assigned to this Creator / Reviewer department.", 403),
      user: auth.user,
      subRole: null
    };
  }
  return { response: null, user: auth.user, subRole };
}
__name(resolveDraftContext, "resolveDraftContext");
async function queryDrafts(db, subRole, selectedUser) {
  const scopeClauses = ["sops.owner_sub_role_id = ?"];
  const scopeValues = [subRole.id];
  if (subRole.teamId) {
    scopeClauses.push("sops.owner_team_id = ?");
    scopeValues.push(subRole.teamId);
    scopeClauses.push(
      `EXISTS (
        SELECT 1 FROM sop_assignments team_assignments
        WHERE team_assignments.sop_id = sops.id
          AND team_assignments.status = 'Active'
          AND team_assignments.team_id = ?
      )`
    );
    scopeValues.push(subRole.teamId);
  }
  const userClauses = [];
  const userValues = [];
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
      )`
    );
    userValues.push(selectedUser.id);
  }
  const result = await db.prepare(
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
       LIMIT 150`
  ).bind(...scopeValues, ...userValues).all();
  return (result.results || []).map(normalizeDraft);
}
__name(queryDrafts, "queryDrafts");
var onRequestGet20 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const db = context.env.DB;
  const resolved = await resolveDraftContext(db, context);
  if (resolved.response || !resolved.subRole || !resolved.user) return resolved.response;
  const users = await usersForSubRole(db, resolved.subRole);
  const url = new URL(context.request.url);
  const requestedUserId = optionalText(url.searchParams.get("userId"), 160);
  const selectedUser = users.find((user) => user.id === requestedUserId) || users.find((user) => user.id === resolved.user?.id) || users[0] || null;
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
          canArchive: hasPermission(resolved.user, "Archive SOPs")
        },
        viewOptions: { users, subRoles: [resolved.subRole] },
        counts: { drafts: drafts.length },
        drafts
      }
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders("private"),
        vary: "x-sop-sub-role"
      }
    }
  );
}, "onRequestGet");

// api/my-work.ts
var requestWorkflowColumns = {
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
  submitted_at: "INTEGER",
  reviewed_at: "INTEGER",
  assigned_at: "INTEGER",
  accepted_at: "INTEGER",
  declined_at: "INTEGER",
  approved_at: "INTEGER",
  published_at: "INTEGER",
  closed_at: "INTEGER"
};
function isoToday() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
__name(isoToday, "isoToday");
function detailUrl2(row) {
  if (row.slug) return `/sops/detail/?slug=${encodeURIComponent(String(row.slug))}`;
  return `/sops/detail/?id=${encodeURIComponent(String(row.id || row.sopId || ""))}`;
}
__name(detailUrl2, "detailUrl");
function normalizeDate2(value) {
  if (!value) return "";
  if (typeof value === "number") return new Date(value * 1e3).toISOString().slice(0, 10);
  const raw = String(value);
  if (/^\d+$/.test(raw)) return new Date(Number(raw) * 1e3).toISOString().slice(0, 10);
  return raw.slice(0, 10);
}
__name(normalizeDate2, "normalizeDate");
function normalizeRequest(row) {
  return {
    id: row.id,
    title: row.title || row.requestedTitle || "Untitled SOP Request",
    status: row.status || "Submitted",
    priority: row.priority || "Medium",
    updatedDate: normalizeDate2(row.updatedAt || row.createdAt),
    reviewDate: normalizeDate2(row.desiredCompletionAt || row.assignedAt || row.createdAt),
    owner: row.assignedToName || row.assignedDepartment || "Unassigned",
    department: row.assignedDepartment || row.departmentName || "",
    category: row.category || "Uncategorized",
    url: `/admin/review/?request=${encodeURIComponent(String(row.id || ""))}`
  };
}
__name(normalizeRequest, "normalizeRequest");
function normalizeSop2(row) {
  return {
    id: row.id,
    title: row.title || "Untitled SOP",
    category: row.category || "Uncategorized",
    status: row.status || "Draft",
    owner: row.owner || row.ownerDepartment || "Unassigned",
    reviewDate: normalizeDate2(row.reviewDate || row.reviewDueAt || row.dueAt),
    updatedDate: normalizeDate2(row.updatedAt || row.createdAt),
    ownerSubRoleId: row.ownerSubRoleId || "",
    ownerSubRole: row.ownerSubRole || "",
    ownerDepartment: row.ownerDepartment || "",
    assignmentType: row.assignmentType || "",
    url: detailUrl2(row)
  };
}
__name(normalizeSop2, "normalizeSop");
function normalizeReview(row) {
  return {
    id: row.id,
    title: row.title || row.sopTitle || "Untitled Review",
    status: row.status || "Assigned",
    priority: row.priority || "Medium",
    reviewDate: normalizeDate2(row.dueDate || row.reviewDate || row.dueAt),
    owner: row.reviewer || row.owner || "Unassigned",
    url: row.sopId ? `/sops/detail/?id=${encodeURIComponent(String(row.sopId))}` : `/admin/needs-review/?review=${encodeURIComponent(String(row.id || ""))}`
  };
}
__name(normalizeReview, "normalizeReview");
function scopeClause(alias, subRole) {
  const clauses = [`${alias}.owner_sub_role_id = ?`];
  const values = [subRole.id];
  if (subRole.teamId) {
    clauses.push(`${alias}.owner_team_id = ?`);
    values.push(subRole.teamId);
  }
  return { sql: `(${clauses.join(" OR ")})`, values };
}
__name(scopeClause, "scopeClause");
async function ensureRequestWorkflowSchema(db) {
  const info = await db.prepare("PRAGMA table_info(sop_requests)").all();
  const existing = new Set((info.results || []).map((row) => row.name));
  for (const [column, type] of Object.entries(requestWorkflowColumns)) {
    if (!existing.has(column)) {
      await db.prepare(`ALTER TABLE sop_requests ADD COLUMN ${column} ${type}`).run();
    }
  }
}
__name(ensureRequestWorkflowSchema, "ensureRequestWorkflowSchema");
async function usersForSubRole2(db, subRole) {
  const result = await db.prepare(
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
       WHERE users.status = 'Active'
        AND COALESCE(users.is_active, 1) = 1
        AND users.access_level IN ('Creator / Reviewer', 'Admin')
        AND (
          user_sub_roles.sub_role_id = ?
          OR users.department = ?
          OR users.team_id = ?
        )
       ORDER BY users.name ASC`
  ).bind(subRole.id, subRole.department, subRole.teamId || "").all();
  return result.results || [];
}
__name(usersForSubRole2, "usersForSubRole");
async function fallbackSubRole3(db) {
  const row = await db.prepare(
    `SELECT id, label, slug, department, team_id AS teamId
       FROM creator_sub_roles
       WHERE status = 'Active'
       ORDER BY sort_order ASC, label ASC
       LIMIT 1`
  ).first();
  return row || null;
}
__name(fallbackSubRole3, "fallbackSubRole");
async function resolveWorkContext(db, context) {
  const user = await getAuthUser(context);
  if (user?.role === "normal") {
    return {
      response: failure("FORBIDDEN", "My Work is available to Creator / Reviewer and Admin users.", 403),
      user,
      subRole: null
    };
  }
  const requested = await resolveRequestedCreatorSubRole(db, context.request);
  const authSelected = user?.selectedSubRole || null;
  const subRole = requested || authSelected || (user?.role === "admin" ? await fallbackSubRole3(db) : null);
  if (!subRole) {
    return {
      response: failure("SUB_ROLE_REQUIRED", "Select a Creator / Reviewer department before viewing My Work.", 400),
      user,
      subRole: null
    };
  }
  if (user?.role === "creator" && !user.subRoles.some((item) => item.id === subRole.id)) {
    return {
      response: failure("FORBIDDEN", "Your account is not assigned to this Creator / Reviewer department.", 403),
      user,
      subRole: null
    };
  }
  return { response: null, user, subRole };
}
__name(resolveWorkContext, "resolveWorkContext");
async function querySubmittedRequests(db, subRole, selectedUser) {
  const clauses = [
    "sop_requests.owner_sub_role_id = ?",
    "sop_requests.assigned_department = ?",
    "sop_requests.assigned_team_id = ?"
  ];
  const values = [subRole.id, subRole.department, subRole.teamId || ""];
  if (selectedUser?.email) {
    clauses.push("lower(sop_requests.submitted_by_email) = lower(?)");
    values.push(selectedUser.email);
  }
  const result = await db.prepare(
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
       WHERE ${clauses.map((clause) => `(${clause})`).join(" OR ")}
       ORDER BY sop_requests.updated_at DESC
       LIMIT 100`
  ).bind(...values).all();
  return (result.results || []).map(normalizeRequest);
}
__name(querySubmittedRequests, "querySubmittedRequests");
async function queryDraftSops(db, subRole, selectedUser) {
  const scope = scopeClause("sops", subRole);
  const userClause = selectedUser?.id ? "AND (COALESCE(sops.owner_id, sops.owner_user_id) = ? OR sops.created_by_user_id = ? OR ? = '')" : "";
  const values = selectedUser?.id ? [...scope.values, selectedUser.id, selectedUser.id, selectedUser.id] : scope.values;
  const result = await db.prepare(
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
       WHERE ${scope.sql}
        AND COALESCE(sops.is_active, 1) = 1
        AND sops.status IN ('Draft', 'Needs Revision', 'In Review', 'Approved')
        ${userClause}
       ORDER BY sops.updated_at DESC
       LIMIT 100`
  ).bind(...values).all();
  return (result.results || []).map(normalizeSop2);
}
__name(queryDraftSops, "queryDraftSops");
async function queryOwnedSops(db, subRole) {
  const scope = scopeClause("sops", subRole);
  const result = await db.prepare(
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
       WHERE ${scope.sql}
        AND COALESCE(sops.is_active, 1) = 1
       ORDER BY sops.updated_at DESC
       LIMIT 100`
  ).bind(...scope.values).all();
  return (result.results || []).map(normalizeSop2);
}
__name(queryOwnedSops, "queryOwnedSops");
async function queryAssignments(db, subRole, selectedUser) {
  const clauses = ["sop_assignments.team_id = ?"];
  const values = [subRole.teamId || ""];
  if (selectedUser?.id) {
    clauses.push("sop_assignments.user_id = ?");
    values.push(selectedUser.id);
  }
  const result = await db.prepare(
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
        AND (${clauses.join(" OR ")})
       ORDER BY sop_assignments.due_at ASC, sops.updated_at DESC
       LIMIT 100`
  ).bind(...values).all();
  return (result.results || []).map(normalizeSop2);
}
__name(queryAssignments, "queryAssignments");
async function queryReviewItems(db, subRole, selectedUser) {
  const requestClauses = [
    "sop_requests.owner_sub_role_id = ?",
    "sop_requests.assigned_department = ?",
    "sop_requests.assigned_team_id = ?"
  ];
  const requestValues = [subRole.id, subRole.department, subRole.teamId || ""];
  if (selectedUser?.id) {
    requestClauses.push("sop_requests.assigned_to = ?");
    requestValues.push(selectedUser.id);
  }
  const reviewClauses = ["sop_assignments.team_id = ?"];
  const reviewValues = [subRole.teamId || ""];
  if (selectedUser?.id) {
    reviewClauses.push("sop_assignments.user_id = ?");
    reviewValues.push(selectedUser.id);
  }
  const [requestReviews, assignmentReviews] = await Promise.all([
    db.prepare(
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
          'Submitted', 'Under Review', 'Needs More Information', 'Accepted', 'Assigned', 'In Progress', 'Draft Created', 'In Approval'
         )
          AND (${requestClauses.join(" OR ")})
         ORDER BY sop_requests.updated_at DESC
         LIMIT 100`
    ).bind(...requestValues).all(),
    db.prepare(
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
          AND (${reviewClauses.join(" OR ")})
         ORDER BY sop_assignments.due_at ASC, sops.updated_at DESC
         LIMIT 100`
    ).bind(...reviewValues).all()
  ]);
  return [
    ...(requestReviews.results || []).map(normalizeRequest),
    ...(assignmentReviews.results || []).map(normalizeReview)
  ];
}
__name(queryReviewItems, "queryReviewItems");
function uniqueById(items) {
  const map = /* @__PURE__ */ new Map();
  items.forEach((item) => {
    const id = String(item.id || "");
    if (id && !map.has(id)) map.set(id, item);
  });
  return Array.from(map.values());
}
__name(uniqueById, "uniqueById");
var onRequestGet21 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const db = context.env.DB;
  await ensureRequestWorkflowSchema(db);
  const resolved = await resolveWorkContext(db, context);
  if (resolved.response || !resolved.subRole) return resolved.response;
  const url = new URL(context.request.url);
  const requestedUserId = optionalText(url.searchParams.get("userId"), 160);
  const users = await usersForSubRole2(db, resolved.subRole);
  const selectedUser = users.find((user) => user.id === requestedUserId) || users.find((user) => user.id === resolved.user?.id) || users[0] || null;
  const [submittedRequests, draftSops, ownedSops, assignedItems, reviewItems] = await Promise.all([
    querySubmittedRequests(db, resolved.subRole, selectedUser),
    queryDraftSops(db, resolved.subRole, selectedUser),
    queryOwnedSops(db, resolved.subRole),
    queryAssignments(db, resolved.subRole, selectedUser),
    queryReviewItems(db, resolved.subRole, selectedUser)
  ]);
  const today = isoToday();
  const activeReviewItems = uniqueById(reviewItems);
  const assigned = uniqueById([...assignedItems, ...draftSops.filter((sop) => sop.status !== "Published")]);
  const overdueReviews = uniqueById([
    ...ownedSops.filter((sop) => sop.reviewDate && sop.reviewDate < today && sop.status !== "Archived"),
    ...assigned.filter((item) => item.reviewDate && item.reviewDate < today),
    ...activeReviewItems.filter((item) => item.reviewDate && item.reviewDate < today)
  ]);
  return success({
    context: {
      role: resolved.user?.role || "creator",
      accessLevel: selectedUser?.accessLevel || resolved.user?.accessLevel || "Creator / Reviewer",
      selectedUser,
      selectedSubRole: resolved.subRole
    },
    viewOptions: {
      users,
      subRoles: [resolved.subRole]
    },
    counts: {
      submittedRequests: submittedRequests.length,
      draftSops: draftSops.length,
      assignedToMe: assigned.length,
      needMyReview: activeReviewItems.length,
      overdueReviews: overdueReviews.length
    },
    sections: {
      submittedRequests,
      draftSops,
      assignedItems: assigned,
      ownedSops,
      reviewItems: activeReviewItems,
      overdueReviews
    }
  });
}, "onRequestGet");

// api/review-queue.ts
var managedRequestColumns = {
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
  submitted_at: "INTEGER",
  reviewed_at: "INTEGER",
  assigned_at: "INTEGER",
  accepted_at: "INTEGER",
  declined_at: "INTEGER",
  approved_at: "INTEGER",
  published_at: "INTEGER",
  closed_at: "INTEGER"
};
var requestStatusByAction = {
  review: "Under Review",
  accept: "Accepted",
  decline: "Declined",
  assign: "Assigned",
  "more-info": "Needs More Information",
  revision: "Needs More Information",
  convert: "Draft Created",
  approve: "Approved",
  publish: "Published",
  archive: "Closed",
  close: "Closed"
};
var sopActionByQueueAction = {
  review: "submit-review",
  submit: "submit-review",
  revision: "request-changes",
  "more-info": "request-changes",
  approve: "approve",
  publish: "publish",
  archive: "archive"
};
var legacyRequestStatusMap = {
  new: "Submitted",
  triage: "Under Review",
  assigned: "Assigned",
  drafting: "In Progress",
  in_review: "In Approval",
  needs_revision: "Needs More Information",
  approved: "Approved",
  published: "Published",
  archived: "Closed"
};
function normalizeDate3(value) {
  if (!value) return "";
  if (typeof value === "number") return new Date(value * 1e3).toISOString().slice(0, 10);
  const raw = String(value);
  if (/^\d+$/.test(raw)) return new Date(Number(raw) * 1e3).toISOString().slice(0, 10);
  return raw.slice(0, 10);
}
__name(normalizeDate3, "normalizeDate");
function statusKey(status) {
  return String(status || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
__name(statusKey, "statusKey");
function normalizeRequestStatus(status) {
  const raw = String(status || "").trim();
  return legacyRequestStatusMap[raw.toLowerCase()] || raw || "Submitted";
}
__name(normalizeRequestStatus, "normalizeRequestStatus");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
async function ensureRequestWorkflowSchema2(db) {
  const info = await db.prepare("PRAGMA table_info(sop_requests)").all();
  const existing = new Set((info.results || []).map((row) => row.name));
  for (const [column, type] of Object.entries(managedRequestColumns)) {
    if (!existing.has(column)) {
      await db.prepare(`ALTER TABLE sop_requests ADD COLUMN ${column} ${type}`).run();
    }
  }
}
__name(ensureRequestWorkflowSchema2, "ensureRequestWorkflowSchema");
async function fallbackSubRole4(db) {
  return await db.prepare(
    `SELECT id, label, slug, department, team_id AS teamId
       FROM creator_sub_roles
       WHERE status = 'Active'
       ORDER BY sort_order ASC, label ASC
       LIMIT 1`
  ).first();
}
__name(fallbackSubRole4, "fallbackSubRole");
async function usersForSubRole3(db, subRole) {
  const result = await db.prepare(
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
       ORDER BY users.name ASC`
  ).bind(subRole.id, subRole.teamId || "", subRole.department).all();
  return result.results || [];
}
__name(usersForSubRole3, "usersForSubRole");
async function resolveQueueContext(db, context) {
  const auth = await requirePermission(context, "Review SOPs");
  if (auth.response || !auth.user) return { response: auth.response, user: auth.user, subRole: null };
  if (auth.user.role === "normal") {
    return {
      response: failure("FORBIDDEN", "Review Queue is available to Creator / Reviewer and Admin users.", 403),
      user: auth.user,
      subRole: null
    };
  }
  const requested = await resolveRequestedCreatorSubRole(db, context.request);
  const subRole = requested || auth.user.selectedSubRole || (auth.user.role === "admin" ? await fallbackSubRole4(db) : null);
  if (!subRole) {
    return {
      response: failure("SUB_ROLE_REQUIRED", "Select a Creator / Reviewer department before viewing the Review Queue.", 400),
      user: auth.user,
      subRole: null
    };
  }
  if (auth.user.role === "creator" && !auth.user.subRoles.some((item) => item.id === subRole.id)) {
    return {
      response: failure("FORBIDDEN", "Your account is not assigned to this Creator / Reviewer department.", 403),
      user: auth.user,
      subRole: null
    };
  }
  return { response: null, user: auth.user, subRole };
}
__name(resolveQueueContext, "resolveQueueContext");
function requestActions(user) {
  return [
    "view",
    ...hasPermission(user, "Review SOPs") ? ["review", "accept", "assign", "more-info", "decline", "convert"] : [],
    ...hasPermission(user, "Approve SOPs") ? ["approve"] : [],
    ...hasPermission(user, "Publish SOPs") ? ["publish"] : [],
    ...hasPermission(user, "Archive SOPs") ? ["archive"] : []
  ];
}
__name(requestActions, "requestActions");
function sopActions(user, status) {
  const actions = ["view"];
  if (status === "Draft" || status === "Needs Revision") actions.push("edit");
  if (hasPermission(user, "Review SOPs")) actions.push("assign");
  if (hasPermission(user, "Request Changes") && status === "In Review") actions.push("revision");
  if (hasPermission(user, "Approve SOPs") && status === "In Review") actions.push("approve");
  if (hasPermission(user, "Publish SOPs") && status === "Approved") actions.push("publish");
  if (hasPermission(user, "Archive SOPs")) actions.push("archive");
  return actions;
}
__name(sopActions, "sopActions");
function normalizeRequest2(row, user) {
  const status = normalizeRequestStatus(row.status);
  const itemType = String(row.requestType || "").toLowerCase().includes("template") ? "Templates" : String(row.requestType || "").toLowerCase().includes("update") ? "Updates" : "New SOP Requests";
  const source = row.departmentName && row.assignedDepartment && row.departmentName !== row.assignedDepartment ? "Outside Department Submission" : "SOP Request";
  const id = String(row.id || "");
  return {
    id: `request:${id}`,
    originalId: id,
    itemType: "request",
    source,
    filterGroup: itemType,
    title: row.requestedTitle || "Untitled SOP Request",
    submissionType: row.requestType || "Request a new SOP",
    category: row.category || "Uncategorized",
    department: row.departmentName || row.assignedDepartment || "",
    owner: row.assignedDepartment || row.ownerSubRole || "Unassigned",
    submittedBy: row.submittedByName || row.submittedByEmail || "Unknown",
    assignedTo: row.assignedTo || "",
    assignedReviewer: row.assignedToName || row.assignedDepartment || "Unassigned",
    priority: row.priority || "Medium",
    status,
    reviewDate: normalizeDate3(row.desiredCompletionAt || row.assignedAt || row.createdAt),
    submittedDate: normalizeDate3(row.submittedAt || row.createdAt),
    updatedDate: normalizeDate3(row.updatedAt || row.createdAt),
    detailUrl: `/admin/review/?request=${encodeURIComponent(id)}`,
    editUrl: row.draftSopId ? `/create/?edit=draft&id=${encodeURIComponent(String(row.draftSopId))}` : "",
    relatedSopId: row.relatedSopId || row.existingSopId || "",
    draftSopId: row.draftSopId || "",
    reviewerNotes: row.reviewerNotes || "",
    denialReason: row.denialReason || "",
    availableActions: requestActions(user)
  };
}
__name(normalizeRequest2, "normalizeRequest");
function normalizeSop3(row, user) {
  const id = String(row.id || "");
  const status = String(row.status || "In Review");
  return {
    id: `sop:${id}`,
    originalId: id,
    itemType: "sop",
    source: "Internal SOP Creator",
    filterGroup: "Internal Drafts",
    title: row.title || "Untitled SOP",
    submissionType: row.type || "SOP Draft",
    category: row.category || "Uncategorized",
    department: row.ownerDepartment || row.ownerSubRole || "",
    owner: row.owner || row.ownerSubRole || "Unassigned",
    submittedBy: row.createdBy || row.owner || "Unknown",
    assignedTo: row.assignedTo || "",
    assignedReviewer: row.assignedReviewer || "Unassigned",
    priority: row.priority || "Medium",
    status,
    reviewDate: normalizeDate3(row.dueAt || row.reviewDate || row.reviewDueAt),
    submittedDate: normalizeDate3(row.createdAt),
    updatedDate: normalizeDate3(row.updatedAt || row.createdAt),
    detailUrl: row.slug ? `/sops/detail/?slug=${encodeURIComponent(String(row.slug))}` : `/sops/detail/?id=${encodeURIComponent(id)}`,
    editUrl: `/create/?edit=draft&id=${encodeURIComponent(id)}`,
    assignmentType: row.assignmentType || "",
    reviewerNotes: row.reviewerNotes || "",
    availableActions: sopActions(user, status)
  };
}
__name(normalizeSop3, "normalizeSop");
async function queryRequests(db, subRole, selectedUser, user) {
  const clauses = ["sop_requests.owner_sub_role_id = ?", "sop_requests.assigned_department = ?", "sop_requests.assigned_team_id = ?"];
  const values = [subRole.id, subRole.department, subRole.teamId || ""];
  if (selectedUser?.id) {
    clauses.push("sop_requests.assigned_to = ?");
    values.push(selectedUser.id);
  }
  const result = await db.prepare(
    `SELECT
        sop_requests.id,
        sop_requests.request_type AS requestType,
        sop_requests.requested_title AS requestedTitle,
        sop_requests.department_name AS departmentName,
        sop_requests.submitted_by_name AS submittedByName,
        sop_requests.submitted_by_email AS submittedByEmail,
        sop_requests.priority,
        sop_requests.desired_completion_at AS desiredCompletionAt,
        sop_requests.existing_sop_id AS existingSopId,
        sop_requests.related_sop_id AS relatedSopId,
        sop_requests.draft_sop_id AS draftSopId,
        sop_requests.category_name AS category,
        sop_requests.status,
        sop_requests.assigned_to AS assignedTo,
        assignee.name AS assignedToName,
        sop_requests.assigned_department AS assignedDepartment,
        sop_requests.owner_sub_role_id AS ownerSubRoleId,
        sub_roles.label AS ownerSubRole,
        sop_requests.reviewer_notes AS reviewerNotes,
        sop_requests.denial_reason AS denialReason,
        sop_requests.submitted_at AS submittedAt,
        sop_requests.assigned_at AS assignedAt,
        sop_requests.created_at AS createdAt,
        sop_requests.updated_at AS updatedAt
       FROM sop_requests
       LEFT JOIN users assignee ON assignee.id = sop_requests.assigned_to
       LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sop_requests.owner_sub_role_id
       WHERE (${clauses.join(" OR ")})
       ORDER BY sop_requests.updated_at DESC, sop_requests.created_at DESC
       LIMIT 200`
  ).bind(...values).all();
  return (result.results || []).map((row) => normalizeRequest2(row, user));
}
__name(queryRequests, "queryRequests");
async function querySopReviews(db, subRole, selectedUser, user) {
  const scopeClauses = ["sops.owner_sub_role_id = ?"];
  const scopeValues = [subRole.id];
  if (subRole.teamId) {
    scopeClauses.push("sops.owner_team_id = ?");
    scopeValues.push(subRole.teamId);
    scopeClauses.push("assignments.team_id = ?");
    scopeValues.push(subRole.teamId);
  }
  const userClauses = [];
  const userValues = [];
  if (selectedUser?.id) {
    userClauses.push("assignments.user_id = ?");
    userValues.push(selectedUser.id);
    userClauses.push("COALESCE(sops.owner_id, sops.owner_user_id) = ?");
    userValues.push(selectedUser.id);
  }
  const result = await db.prepare(
    `SELECT
        sops.id,
        sops.title,
        sops.slug,
        sops.status,
        sops.type,
        sops.review_date AS reviewDate,
        sops.review_due_at AS reviewDueAt,
        sops.created_at AS createdAt,
        sops.updated_at AS updatedAt,
        categories.name AS category,
        owner.name AS owner,
        creator.name AS createdBy,
        sub_roles.label AS ownerSubRole,
        sub_roles.department AS ownerDepartment,
        assignments.user_id AS assignedTo,
        assignments.assignment_type AS assignmentType,
        assignments.due_at AS dueAt,
        reviewer.name AS assignedReviewer
       FROM sops
       LEFT JOIN categories ON categories.id = sops.category_id
       LEFT JOIN users owner ON owner.id = COALESCE(sops.owner_id, sops.owner_user_id)
       LEFT JOIN users creator ON creator.id = sops.created_by_user_id
       LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sops.owner_sub_role_id
       LEFT JOIN sop_assignments assignments ON assignments.sop_id = sops.id
        AND assignments.status = 'Active'
        AND assignments.assignment_type IN ('Reviewer', 'Approver', 'Publisher')
       LEFT JOIN users reviewer ON reviewer.id = assignments.user_id
       WHERE COALESCE(sops.is_active, 1) = 1
        AND sops.status IN ('In Review', 'Needs Revision', 'Approved', 'Published', 'Archived')
        AND (${scopeClauses.join(" OR ")})
        ${userClauses.length ? `AND (${userClauses.join(" OR ")})` : ""}
       GROUP BY sops.id
       ORDER BY sops.updated_at DESC, assignments.due_at ASC, sops.title ASC
       LIMIT 200`
  ).bind(...scopeValues, ...userValues).all();
  return (result.results || []).map((row) => normalizeSop3(row, user));
}
__name(querySopReviews, "querySopReviews");
function summarize(items) {
  const byStatus = {};
  items.forEach((item) => {
    const key = statusKey(item.status) || "unknown";
    byStatus[key] = (byStatus[key] || 0) + 1;
  });
  return {
    all: items.length,
    new: items.filter((item) => ["submitted", "assigned", "draft"].includes(statusKey(item.status))).length,
    needsReview: items.filter(
      (item) => [
        "submitted",
        "assigned",
        "draft",
        "under-review",
        "in-review",
        "needs-more-information",
        "needs-revision",
        "accepted",
        "in-progress",
        "draft-created",
        "in-approval"
      ].includes(statusKey(item.status))
    ).length,
    urgent: items.filter((item) => ["High", "Urgent"].includes(String(item.priority || ""))).length,
    approved: items.filter((item) => statusKey(item.status) === "approved").length,
    published: items.filter((item) => statusKey(item.status) === "published").length,
    archived: items.filter((item) => ["archived", "closed", "declined"].includes(statusKey(item.status))).length,
    byStatus
  };
}
__name(summarize, "summarize");
function needsReviewStatus(status) {
  return [
    "submitted",
    "assigned",
    "draft",
    "under-review",
    "in-review",
    "needs-more-information",
    "needs-revision",
    "accepted",
    "in-progress",
    "draft-created",
    "in-approval"
  ].includes(statusKey(status));
}
__name(needsReviewStatus, "needsReviewStatus");
var onRequestGet22 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const db = context.env.DB;
  await ensureRequestWorkflowSchema2(db);
  const resolved = await resolveQueueContext(db, context);
  if (resolved.response || !resolved.subRole || !resolved.user) return resolved.response;
  const url = new URL(context.request.url);
  const view = optionalText(url.searchParams.get("view"), 40);
  const requestedUserId = optionalText(url.searchParams.get("userId"), 160);
  const users = await usersForSubRole3(db, resolved.subRole);
  const selectedUser = users.find((user) => user.id === requestedUserId) || users.find((user) => user.id === resolved.user?.id) || users[0] || null;
  const [requests, sops] = await Promise.all([
    queryRequests(db, resolved.subRole, selectedUser, resolved.user),
    querySopReviews(db, resolved.subRole, selectedUser, resolved.user)
  ]);
  const allItems = [...requests, ...sops].sort((a, b) => String(b.updatedDate).localeCompare(String(a.updatedDate)));
  const items = view === "needs-review" ? allItems.filter((item) => needsReviewStatus(item.status)) : allItems;
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        context: {
          role: resolved.user.role,
          accessLevel: selectedUser?.accessLevel || resolved.user.accessLevel,
          selectedUser,
          selectedSubRole: resolved.subRole,
          permissions: resolved.user.permissions
        },
        viewOptions: { users, subRoles: [resolved.subRole] },
        counts: summarize(allItems),
        items
      }
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders("private"),
        vary: "x-sop-sub-role"
      }
    }
  );
}, "onRequestGet");
async function updateRequest(db, payload, actorId) {
  const originalId = optionalText(payload.id, 160).replace(/^request:/, "");
  if (!originalId) return failure("VALIDATION_ERROR", "Review item id is required.", 400, { id: "Required" });
  const now = unixNow();
  const action = optionalText(payload.action, 80) || "update";
  const status = optionalText(payload.status, 80) || requestStatusByAction[action] || "Under Review";
  const assignedTo = optionalText(payload.assignedTo, 160) || null;
  const notes = optionalText(payload.notes, 6e3);
  const denialReason = optionalText(payload.denialReason, 3e3);
  const draftSopId = action === "convert" ? await createDraftFromQueueRequest(db, originalId, actorId) : null;
  await db.prepare(
    `UPDATE sop_requests
       SET status = ?,
        assigned_to = COALESCE(?, assigned_to),
        reviewer_notes = COALESCE(NULLIF(?, ''), reviewer_notes),
        denial_reason = CASE WHEN ? = 'Declined' THEN COALESCE(NULLIF(?, ''), denial_reason) ELSE denial_reason END,
        draft_sop_id = COALESCE(?, draft_sop_id),
        reviewed_at = COALESCE(reviewed_at, ?),
        assigned_at = CASE WHEN ? = 'Assigned' THEN COALESCE(assigned_at, ?) ELSE assigned_at END,
        accepted_at = CASE WHEN ? = 'Accepted' THEN COALESCE(accepted_at, ?) ELSE accepted_at END,
        declined_at = CASE WHEN ? = 'Declined' THEN COALESCE(declined_at, ?) ELSE declined_at END,
        approved_at = CASE WHEN ? = 'Approved' THEN COALESCE(approved_at, ?) ELSE approved_at END,
        published_at = CASE WHEN ? = 'Published' THEN COALESCE(published_at, ?) ELSE published_at END,
        closed_at = CASE WHEN ? IN ('Closed', 'Declined') THEN COALESCE(closed_at, ?) ELSE closed_at END,
        updated_at = ?
       WHERE id = ?`
  ).bind(
    status,
    assignedTo,
    notes,
    status,
    denialReason || notes,
    draftSopId,
    now,
    status,
    now,
    status,
    now,
    status,
    now,
    status,
    now,
    status,
    now,
    status,
    now,
    now,
    originalId
  ).run();
  await db.prepare(
    `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(newId("audit"), actorId, `review_request_${action}`, "sop_request", originalId, JSON.stringify({ status, assignedTo, notes }), now).run();
  if (action === "publish") {
    await db.prepare(
      `UPDATE sops
         SET status = 'Published', published_at = COALESCE(published_at, ?), is_active = 1, updated_at = ?
         WHERE id = (SELECT COALESCE(draft_sop_id, related_sop_id, existing_sop_id) FROM sop_requests WHERE id = ?)`
    ).bind(nowIso(), nowIso(), originalId).run();
  }
  return success({ id: `request:${originalId}`, status, draftSopId }, "Review request updated.");
}
__name(updateRequest, "updateRequest");
async function createDraftFromQueueRequest(db, requestId, actorId) {
  const request = await db.prepare(
    `SELECT
        sop_requests.id,
        sop_requests.requested_title AS requestedTitle,
        sop_requests.description,
        sop_requests.category_id AS categoryId,
        sop_requests.assigned_to AS assignedTo,
        sop_requests.assigned_team_id AS assignedTeamId,
        sop_requests.owner_sub_role_id AS ownerSubRoleId,
        sop_requests.requested_sop_type AS requestedSopType,
        sop_requests.audience,
        sop_requests.tool_system AS toolOrSystem,
        sop_requests.draft_content AS draftContent,
        sop_requests.draft_sop_id AS draftSopId
       FROM sop_requests
       WHERE id = ?
       LIMIT 1`
  ).bind(requestId).first();
  if (!request) return null;
  if (request.draftSopId) return String(request.draftSopId);
  const sopId = newId("sop");
  const versionId = newId("version");
  const title = optionalText(request.requestedTitle || "Untitled SOP Request", 180);
  const description = optionalText(request.description, 4e3);
  const content = optionalText(request.draftContent || description || title, 5e4);
  const createdAt = nowIso();
  const updatedAt = Math.floor(Date.now() / 1e3);
  const metadata = JSON.stringify({
    audience: String(request.audience || "").split(/[\n,|]/).map((item) => item.trim()).filter(Boolean),
    tools: String(request.toolOrSystem || "").split(/[\n,|]/).map((item) => item.trim()).filter(Boolean),
    sourceRequestId: requestId
  });
  await db.prepare(
    `INSERT INTO sops (
        id, title, slug, summary, purpose, category_id, owner_id, owner_user_id,
        owner_team_id, owner_sub_role_id, status, type, current_version_id,
        audience, is_active, created_by_user_id, source_type, visibility, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, 1, ?, 'Database', 'Internal', ?, ?)`
  ).bind(
    sopId,
    title,
    slugify(title, sopId),
    description.slice(0, 1e3),
    description,
    request.categoryId || null,
    request.assignedTo || actorId,
    request.assignedTo || actorId,
    request.assignedTeamId || null,
    request.ownerSubRoleId || null,
    request.requestedSopType || "Process",
    versionId,
    request.audience || "",
    actorId,
    createdAt,
    createdAt
  ).run();
  await db.prepare(
    `INSERT INTO sop_versions (
        id, sop_id, version_label, version_number, title, summary, purpose,
        body_markdown, content, metadata_json, change_summary, status,
        created_by_user_id, created_by, created_at, updated_at
      ) VALUES (?, ?, '0.1', '0.1', ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?)`
  ).bind(
    versionId,
    sopId,
    title,
    description.slice(0, 1e3),
    description,
    content,
    content,
    metadata,
    `Draft created from SOP request ${requestId}.`,
    actorId,
    actorId,
    createdAt,
    updatedAt
  ).run();
  return sopId;
}
__name(createDraftFromQueueRequest, "createDraftFromQueueRequest");
async function assignSop(db, sopId, assignedTo, actorId, notes) {
  const sop = await db.prepare("SELECT id, current_version_id AS currentVersionId, owner_team_id AS ownerTeamId, review_date AS reviewDate FROM sops WHERE id = ? LIMIT 1").bind(sopId).first();
  if (!sop) return failure("NOT_FOUND", "SOP not found.", 404);
  await db.prepare(
    `INSERT INTO sop_assignments (
        id, sop_id, version_id, user_id, team_id, assignment_type, status, assigned_by_user_id, due_at
      ) VALUES (?, ?, ?, ?, ?, 'Reviewer', 'Active', ?, ?)
      ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, status = 'Active', updated_at = CURRENT_TIMESTAMP`
  ).bind(`assignment-reviewer-${sopId}`, sopId, sop.currentVersionId || null, assignedTo || null, sop.ownerTeamId || null, actorId, sop.reviewDate || null).run();
  await db.prepare(
    `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(newId("audit"), actorId, "assign_sop_review", "sop", sopId, JSON.stringify({ assignedTo, notes }), unixNow()).run();
  return success({ id: `sop:${sopId}`, assignedTo }, "SOP review assigned.");
}
__name(assignSop, "assignSop");
async function updateSop(db, payload, actorId) {
  const sopId = optionalText(payload.id, 160).replace(/^sop:/, "");
  if (!sopId) return failure("VALIDATION_ERROR", "Review item id is required.", 400, { id: "Required" });
  const action = optionalText(payload.action, 80) || "review";
  const notes = optionalText(payload.notes, 6e3);
  const assignedTo = optionalText(payload.assignedTo, 160);
  if (action === "assign") return assignSop(db, sopId, assignedTo, actorId, notes);
  const workflowAction = sopActionByQueueAction[action] || (payload.status === "Approved" ? "approve" : payload.status === "Published" ? "publish" : payload.status === "Archived" ? "archive" : payload.status === "Needs Revision" ? "request-changes" : null);
  if (!workflowAction) return success({ id: `sop:${sopId}` }, "No workflow change was needed.");
  const transition = await transitionSop(db, {
    sopId,
    action: workflowAction,
    actorUserId: actorId,
    notes: notes || `${workflowAction} from Review Queue.`
  });
  if (!transition) return failure("NOT_FOUND", "SOP not found.", 404);
  return success({ id: `sop:${sopId}`, transition }, "SOP workflow updated.");
}
__name(updateSop, "updateSop");
function permissionForAction(itemType, action) {
  if (action === "archive") return "Archive SOPs";
  if (action === "publish") return "Publish SOPs";
  if (action === "approve") return "Approve SOPs";
  if (action === "revision" || action === "more-info") return "Request Changes";
  if (itemType === "request" && ["accept", "assign", "decline", "convert", "review"].includes(action)) return "Review SOPs";
  if (itemType === "sop" && ["assign", "review", "submit"].includes(action)) return "Review SOPs";
  return "Review SOPs";
}
__name(permissionForAction, "permissionForAction");
async function requestInScope(db, id, subRole, userId) {
  const row = await db.prepare(
    `SELECT id
       FROM sop_requests
       WHERE id = ?
        AND (
          owner_sub_role_id = ?
          OR assigned_department = ?
          OR assigned_team_id = ?
          OR assigned_to = ?
        )
       LIMIT 1`
  ).bind(id, subRole.id, subRole.department, subRole.teamId || "", userId).first();
  return Boolean(row);
}
__name(requestInScope, "requestInScope");
async function sopInScope(db, id, subRole, userId) {
  const row = await db.prepare(
    `SELECT sops.id
       FROM sops
       LEFT JOIN sop_assignments assignments ON assignments.sop_id = sops.id
        AND assignments.status = 'Active'
       WHERE sops.id = ?
        AND (
          sops.owner_sub_role_id = ?
          OR sops.owner_team_id = ?
          OR assignments.team_id = ?
          OR assignments.user_id = ?
        )
       LIMIT 1`
  ).bind(id, subRole.id, subRole.teamId || "", subRole.teamId || "", userId).first();
  return Boolean(row);
}
__name(sopInScope, "sopInScope");
var onRequestPut6 = /* @__PURE__ */ __name(async (context) => {
  const missingDb = requireDb(context.env.DB);
  if (missingDb) return missingDb;
  const resolved = await resolveQueueContext(context.env.DB, context);
  if (resolved.response || !resolved.user || !resolved.subRole) return resolved.response;
  const [payload, parseError] = await readBody(context.request);
  if (parseError) return parseError;
  const action = optionalText(payload?.action, 80) || "review";
  const itemType = payload?.itemType || (String(payload?.id || "").startsWith("request:") ? "request" : "sop");
  const requiredPermission = permissionForAction(itemType, action);
  if (!hasPermission(resolved.user, requiredPermission)) {
    return failure("FORBIDDEN", `You do not have permission to ${action} this review item.`, 403);
  }
  if (payload?.itemType === "request" || String(payload?.id || "").startsWith("request:")) {
    const id2 = optionalText(payload?.id, 160).replace(/^request:/, "");
    if (!await requestInScope(context.env.DB, id2, resolved.subRole, resolved.user.id)) {
      return failure("FORBIDDEN", "This request is not assigned to the selected Creator / Reviewer department.", 403);
    }
    return updateRequest(context.env.DB, payload || {}, resolved.user.id);
  }
  const id = optionalText(payload?.id, 160).replace(/^sop:/, "");
  if (!await sopInScope(context.env.DB, id, resolved.subRole, resolved.user.id)) {
    return failure("FORBIDDEN", "This SOP review item is not assigned to the selected Creator / Reviewer department.", 403);
  }
  return updateSop(context.env.DB, payload || {}, resolved.user.id);
}, "onRequestPut");

// api/sop-requests.ts
var requestTypes = /* @__PURE__ */ new Set([
  "Request a new SOP",
  "Suggest an update",
  "Suggest an update to an existing SOP",
  "Submit a department process",
  "Share a draft SOP for review",
  "Submit a draft SOP",
  "Request a template"
]);
var priorities2 = /* @__PURE__ */ new Set(["Low", "Medium", "High", "Urgent"]);
var statuses3 = /* @__PURE__ */ new Set([
  "Submitted",
  "Under Review",
  "Needs More Information",
  "Accepted",
  "Declined",
  "Assigned",
  "In Progress",
  "Draft Created",
  "In Approval",
  "Approved",
  "Published",
  "Closed"
]);
var legacyStatusMap = {
  new: "Submitted",
  triage: "Under Review",
  assigned: "Assigned",
  drafting: "In Progress",
  in_review: "In Approval",
  needs_revision: "Needs More Information",
  approved: "Approved",
  published: "Published",
  archived: "Closed"
};
var departmentRouting = [
  {
    department: "Instructional Technology",
    subRoleId: "subrole-instructional-technology-specialist",
    teamId: "team-instructional-technology-specialists",
    terms: ["technology", "tech", "ivanti", "ticket", "d2l", "brightspace", "access", "system", "software"]
  },
  {
    department: "Instructional Design",
    subRoleId: "subrole-instructional-designer",
    teamId: "team-instructional-designers",
    terms: ["instructional design", "design", "course build", "template", "curriculum", "content"]
  },
  {
    department: "Project Management",
    subRoleId: "subrole-project-manager",
    teamId: "team-project-managers",
    terms: ["project", "pmo", "monday", "timeline", "planning"]
  },
  {
    department: "Quality Assurance",
    subRoleId: "subrole-quality-assurance-specialist",
    teamId: "team-quality-assurance-specialists",
    terms: ["quality", "qa", "review", "approval", "checklist", "copyedit"]
  },
  {
    department: "Multimedia",
    subRoleId: "subrole-multimedia",
    teamId: "team-multimedia",
    terms: ["multimedia", "media", "video", "kaltura", "image", "audio", "interactive"]
  }
];
var managedColumns = {
  category_id: "TEXT",
  category_name: "TEXT",
  tool_system: "TEXT",
  audience: "TEXT",
  best_contact_method: "TEXT",
  frequency: "TEXT",
  requested_sop_type: "TEXT",
  assigned_department: "TEXT",
  assigned_team_id: "TEXT",
  owner_sub_role_id: "TEXT",
  reviewer_notes: "TEXT",
  denial_reason: "TEXT",
  request_notes: "TEXT",
  routing_reason: "TEXT",
  draft_sop_id: "TEXT",
  related_sop_id: "TEXT",
  submitted_at: "INTEGER",
  reviewed_at: "INTEGER",
  assigned_at: "INTEGER",
  accepted_at: "INTEGER",
  declined_at: "INTEGER",
  approved_at: "INTEGER",
  published_at: "INTEGER",
  closed_at: "INTEGER"
};
function normalizeLinks(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join("\n");
  return optionalText(value, 4e3);
}
__name(normalizeLinks, "normalizeLinks");
function normalizeStatus(value) {
  const raw = String(value || "").trim();
  if (statuses3.has(raw)) return raw;
  return legacyStatusMap[raw.toLowerCase()] || "Submitted";
}
__name(normalizeStatus, "normalizeStatus");
function nowStamp() {
  return unixNow();
}
__name(nowStamp, "nowStamp");
function textIncludesAny(text, terms) {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}
__name(textIncludesAny, "textIncludesAny");
async function ensureRequestWorkflowSchema3(db) {
  const info = await db.prepare("PRAGMA table_info(sop_requests)").all();
  const existing = new Set((info.results || []).map((row) => row.name));
  for (const [column, type] of Object.entries(managedColumns)) {
    if (!existing.has(column)) {
      await db.prepare(`ALTER TABLE sop_requests ADD COLUMN ${column} ${type}`).run();
    }
  }
}
__name(ensureRequestWorkflowSchema3, "ensureRequestWorkflowSchema");
async function resolveCategory(db, payload) {
  const categoryId = optionalText(payload.categoryId, 160);
  const categoryName = optionalText(payload.category, 180);
  if (!categoryId && !categoryName) return { id: null, name: null, slug: null };
  const row = await db.prepare(
    `SELECT id, name, slug
       FROM categories
       WHERE id = ? OR slug = ? OR lower(name) = lower(?)
       LIMIT 1`
  ).bind(categoryId, categoryName, categoryName).first();
  return {
    id: row?.id || categoryId || null,
    name: row?.name || categoryName || null,
    slug: row?.slug || null
  };
}
__name(resolveCategory, "resolveCategory");
async function findAssigneeForRoute(db, route) {
  const row = await db.prepare(
    `SELECT users.id, users.name
       FROM users
       LEFT JOIN user_creator_sub_roles user_sub_roles ON user_sub_roles.user_id = users.id
       WHERE users.status = 'Active'
        AND COALESCE(users.is_active, 1) = 1
        AND (
          users.department = ?
          OR users.team_id = ?
          OR user_sub_roles.sub_role_id = ?
        )
       ORDER BY users.name ASC
       LIMIT 1`
  ).bind(route.department, route.teamId, route.subRoleId).first().catch(() => null);
  return row || null;
}
__name(findAssigneeForRoute, "findAssigneeForRoute");
async function routeRequest(db, payload, categoryName) {
  const haystack = [
    payload.requestType,
    payload.departmentName,
    payload.requestedTitle,
    payload.description,
    payload.toolOrSystem,
    payload.requestedSopType,
    categoryName
  ].filter(Boolean).join(" ");
  const route = departmentRouting.find((candidate) => textIncludesAny(haystack, candidate.terms)) || departmentRouting[0];
  const assignee = await findAssigneeForRoute(db, route);
  return {
    ...route,
    assignedTo: optionalText(payload.assignedTo, 120) || assignee?.id || null,
    assignedToName: assignee?.name || "",
    routingReason: `Matched ${route.department} from request type, department, category, tool, or keywords.`
  };
}
__name(routeRequest, "routeRequest");
function selectRequests(where = "") {
  return `SELECT
    sop_requests.id,
    sop_requests.request_type AS requestType,
    sop_requests.requested_title AS requestedTitle,
    sop_requests.department_name AS departmentName,
    sop_requests.submitted_by_name AS submittedByName,
    sop_requests.submitted_by_email AS submittedByEmail,
    sop_requests.role_title AS roleTitle,
    sop_requests.description,
    sop_requests.priority,
    sop_requests.desired_completion_at AS desiredCompletionAt,
    sop_requests.existing_sop_id AS existingSopId,
    sops.title AS existingSopTitle,
    sop_requests.related_sop_id AS relatedSopId,
    related_sops.title AS relatedSopTitle,
    sop_requests.draft_sop_id AS draftSopId,
    draft_sops.title AS draftSopTitle,
    sop_requests.draft_content AS draftContent,
    sop_requests.related_links AS relatedLinks,
    sop_requests.documentation_location AS documentationLocation,
    sop_requests.category_id AS categoryId,
    sop_requests.category_name AS category,
    sop_requests.tool_system AS toolOrSystem,
    sop_requests.audience,
    sop_requests.best_contact_method AS bestContactMethod,
    sop_requests.frequency,
    sop_requests.requested_sop_type AS requestedSopType,
    sop_requests.status,
    sop_requests.assigned_to AS assignedTo,
    assignee.name AS assignedToName,
    sop_requests.assigned_department AS assignedDepartment,
    sop_requests.assigned_team_id AS assignedTeamId,
    sop_requests.owner_sub_role_id AS ownerSubRoleId,
    sub_roles.label AS ownerSubRole,
    sop_requests.reviewer_notes AS reviewerNotes,
    sop_requests.denial_reason AS denialReason,
    sop_requests.request_notes AS requestNotes,
    sop_requests.routing_reason AS routingReason,
    sop_requests.submitted_at AS submittedAt,
    sop_requests.reviewed_at AS reviewedAt,
    sop_requests.assigned_at AS assignedAt,
    sop_requests.accepted_at AS acceptedAt,
    sop_requests.declined_at AS declinedAt,
    sop_requests.approved_at AS approvedAt,
    sop_requests.published_at AS publishedAt,
    sop_requests.closed_at AS closedAt,
    sop_requests.created_at AS createdAt,
    sop_requests.updated_at AS updatedAt
  FROM sop_requests
  LEFT JOIN sops ON sops.id = sop_requests.existing_sop_id
  LEFT JOIN sops related_sops ON related_sops.id = sop_requests.related_sop_id
  LEFT JOIN sops draft_sops ON draft_sops.id = sop_requests.draft_sop_id
  LEFT JOIN users assignee ON assignee.id = sop_requests.assigned_to
  LEFT JOIN creator_sub_roles sub_roles ON sub_roles.id = sop_requests.owner_sub_role_id
  ${where}`;
}
__name(selectRequests, "selectRequests");
function responseMessage(action) {
  switch (action) {
    case "accept":
      return "SOP request accepted.";
    case "decline":
      return "SOP request declined.";
    case "assign":
      return "SOP request assigned.";
    case "more-info":
      return "SOP request marked as needing more information.";
    case "convert":
      return "SOP request converted into a draft.";
    case "link":
      return "SOP request linked to an SOP.";
    case "approve":
      return "SOP request approved.";
    case "publish":
      return "SOP request published.";
    case "close":
      return "SOP request closed.";
    default:
      return "SOP request updated.";
  }
}
__name(responseMessage, "responseMessage");
var onRequestGet23 = /* @__PURE__ */ __name(async ({ request, env }) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  await ensureRequestWorkflowSchema3(env.DB);
  const user = await getAuthUser({ request, env });
  const url = new URL(request.url);
  const email = optionalText(url.searchParams.get("email"), 180);
  const status = optionalText(url.searchParams.get("status"), 80);
  const assignedTo = optionalText(url.searchParams.get("assignedTo"), 120);
  const assignedDepartment = optionalText(url.searchParams.get("assignedDepartment"), 160);
  const category = optionalText(url.searchParams.get("category"), 180);
  const role = user?.role || "normal";
  if (role === "normal" && !email && !user?.email) {
    return failure("FORBIDDEN", "Normal users must filter requests by email.", 403);
  }
  if (!user && !email) {
    return failure("UNAUTHENTICATED", "Sign in or provide the submitter email to view requests.", 401);
  }
  const where = [];
  const values = [];
  if (role === "normal" || email) {
    where.push("lower(sop_requests.submitted_by_email) = lower(?)");
    values.push(email || user?.email);
  }
  if (status) {
    where.push("sop_requests.status = ?");
    values.push(status);
  }
  if (assignedTo && role !== "normal") {
    where.push("(sop_requests.assigned_to = ? OR assignee.name = ?)");
    values.push(assignedTo, assignedTo);
  }
  if (assignedDepartment && role !== "normal") {
    where.push("sop_requests.assigned_department = ?");
    values.push(assignedDepartment);
  }
  if (category) {
    where.push("(sop_requests.category_id = ? OR sop_requests.category_name = ?)");
    values.push(category, category);
  }
  const result = await env.DB.prepare(
    `${selectRequests(where.length ? `WHERE ${where.join(" AND ")}` : "")}
     ORDER BY sop_requests.created_at DESC
     LIMIT 250`
  ).bind(...values).all();
  return success({ requests: result.results || [] });
}, "onRequestGet");
var onRequestPost19 = /* @__PURE__ */ __name(async ({ request, env }) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  await ensureRequestWorkflowSchema3(env.DB);
  const [payload, parseError] = await readBody(request);
  if (parseError) return parseError;
  const fields = {};
  const requestType = optionalText(payload?.requestType || "Request a new SOP", 120);
  const requestedTitle = optionalText(payload?.requestedTitle, 180);
  const departmentName = optionalText(payload?.departmentName, 160);
  const submittedByName = optionalText(payload?.submittedByName, 160);
  const submittedByEmail = optionalText(payload?.submittedByEmail, 180);
  const description = optionalText(payload?.description, 8e3);
  const category = await resolveCategory(env.DB, payload || {});
  const route = await routeRequest(env.DB, payload || {}, category.name);
  if (!requestTypes.has(requestType)) fields.requestType = "Choose a valid submission type.";
  if (!requestedTitle) fields.requestedTitle = "Requested title is required.";
  if (!departmentName) fields.departmentName = "Department name is required.";
  if (!submittedByName) fields.submittedByName = "Submitted by is required.";
  if (!submittedByEmail || !isEmail(submittedByEmail)) fields.submittedByEmail = "Enter a valid email.";
  if (!description) fields.description = "Description is required.";
  if (Object.keys(fields).length) {
    return failure("VALIDATION_ERROR", "Please correct the highlighted fields.", 400, fields);
  }
  const now = nowStamp();
  const id = newId("sop-request");
  const priority = priorities2.has(String(payload?.priority)) ? String(payload?.priority) : "Medium";
  await env.DB.prepare(
    `INSERT INTO sop_requests (
      id, request_type, requested_title, department_name, submitted_by_name,
      submitted_by_email, role_title, description, priority, desired_completion_at,
      existing_sop_id, draft_content, related_links, documentation_location,
      category_id, category_name, tool_system, audience, best_contact_method, frequency,
      requested_sop_type, status, assigned_to, assigned_department, assigned_team_id,
      owner_sub_role_id, reviewer_notes, denial_reason, request_notes, routing_reason,
      submitted_at, assigned_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    requestType,
    requestedTitle,
    departmentName,
    submittedByName,
    submittedByEmail,
    optionalText(payload?.roleTitle, 160),
    description,
    priority,
    unixFromDate(payload?.desiredCompletionAt),
    payload?.existingSopId || null,
    optionalText(payload?.draftContent, 3e4),
    normalizeLinks(payload?.relatedLinks),
    optionalText(payload?.documentationLocation, 1e3),
    category.id,
    category.name,
    optionalText(payload?.toolOrSystem, 240),
    optionalText(payload?.audience, 500),
    optionalText(payload?.bestContactMethod, 240),
    optionalText(payload?.frequency, 120),
    optionalText(payload?.requestedSopType, 120) || (requestType.includes("template") ? "Template" : "Process"),
    route.assignedTo ? "Assigned" : "Submitted",
    route.assignedTo,
    route.department,
    route.teamId,
    route.subRoleId,
    "",
    "",
    optionalText(payload?.requestNotes, 3e3),
    route.routingReason,
    now,
    route.assignedTo ? now : null,
    now,
    now
  ).run();
  await env.DB.prepare(
    `INSERT INTO audit_logs (id, action, entity_type, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    newId("audit"),
    "submit_request",
    "sop_request",
    id,
    JSON.stringify({ requestType, submittedByEmail, assignedDepartment: route.department }),
    now
  ).run();
  const saved = await env.DB.prepare(`${selectRequests("WHERE sop_requests.id = ?")}`).bind(id).first();
  return success({ request: saved, trackingUrl: `/my-work/?request=${encodeURIComponent(id)}` }, "SOP request submitted.", 201);
}, "onRequestPost");
var onRequestPut7 = /* @__PURE__ */ __name(async ({ request, env }) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  await ensureRequestWorkflowSchema3(env.DB);
  const auth = await requirePermission({ request, env }, "Review SOPs");
  if (auth.response) return auth.response;
  const [payload, parseError] = await readBody(request);
  if (parseError) return parseError;
  const id = optionalText(payload?.id, 120);
  if (!id) return failure("VALIDATION_ERROR", "Request id is required.", 400, { id: "Required" });
  const action = optionalText(payload?.action, 80) || "update";
  const result = await updateSopRequest(env.DB, id, payload || {}, action, auth.user?.id || null);
  return result;
}, "onRequestPut");
async function createDraftFromRequest(db, requestId, actorId) {
  const request = await db.prepare(`${selectRequests("WHERE sop_requests.id = ?")}`).bind(requestId).first();
  if (!request) throw new Error("Request not found.");
  if (request.draftSopId) return String(request.draftSopId);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const nowUnix = nowStamp();
  const sopId = newId("sop");
  const versionId = newId("version");
  const title = String(request.requestedTitle || "Untitled SOP Request");
  const slug = slugify(title, sopId);
  const content = String(request.draftContent || request.description || title);
  const metadata = JSON.stringify({
    audience: String(request.audience || "").split(/[\n,|]/).map((item) => item.trim()).filter(Boolean),
    tools: String(request.toolOrSystem || "").split(/[\n,|]/).map((item) => item.trim()).filter(Boolean),
    sourceRequestId: requestId
  });
  await db.prepare(
    `INSERT INTO sops (
        id, title, slug, summary, purpose, category_id, owner_id, owner_user_id,
        owner_team_id, owner_sub_role_id, status, type, current_version_id,
        audience, is_active, created_by_user_id, source_type, visibility, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
  ).bind(
    sopId,
    title,
    slug,
    String(request.description || "").slice(0, 1e3),
    String(request.description || ""),
    request.categoryId || null,
    request.assignedTo || actorId,
    request.assignedTo || actorId,
    request.assignedTeamId || null,
    request.ownerSubRoleId || null,
    "Draft",
    request.requestedSopType || "Process",
    versionId,
    request.audience || "",
    actorId,
    "Database",
    "Internal",
    now,
    now
  ).run();
  await db.prepare(
    `INSERT INTO sop_versions (
        id, sop_id, version_label, version_number, title, summary, purpose,
        body_markdown, content, metadata_json, change_summary, status,
        created_by_user_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    versionId,
    sopId,
    "0.1",
    "0.1",
    title,
    String(request.description || "").slice(0, 1e3),
    String(request.description || ""),
    content,
    content,
    metadata,
    `Draft created from SOP request ${requestId}.`,
    "Draft",
    actorId,
    actorId,
    now,
    nowUnix
  ).run();
  return sopId;
}
__name(createDraftFromRequest, "createDraftFromRequest");
async function updateSopRequest(db, id, payload, action, actorId) {
  const existing = await db.prepare(`${selectRequests("WHERE sop_requests.id = ?")}`).bind(id).first();
  if (!existing) return failure("NOT_FOUND", "SOP request not found.", 404);
  const now = nowStamp();
  let status = normalizeStatus(payload.status || existing.status);
  let draftSopId = optionalText(payload.draftSopId, 120) || String(existing.draftSopId || "") || null;
  let relatedSopId = optionalText(payload.relatedSopId || payload.existingSopId, 120) || String(existing.relatedSopId || existing.existingSopId || "") || null;
  if (action === "accept") status = "Accepted";
  if (action === "decline") status = "Declined";
  if (action === "assign") status = "Assigned";
  if (action === "more-info") status = "Needs More Information";
  if (action === "convert") {
    draftSopId = await createDraftFromRequest(db, id, actorId);
    status = "Draft Created";
  }
  if (action === "link" && relatedSopId) status = "In Progress";
  if (action === "approve") status = "Approved";
  if (action === "publish") status = "Published";
  if (action === "close") status = "Closed";
  const assignedTo = optionalText(payload.assignedTo, 120) || String(existing.assignedTo || "") || null;
  const assignedDepartment = optionalText(payload.assignedDepartment, 160) || String(existing.assignedDepartment || "") || null;
  const priority = priorities2.has(String(payload.priority)) ? String(payload.priority) : String(existing.priority || "Medium");
  await db.prepare(
    `UPDATE sop_requests
       SET status = ?,
        priority = ?,
        assigned_to = ?,
        assigned_department = ?,
        reviewer_notes = ?,
        denial_reason = ?,
        request_notes = ?,
        draft_sop_id = ?,
        related_sop_id = ?,
        reviewed_at = COALESCE(reviewed_at, ?),
        assigned_at = CASE WHEN ? = 'Assigned' THEN COALESCE(assigned_at, ?) ELSE assigned_at END,
        accepted_at = CASE WHEN ? = 'Accepted' THEN COALESCE(accepted_at, ?) ELSE accepted_at END,
        declined_at = CASE WHEN ? = 'Declined' THEN COALESCE(declined_at, ?) ELSE declined_at END,
        approved_at = CASE WHEN ? = 'Approved' THEN COALESCE(approved_at, ?) ELSE approved_at END,
        published_at = CASE WHEN ? = 'Published' THEN COALESCE(published_at, ?) ELSE published_at END,
        closed_at = CASE WHEN ? = 'Closed' THEN COALESCE(closed_at, ?) ELSE closed_at END,
        updated_at = ?
       WHERE id = ?`
  ).bind(
    status,
    priority,
    assignedTo,
    assignedDepartment,
    optionalText(payload.reviewerNotes, 6e3) || existing.reviewerNotes || "",
    optionalText(payload.denialReason, 3e3) || existing.denialReason || "",
    optionalText(payload.requestNotes, 6e3) || existing.requestNotes || "",
    draftSopId,
    relatedSopId,
    now,
    status,
    now,
    status,
    now,
    status,
    now,
    status,
    now,
    status,
    now,
    status,
    now,
    now,
    id
  ).run();
  if (action === "publish" && (draftSopId || relatedSopId)) {
    await db.prepare("UPDATE sops SET status = 'Published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?").bind(new Date(now * 1e3).toISOString(), new Date(now * 1e3).toISOString(), draftSopId || relatedSopId).run();
  }
  await db.prepare(
    `INSERT INTO audit_logs (id, action, entity_type, entity_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(newId("audit"), `request_${action}`, "sop_request", id, JSON.stringify({ status, actorId }), now).run();
  const saved = await db.prepare(`${selectRequests("WHERE sop_requests.id = ?")}`).bind(id).first();
  return success({ request: saved }, responseMessage(action));
}
__name(updateSopRequest, "updateSopRequest");

// api/sops.ts
function readFilters(request, role) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || "100");
  const offset = Number(url.searchParams.get("offset") || "0");
  const status = url.searchParams.get("status") || void 0;
  return {
    search: url.searchParams.get("search") || url.searchParams.get("q") || void 0,
    category: url.searchParams.get("category") || void 0,
    categoryId: url.searchParams.get("categoryId") || void 0,
    tag: url.searchParams.get("tag") || void 0,
    tool: url.searchParams.get("tool") || void 0,
    owner: url.searchParams.get("owner") || void 0,
    status,
    sort: url.searchParams.get("sort") || void 0,
    limit,
    offset,
    publicOnly: role === "normal" || !status
  };
}
__name(readFilters, "readFilters");
var onRequestGet24 = /* @__PURE__ */ __name(async ({ request, env }) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  try {
    const url = new URL(request.url);
    const user = await getAuthUser({ request, env });
    const role = url.searchParams.has("status") && user ? user.role : roleFromRequest(request);
    const filters = readFilters(request, role);
    const selectedSubRole = await resolveRequestedCreatorSubRole(env.DB, request);
    if (selectedSubRole) {
      filters.ownerSubRoleId = selectedSubRole.id;
    }
    const [sops, total] = await Promise.all([
      listSops(env.DB, filters),
      countSops(env.DB, filters)
    ]);
    const body = {
      sops,
      total,
      limit: filters.limit,
      offset: filters.offset
    };
    return new Response(
      JSON.stringify({
        success: true,
        data: body,
        sops,
        total
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          ...cacheHeaders(selectedSubRole || filters.publicOnly === false ? "private" : "public"),
          vary: "x-sop-sub-role"
        }
      }
    );
  } catch (error) {
    return failure(
      "SOPS_READ_FAILED",
      error instanceof Error ? error.message : "Unable to load SOPs.",
      500
    );
  }
}, "onRequestGet");
function listValue3(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "").split(/[\n,|]/).map((item) => item.trim()).filter(Boolean);
}
__name(listValue3, "listValue");
function estimatedMinutesFrom(value, fallback) {
  const numeric = Number(value || 0);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const match2 = String(fallback || "").match(/\d+/);
  return match2 ? Number(match2[0]) : null;
}
__name(estimatedMinutesFrom, "estimatedMinutesFrom");
async function linkTags(db, sopId, tags) {
  for (const tagName of tags) {
    const name = optionalText(tagName, 120);
    if (!name) continue;
    const id = idFrom(name, "tag");
    const slug = slugify(name, id);
    await db.prepare(
      `INSERT OR IGNORE INTO tags (id, name, slug, created_at, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(id, name, slug).run();
    await db.prepare("INSERT OR IGNORE INTO sop_tags (sop_id, tag_id) VALUES (?, ?)").bind(sopId, id).run();
  }
}
__name(linkTags, "linkTags");
var onRequestPost20 = /* @__PURE__ */ __name(async ({ request, env }) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission({ request, env }, "Create SOPs");
  if (auth.response) return auth.response;
  const ownership = await requireCreatorSubRoleSelection({ request, env }, auth.user);
  if (ownership.response) return ownership.response;
  const selectedSubRole = ownership.subRole || await resolveRequestedCreatorSubRole(env.DB, request);
  const [payload, parseError] = await readBody(request);
  if (parseError) return parseError;
  const title = optionalText(payload?.title, 180);
  const purpose = optionalText(payload?.purpose || payload?.summary, 4e3);
  const content = optionalText(payload?.content || purpose, 5e4);
  const fields = {};
  if (!title) fields.title = "Title is required.";
  if (!purpose) fields.purpose = "Purpose is required.";
  if (!content) fields.content = "Content is required.";
  if (Object.keys(fields).length) return failure("VALIDATION_ERROR", "Please correct the highlighted fields.", 400, fields);
  const id = newId("sop");
  const versionId = newId("version");
  const slug = slugify(title, id);
  const now = unixNow();
  const nowIso2 = new Date(now * 1e3).toISOString();
  const version = optionalText(payload?.version || "0.1", 40) || "0.1";
  const tags = listValue3(payload?.tags);
  const estimatedMinutes = estimatedMinutesFrom(payload?.estimatedMinutes, payload?.estimatedCompletionTime);
  const metadata = JSON.stringify({
    audience: listValue3(payload?.audience),
    tools: listValue3(payload?.tools),
    tags
  });
  const ownerId = payload?.ownerId || auth.user?.id || null;
  const ownerTeamId = payload?.ownerTeamId || selectedSubRole?.teamId || null;
  const ownerSubRoleId = selectedSubRole?.id || null;
  const type = optionalText(payload?.type || "Process", 80) || "Process";
  const reviewDate = optionalText(payload?.reviewDate, 40) || null;
  await env.DB.prepare(
    `INSERT INTO sops (
      id, title, slug, summary, purpose, category_id, owner_id, owner_user_id, owner_team_id,
      owner_sub_role_id, status, type, current_version_id, estimated_minutes, estimated_completion_time, audience,
      review_date, review_due_at, is_active, created_by_user_id, source_type, visibility, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    title,
    slug,
    optionalText(payload?.summary || purpose, 1e3),
    purpose,
    payload?.categoryId || null,
    ownerId,
    ownerId,
    ownerTeamId,
    ownerSubRoleId,
    "Draft",
    type,
    versionId,
    estimatedMinutes,
    optionalText(payload?.estimatedCompletionTime, 120) || (estimatedMinutes ? `${estimatedMinutes} minutes` : null),
    listValue3(payload?.audience).join("|"),
    reviewDate,
    reviewDate ? Math.floor((/* @__PURE__ */ new Date(`${reviewDate}T00:00:00`)).getTime() / 1e3) : null,
    payload?.createdBy || auth.user?.id || null,
    "Database",
    "Internal",
    nowIso2,
    nowIso2
  ).run();
  await env.DB.prepare(
    `INSERT INTO sop_versions (
        id, sop_id, version_label, version_number, title, summary, purpose, body_markdown,
        content, before_you_begin, checklist, troubleshooting, metadata_json, change_summary,
      status, created_by_user_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    versionId,
    id,
    version,
    version,
    title,
    optionalText(payload?.summary || purpose, 1e3),
    purpose,
    content,
    content,
    optionalText(payload?.beforeYouBegin, 4e3),
    optionalText(payload?.checklist, 8e3),
    optionalText(payload?.troubleshooting, 8e3),
    metadata,
    optionalText(payload?.changeSummary || "Initial draft created.", 2e3),
    "Draft",
    payload?.createdBy || auth.user?.id || null,
    payload?.createdBy || auth.user?.id || null,
    nowIso2,
    now
  ).run();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO sop_assignments (
        id, sop_id, version_id, user_id, team_id, assignment_type, status, assigned_by_user_id, due_at
      ) VALUES (?, ?, ?, ?, ?, 'Owner', 'Active', ?, ?)`
  ).bind(newId("assignment"), id, versionId, ownerId, ownerTeamId, auth.user?.id || null, reviewDate).run();
  if (payload?.reviewerId) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO sop_assignments (
          id, sop_id, version_id, user_id, team_id, assignment_type, status, assigned_by_user_id, due_at
        ) VALUES (?, ?, ?, ?, ?, 'Reviewer', 'Active', ?, ?)`
    ).bind(newId("assignment"), id, versionId, payload.reviewerId, ownerTeamId, auth.user?.id || null, reviewDate).run();
  }
  await linkTags(env.DB, id, tags);
  await env.DB.prepare(
    `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, after_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(newId("audit"), payload?.createdBy || auth.user?.id || null, "create_draft", "sop", id, JSON.stringify({ title, versionId }), now).run();
  return success({ sop: { id, slug, currentVersionId: versionId, status: "Draft" } }, "SOP draft created.", 201);
}, "onRequestPost");

// api/tags.ts
var onRequestGet25 = /* @__PURE__ */ __name(async ({ env }) => {
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  try {
    const tags = await listTags(env.DB);
    return new Response(JSON.stringify({ success: true, data: { tags }, tags }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...cacheHeaders("public")
      }
    });
  } catch (error) {
    return failure(
      "TAGS_READ_FAILED",
      error instanceof Error ? error.message : "Unable to load tags.",
      500
    );
  }
}, "onRequestGet");

// api/workflow.ts
var requestStatuses = /* @__PURE__ */ new Set([
  "Submitted",
  "Triage",
  "Assigned",
  "Drafting",
  "In Review",
  "Needs More Information",
  "Needs Revision",
  "Approved",
  "Published",
  "Archived"
]);
var reviewStatuses = /* @__PURE__ */ new Set(["Assigned", "In Review", "Needs Revision", "Approved", "Rejected", "Published", "Archived"]);
var priorities3 = /* @__PURE__ */ new Set(["Low", "Medium", "High", "Urgent"]);
function requestSelect() {
  return `SELECT
    requests.id,
    requests.request_type AS requestType,
    requests.title,
    requests.description,
    requests.business_need AS businessNeed,
    requests.department,
    requests.category_id AS categoryId,
    categories.name AS category,
    requests.requested_sop_id AS requestedSopId,
    requests.submitted_by_user_id AS submittedByUserId,
    COALESCE(users.name, requests.submitter_name) AS submittedBy,
    requests.submitter_name AS submitterName,
    requests.submitter_email AS submitterEmail,
    requests.assigned_to_user_id AS assignedToUserId,
    assignee.name AS assignedReviewer,
    requests.priority,
    requests.status,
    requests.desired_completion_date AS desiredCompletionDate,
    requests.review_date AS reviewDate,
    requests.created_at AS createdAt,
    requests.updated_at AS updatedAt
  FROM requests
  LEFT JOIN categories ON categories.id = requests.category_id
  LEFT JOIN users ON users.id = requests.submitted_by_user_id
  LEFT JOIN users assignee ON assignee.id = requests.assigned_to_user_id`;
}
__name(requestSelect, "requestSelect");
function reviewSelect() {
  return `SELECT
    reviews.id,
    reviews.sop_id AS sopId,
    sops.title AS sopTitle,
    reviews.sop_version_id AS sopVersionId,
    reviews.request_id AS requestId,
    COALESCE(requests.title, sops.title) AS title,
    reviews.reviewer_user_id AS reviewerUserId,
    reviewer.name AS assignedReviewer,
    reviews.assigned_by_user_id AS assignedByUserId,
    reviews.status,
    reviews.priority,
    reviews.due_date AS dueDate,
    reviews.completed_at AS completedAt,
    reviews.decision_notes AS decisionNotes,
    reviews.created_at AS createdAt,
    reviews.updated_at AS updatedAt
  FROM reviews
  LEFT JOIN sops ON sops.id = reviews.sop_id
  LEFT JOIN requests ON requests.id = reviews.request_id
  LEFT JOIN users reviewer ON reviewer.id = reviews.reviewer_user_id`;
}
__name(reviewSelect, "reviewSelect");
var onRequestGet26 = /* @__PURE__ */ __name(async ({ request, env }) => {
  const context = { request, env };
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Review SOPs");
  if (auth.response) return auth.response;
  const db = env.DB;
  const url = new URL(request.url);
  const assignee = url.searchParams.get("assignedToUserId");
  const submitter = url.searchParams.get("submittedByUserId");
  const requestWhere = [
    assignee ? "requests.assigned_to_user_id = ?" : "",
    submitter ? "requests.submitted_by_user_id = ?" : ""
  ].filter(Boolean);
  const requestValues = [assignee, submitter].filter(Boolean);
  const [requestsResult, reviewsResult] = await Promise.all([
    db.prepare(
      `${requestSelect()} ${requestWhere.length ? `WHERE ${requestWhere.join(" AND ")}` : ""}
       ORDER BY requests.created_at DESC`
    ).bind(...requestValues).all(),
    db.prepare(`${reviewSelect()} ORDER BY reviews.due_date ASC, reviews.created_at DESC`).all()
  ]);
  return jsonResponse({
    requests: requestsResult.results || [],
    reviews: reviewsResult.results || []
  });
}, "onRequestGet");
var onRequestPost21 = /* @__PURE__ */ __name(async ({ request, env }) => {
  const context = { request, env };
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Review SOPs");
  if (auth.response) return auth.response;
  const db = env.DB;
  const url = new URL(request.url);
  if (url.searchParams.get("type") === "review") return createReview(request, db);
  return createRequest(request, db);
}, "onRequestPost");
var onRequestPut8 = /* @__PURE__ */ __name(async ({ request, env }) => {
  const context = { request, env };
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Review SOPs");
  if (auth.response) return auth.response;
  const db = env.DB;
  const url = new URL(request.url);
  if (url.searchParams.get("type") === "review") return updateReview(request, db);
  return updateRequest2(request, db);
}, "onRequestPut");
async function createRequest(request, db) {
  const [payload, parseError] = await readJsonBody(request);
  if (parseError) return parseError;
  const title = String(payload?.title || "").trim();
  if (!title) return jsonResponse({ error: "Request title is required." }, 400);
  const id = newId("request");
  const priority = priorities3.has(String(payload?.priority)) ? payload?.priority : "Medium";
  const status = requestStatuses.has(String(payload?.status)) ? payload?.status : "Submitted";
  await db.prepare(
    `INSERT INTO requests (
      id, request_type, title, description, business_need, department, category_id,
      requested_sop_id, submitted_by_user_id, submitter_name, submitter_email,
      assigned_to_user_id, priority, status, desired_completion_date, review_date,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  ).bind(
    id,
    String(payload?.requestType || "Request a new SOP"),
    title,
    String(payload?.description || ""),
    String(payload?.businessNeed || ""),
    String(payload?.department || ""),
    payload?.categoryId || null,
    payload?.requestedSopId || null,
    payload?.submittedByUserId || null,
    String(payload?.submitterName || ""),
    String(payload?.submitterEmail || ""),
    payload?.assignedToUserId || null,
    priority,
    status,
    payload?.desiredCompletionDate || null,
    payload?.reviewDate || null
  ).run();
  const saved = await db.prepare(`${requestSelect()} WHERE requests.id = ?`).bind(id).first();
  return jsonResponse({ request: saved }, 201);
}
__name(createRequest, "createRequest");
async function updateRequest2(request, db) {
  const [payload, parseError] = await readJsonBody(request);
  if (parseError) return parseError;
  const id = String(payload?.id || "").trim();
  if (!id) return jsonResponse({ error: "Request id is required." }, 400);
  const status = requestStatuses.has(String(payload?.status)) ? payload?.status : "Submitted";
  const priority = priorities3.has(String(payload?.priority)) ? payload?.priority : "Medium";
  await db.prepare(
    `UPDATE requests
     SET assigned_to_user_id = ?, priority = ?, status = ?, review_date = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(payload?.assignedToUserId || null, priority, status, payload?.reviewDate || null, id).run();
  const saved = await db.prepare(`${requestSelect()} WHERE requests.id = ?`).bind(id).first();
  return jsonResponse({ request: saved });
}
__name(updateRequest2, "updateRequest");
async function createReview(request, db) {
  const [payload, parseError] = await readJsonBody(request);
  if (parseError) return parseError;
  const id = payload?.id || newId("review");
  const status = reviewStatuses.has(String(payload?.status)) ? payload?.status : "Assigned";
  const priority = priorities3.has(String(payload?.priority)) ? payload?.priority : "Medium";
  await db.prepare(
    `INSERT INTO reviews (
      id, sop_id, sop_version_id, request_id, reviewer_user_id, assigned_by_user_id,
      status, priority, due_date, decision_notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  ).bind(
    id,
    payload?.sopId || null,
    payload?.sopVersionId || null,
    payload?.requestId || null,
    payload?.reviewerUserId || null,
    payload?.assignedByUserId || null,
    status,
    priority,
    payload?.dueDate || null,
    String(payload?.decisionNotes || "")
  ).run();
  const saved = await db.prepare(`${reviewSelect()} WHERE reviews.id = ?`).bind(id).first();
  return jsonResponse({ review: saved }, 201);
}
__name(createReview, "createReview");
async function updateReview(request, db) {
  const [payload, parseError] = await readJsonBody(request);
  if (parseError) return parseError;
  const id = String(payload?.id || "").trim();
  if (!id) return jsonResponse({ error: "Review id is required." }, 400);
  const status = reviewStatuses.has(String(payload?.status)) ? payload?.status : "Assigned";
  const priority = priorities3.has(String(payload?.priority)) ? payload?.priority : "Medium";
  await db.prepare(
    `UPDATE reviews
     SET reviewer_user_id = ?, status = ?, priority = ?, due_date = ?, decision_notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(
    payload?.reviewerUserId || null,
    status,
    priority,
    payload?.dueDate || null,
    String(payload?.decisionNotes || ""),
    id
  ).run();
  const saved = await db.prepare(`${reviewSelect()} WHERE reviews.id = ?`).bind(id).first();
  return jsonResponse({ review: saved });
}
__name(updateReview, "updateReview");

// ../.wrangler/tmp/pages-meHn2k/functionsRoutes-0.25580426438639436.mjs
var routes = [
  {
    routePath: "/api/sops/slug/:slug",
    mountPath: "/api/sops/slug",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/guides/:slug/route",
    mountPath: "/api/guides/:slug",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/guides/:slug/route",
    mountPath: "/api/guides/:slug",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/sops/:id/approve",
    mountPath: "/api/sops/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/sops/:id/archive",
    mountPath: "/api/sops/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/sops/:id/feedback",
    mountPath: "/api/sops/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/api/sops/:id/publish",
    mountPath: "/api/sops/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/api/sops/:id/request-changes",
    mountPath: "/api/sops/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost6]
  },
  {
    routePath: "/api/sops/:id/submit-review",
    mountPath: "/api/sops/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost7]
  },
  {
    routePath: "/api/sops/:id/versions",
    mountPath: "/api/sops/:id",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/sops/:id/versions",
    mountPath: "/api/sops/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost8]
  },
  {
    routePath: "/api/sops/:id/view",
    mountPath: "/api/sops/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost9]
  },
  {
    routePath: "/api/admin/categories",
    mountPath: "/api/admin",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete]
  },
  {
    routePath: "/api/admin/categories",
    mountPath: "/api/admin",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/api/admin/categories",
    mountPath: "/api/admin",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost10]
  },
  {
    routePath: "/api/admin/categories",
    mountPath: "/api/admin",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut]
  },
  {
    routePath: "/api/admin/tags",
    mountPath: "/api/admin",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete2]
  },
  {
    routePath: "/api/admin/tags",
    mountPath: "/api/admin",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet5]
  },
  {
    routePath: "/api/admin/tags",
    mountPath: "/api/admin",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost11]
  },
  {
    routePath: "/api/admin/tags",
    mountPath: "/api/admin",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut2]
  },
  {
    routePath: "/api/admin/users",
    mountPath: "/api/admin",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete3]
  },
  {
    routePath: "/api/admin/users",
    mountPath: "/api/admin",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet6]
  },
  {
    routePath: "/api/admin/users",
    mountPath: "/api/admin",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost12]
  },
  {
    routePath: "/api/admin/users",
    mountPath: "/api/admin",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut3]
  },
  {
    routePath: "/api/analytics/summary",
    mountPath: "/api/analytics",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet7]
  },
  {
    routePath: "/api/analytics/track",
    mountPath: "/api/analytics",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost13]
  },
  {
    routePath: "/api/search/facets",
    mountPath: "/api/search",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet8]
  },
  {
    routePath: "/api/search/log",
    mountPath: "/api/search",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost14]
  },
  {
    routePath: "/api/sops/popular",
    mountPath: "/api/sops",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet9]
  },
  {
    routePath: "/api/sops/recent",
    mountPath: "/api/sops",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet10]
  },
  {
    routePath: "/api/guides/:slug",
    mountPath: "/api/guides",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet11]
  },
  {
    routePath: "/api/sop-requests/:id",
    mountPath: "/api/sop-requests",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet12]
  },
  {
    routePath: "/api/sop-requests/:id",
    mountPath: "/api/sop-requests",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut4]
  },
  {
    routePath: "/api/sops/:id",
    mountPath: "/api/sops",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet13]
  },
  {
    routePath: "/api/sops/:id",
    mountPath: "/api/sops",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut5]
  },
  {
    routePath: "/api/ai-assist",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet14]
  },
  {
    routePath: "/api/ai-assist",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost15]
  },
  {
    routePath: "/api/categories",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet15]
  },
  {
    routePath: "/api/chat",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet16]
  },
  {
    routePath: "/api/chat",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost16]
  },
  {
    routePath: "/api/create-options",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet17]
  },
  {
    routePath: "/api/finder",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet18]
  },
  {
    routePath: "/api/finder",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost17]
  },
  {
    routePath: "/api/media",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet19]
  },
  {
    routePath: "/api/media",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost18]
  },
  {
    routePath: "/api/my-drafts",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet20]
  },
  {
    routePath: "/api/my-work",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet21]
  },
  {
    routePath: "/api/review-queue",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet22]
  },
  {
    routePath: "/api/review-queue",
    mountPath: "/api",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut6]
  },
  {
    routePath: "/api/sop-requests",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet23]
  },
  {
    routePath: "/api/sop-requests",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost19]
  },
  {
    routePath: "/api/sop-requests",
    mountPath: "/api",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut7]
  },
  {
    routePath: "/api/sops",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet24]
  },
  {
    routePath: "/api/sops",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost20]
  },
  {
    routePath: "/api/tags",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet25]
  },
  {
    routePath: "/api/workflow",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet26]
  },
  {
    routePath: "/api/workflow",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost21]
  },
  {
    routePath: "/api/workflow",
    mountPath: "/api",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut8]
  }
];

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
