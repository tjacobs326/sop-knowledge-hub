import {
  idFrom,
  listFromJson,
  readJsonBody,
  requireDb,
  type AccessLevel,
  type UserStatus,
} from "../../_shared/admin";
import { requirePermission, type AuthUser } from "../../_shared/auth";
import { jsonResponse, newId, type D1DatabaseBinding, type PagesFunctionContext } from "../../_shared/cloudflare";
import { getActiveDepartment } from "../../_shared/departments";

interface UserPayload {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  departmentId?: string;
  teamId?: string;
  title?: string;
  accessLevel?: AccessLevel;
  status?: UserStatus;
  permissions?: string[];
  permissionIds?: string[];
  subRoleId?: string;
  creatorSubRoleId?: string;
}

interface RolePayload {
  id?: string;
  name?: string;
  accessGroup?: string;
  landingPage?: string;
  description?: string;
  permissions?: string[];
}

interface PermissionRow {
  id: string;
  name: string;
}

interface ImportPreviewRow {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  accountType: string;
  creatorReviewerRole: string;
  status: string;
  permissions: string[];
  valid: boolean;
  message: string;
  payload?: UserPayload;
}

const accessLevels = new Set(["Normal User", "Creator / Reviewer", "Admin"]);
const statuses = new Set(["Active", "Pending", "Suspended", "Archived"]);
const creatorAccessLevel = "Creator / Reviewer";
const maxImportBytes = 1024 * 1024;
const maxImportRows = 250;
const requiredImportColumns = [
  "first_name",
  "last_name",
  "email",
  "department",
  "account_type",
  "creator_reviewer_role",
  "status",
  "permissions",
];

function readableError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
}

async function tableColumns(db: D1DatabaseBinding, table: string) {
  const result = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return new Set((result.results || []).map((row) => row.name));
}

async function addColumnIfMissing(db: D1DatabaseBinding, table: string, columns: Set<string>, name: string, ddl: string) {
  if (columns.has(name)) return;
  await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${ddl}`).run();
  columns.add(name);
}

async function ensureAdminUserSchema(db: D1DatabaseBinding) {
  const userColumns = await tableColumns(db, "users");
  await addColumnIfMissing(db, "users", userColumns, "title", "title TEXT");
  await addColumnIfMissing(db, "users", userColumns, "first_name", "first_name TEXT");
  await addColumnIfMissing(db, "users", userColumns, "last_name", "last_name TEXT");
  await addColumnIfMissing(db, "users", userColumns, "display_name", "display_name TEXT");
  await addColumnIfMissing(db, "users", userColumns, "created_by_user_id", "created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL");

  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_normalized ON users(lower(email))").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_users_name_sort ON users(lower(last_name), lower(first_name), lower(email))").run();
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS user_permission_overrides (
      user_id TEXT NOT NULL,
      permission_id TEXT NOT NULL,
      effect TEXT NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow')),
      granted_by_user_id TEXT,
      granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, permission_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
      FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    )`,
  ).run();
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS user_import_rows (
      id TEXT PRIMARY KEY,
      import_job_id TEXT NOT NULL,
      row_number INTEGER NOT NULL,
      email TEXT,
      status TEXT NOT NULL CHECK (status IN ('Valid', 'Invalid', 'Imported', 'Skipped')),
      message TEXT,
      normalized_payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE
    )`,
  ).run();
}

function usersSelect() {
  return `SELECT
    users.id,
    COALESCE(users.display_name, users.name) AS name,
    users.first_name AS firstName,
    users.last_name AS lastName,
    users.email,
    COALESCE(teams.name, users.department) AS department,
    users.team_id AS departmentId,
    users.team_id AS teamId,
    users.title,
    users.access_level AS accessLevel,
    users.status,
    users.role_id AS roleId,
    roles.permissions_json AS permissionsJson,
    GROUP_CONCAT(DISTINCT override_permissions.name) AS userPermissionsCsv,
    GROUP_CONCAT(DISTINCT creator_sub_roles.id) AS subRoleIdsCsv,
    GROUP_CONCAT(DISTINCT creator_sub_roles.label) AS subRoleLabelsCsv,
    users.created_at AS createdAt,
    users.updated_at AS updatedAt
  FROM users
  LEFT JOIN roles ON roles.id = users.role_id
  LEFT JOIN teams ON teams.id = users.team_id
  LEFT JOIN user_permission_overrides ON user_permission_overrides.user_id = users.id
  LEFT JOIN permissions override_permissions ON override_permissions.id = user_permission_overrides.permission_id
  LEFT JOIN user_sub_roles ON user_sub_roles.user_id = users.id
    AND (user_sub_roles.expires_at IS NULL OR user_sub_roles.expires_at > CURRENT_TIMESTAMP)
  LEFT JOIN creator_sub_roles ON creator_sub_roles.id = user_sub_roles.sub_role_id`;
}

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

function splitCsv(value: unknown) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeUser(row: Record<string, unknown>) {
  const rolePermissions = listFromJson(String(row.permissionsJson || "[]"));
  const explicitPermissions = splitCsv(row.userPermissionsCsv);
  return {
    ...row,
    permissions: explicitPermissions.length ? explicitPermissions : rolePermissions,
    permissionsJson: undefined,
    userPermissionsCsv: undefined,
    roleIds: row.roleId ? [row.roleId] : [],
    subRoleIds: splitCsv(row.subRoleIdsCsv),
    subRoleLabels: splitCsv(row.subRoleLabelsCsv),
    subRoleIdsCsv: undefined,
    subRoleLabelsCsv: undefined,
  };
}

function normalizeRole(row: Record<string, unknown>) {
  return {
    ...row,
    permissions: listFromJson(String(row.permissionsJson || "[]")),
    permissionsJson: undefined,
  };
}

async function roleForAccessLevel(db: D1DatabaseBinding, accessLevel: string) {
  return await db
    .prepare("SELECT id, name, permissions_json AS permissionsJson FROM roles WHERE access_level = ? AND status != 'Archived' LIMIT 1")
    .bind(accessLevel)
    .first<{ id: string; name: string; permissionsJson: string }>();
}

async function activeSubRole(db: D1DatabaseBinding, id: string) {
  if (!id) return null;
  return await db
    .prepare("SELECT id, label, team_id AS teamId, department FROM creator_sub_roles WHERE id = ? AND status = 'Active' LIMIT 1")
    .bind(id)
    .first<{ id: string; label: string; teamId: string | null; department: string }>();
}

async function loadPermissionMap(db: D1DatabaseBinding) {
  const result = await db.prepare("SELECT id, name FROM permissions ORDER BY name ASC").all<PermissionRow>();
  const rows = result.results || [];
  return {
    rows,
    byId: new Map(rows.map((row) => [row.id.toLowerCase(), row])),
    byName: new Map(rows.map((row) => [row.name.toLowerCase(), row])),
  };
}

async function resolvePermissions(db: D1DatabaseBinding, requested: string[] | undefined, fallbackNames: string[]) {
  const permissionMap = await loadPermissionMap(db);
  const values = requested?.length ? requested : fallbackNames;
  const resolved: PermissionRow[] = [];
  const invalid: string[] = [];

  for (const value of values || []) {
    const key = String(value || "").trim().toLowerCase();
    if (!key) continue;
    const row = permissionMap.byId.get(key) || permissionMap.byName.get(key);
    if (row) resolved.push(row);
    else invalid.push(String(value));
  }

  const unique = Array.from(new Map(resolved.map((row) => [row.id, row])).values());
  return { permissions: unique, invalid };
}

async function replaceUserRole(db: D1DatabaseBinding, userId: string, roleId: string | null, actorId?: string) {
  await db.prepare("DELETE FROM user_roles WHERE user_id = ?").bind(userId).run();
  if (roleId) {
    await db
      .prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_by_user_id) VALUES (?, ?, ?)")
      .bind(userId, roleId, actorId || null)
      .run();
  }
}

async function replaceUserSubRole(db: D1DatabaseBinding, userId: string, subRoleId: string | null, actorId?: string) {
  await db.prepare("DELETE FROM user_sub_roles WHERE user_id = ?").bind(userId).run();
  if (subRoleId) {
    await db
      .prepare("INSERT OR IGNORE INTO user_sub_roles (user_id, sub_role_id, granted_by_user_id) VALUES (?, ?, ?)")
      .bind(userId, subRoleId, actorId || null)
      .run();
  }
}

async function replacePermissionOverrides(db: D1DatabaseBinding, userId: string, permissions: PermissionRow[], actorId?: string) {
  await db.prepare("DELETE FROM user_permission_overrides WHERE user_id = ?").bind(userId).run();
  for (const permission of permissions) {
    await db
      .prepare("INSERT OR IGNORE INTO user_permission_overrides (user_id, permission_id, granted_by_user_id) VALUES (?, ?, ?)")
      .bind(userId, permission.id, actorId || null)
      .run();
  }
}

function nameParts(payload: UserPayload) {
  const explicitFirst = String(payload.firstName || "").trim();
  const explicitLast = String(payload.lastName || "").trim();
  const display = String(payload.name || [explicitFirst, explicitLast].filter(Boolean).join(" ")).trim();
  if (explicitFirst || explicitLast) {
    return {
      firstName: explicitFirst,
      lastName: explicitLast,
      displayName: display || [explicitFirst, explicitLast].filter(Boolean).join(" "),
    };
  }
  const pieces = display.split(/\s+/).filter(Boolean);
  return {
    firstName: pieces.slice(0, -1).join(" ") || pieces[0] || "",
    lastName: pieces.length > 1 ? pieces[pieces.length - 1] : "",
    displayName: display,
  };
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function duplicateEmail(db: D1DatabaseBinding, email: string, existingId?: string) {
  const row = await db
    .prepare("SELECT id FROM users WHERE lower(email) = lower(?) AND id != ? LIMIT 1")
    .bind(email, existingId || "")
    .first<{ id: string }>();
  return Boolean(row);
}

async function audit(db: D1DatabaseBinding, actor: AuthUser | null, action: string, entityId: string, after: unknown, request?: Request) {
  try {
    await db
      .prepare(
        `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, after_json, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, 'User', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .bind(
        newId("audit"),
        actor?.id || null,
        action,
        entityId,
        JSON.stringify(after),
        request?.headers.get("cf-connecting-ip") || "",
        request?.headers.get("user-agent") || "",
      )
      .run();
  } catch {
    // Audit logging should not prevent a valid user-management operation.
  }
}

function sortClause() {
  return "ORDER BY lower(COALESCE(users.last_name, users.name)), lower(COALESCE(users.first_name, '')), lower(users.email)";
}

async function fetchUser(db: D1DatabaseBinding, id: string) {
  const user = await db
    .prepare(`${usersSelect()} WHERE users.id = ? GROUP BY users.id`)
    .bind(id)
    .first<Record<string, unknown>>();
  return user ? normalizeUser(user) : null;
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Users");
  if (auth.response) return auth.response;
  const db = env.DB!;
  await ensureAdminUserSchema(db);

  const url = new URL(request.url);
  if (url.searchParams.get("template") === "csv") return csvTemplateResponse();

  const [usersResult, rolesResult] = await Promise.all([
    db.prepare(`${usersSelect()} GROUP BY users.id ${sortClause()}`).all<Record<string, unknown>>(),
    db.prepare(`${rolesSelect()} ORDER BY CASE access_level WHEN 'Normal User' THEN 1 WHEN 'Creator / Reviewer' THEN 2 WHEN 'Admin' THEN 3 ELSE 4 END`).all<Record<string, unknown>>(),
  ]);

  return jsonResponse({
    users: (usersResult.results || []).map(normalizeUser),
    roles: (rolesResult.results || []).map(normalizeRole),
  });
};

export const onRequestPost = async (context: PagesFunctionContext) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Users");
  if (auth.response) return auth.response;
  const db = env.DB!;
  await ensureAdminUserSchema(db);

  const url = new URL(request.url);
  if (url.searchParams.get("type") === "role") return saveRole(request, db, false);
  if (url.searchParams.get("type") === "import") return handleImport(request, db, auth.user, url.searchParams.get("mode") === "commit");
  return saveUser(request, db, false, auth.user);
};

export const onRequestPut = async (context: PagesFunctionContext) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Users");
  if (auth.response) return auth.response;
  const db = env.DB!;
  await ensureAdminUserSchema(db);

  const url = new URL(request.url);
  if (url.searchParams.get("type") === "role") return saveRole(request, db, true);
  return saveUser(request, db, true, auth.user);
};

export const onRequestDelete = async (context: PagesFunctionContext) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Users");
  if (auth.response) return auth.response;
  const db = env.DB!;
  await ensureAdminUserSchema(db);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonResponse({ error: "id is required." }, 400);

  await db.prepare("UPDATE users SET status = 'Archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  await audit(db, auth.user, "Archive User", id, { id, status: "Archived" }, request);
  return jsonResponse({ ok: true });
};

async function validateUserPayload(db: D1DatabaseBinding, payload: UserPayload, isUpdate: boolean) {
  const { firstName, lastName, displayName } = nameParts(payload);
  const email = String(payload?.email || "").trim().toLowerCase();
  const fields: Record<string, string> = {};

  if (!displayName) fields.name = "User name is required.";
  if (!email) fields.email = "Email is required.";
  else if (!validEmail(email)) fields.email = "Enter a valid email address.";

  const accessLevel = accessLevels.has(String(payload?.accessLevel)) ? String(payload?.accessLevel) : "Normal User";
  const status = statuses.has(String(payload?.status)) ? String(payload?.status) : "Active";
  const id = String(payload?.id || idFrom(email || displayName, "user")).trim();

  if (email && (await duplicateEmail(db, email, isUpdate ? id : ""))) {
    return { error: "A user with this email address already exists.", status: 409, fields: { email: "A user with this email address already exists." } };
  }

  const departmentId = String(payload?.departmentId || payload?.teamId || "").trim();
  const department = await getActiveDepartment(db, departmentId);
  if (!department) fields.departmentId = "Select an active department from the list.";

  const role = await roleForAccessLevel(db, accessLevel);
  if (!role) fields.accessLevel = "Select an active role.";

  let subRole = null;
  const subRoleId = String(payload?.subRoleId || payload?.creatorSubRoleId || "").trim();
  if (accessLevel === creatorAccessLevel) {
    subRole = await activeSubRole(db, subRoleId);
    if (!subRole) fields.subRoleId = "Select an active Creator / Reviewer role.";
  } else if (subRoleId) {
    subRole = await activeSubRole(db, subRoleId);
  }

  const fallbackPermissions = listFromJson(role?.permissionsJson || "[]");
  const { permissions, invalid } = await resolvePermissions(db, payload?.permissionIds || payload?.permissions, fallbackPermissions);
  if (invalid.length) fields.permissions = `Unknown permission: ${invalid.join(", ")}.`;

  if (Object.keys(fields).length) {
    return { error: "Fix the highlighted fields before saving this user.", status: 400, fields };
  }

  return {
    id,
    firstName,
    lastName,
    displayName,
    email,
    accessLevel,
    status,
    department: department!,
    role: role!,
    subRole,
    permissions,
    fields: {},
  };
}

async function saveUser(request: Request, db: D1DatabaseBinding, isUpdate: boolean, actor?: AuthUser | null) {
  const [payload, parseError] = await readJsonBody<UserPayload>(request);
  if (parseError) return parseError;

  const validation = await validateUserPayload(db, payload || {}, isUpdate);
  if ("error" in validation) {
    return jsonResponse({ error: validation.error, fields: validation.fields }, validation.status);
  }

  const title = String(payload?.title || "").trim();
  try {
    if (isUpdate) {
      const existing = await db.prepare("SELECT id FROM users WHERE id = ? LIMIT 1").bind(validation.id).first();
      if (!existing) return jsonResponse({ error: "User not found." }, 404);
      await db
        .prepare(
          `UPDATE users
           SET name = ?, first_name = ?, last_name = ?, display_name = ?, email = ?, department = ?, title = ?,
               team_id = ?, access_level = ?, role_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(
          validation.displayName,
          validation.firstName,
          validation.lastName,
          validation.displayName,
          validation.email,
          validation.department.name,
          title,
          validation.department.id,
          validation.accessLevel,
          validation.role.id,
          validation.status,
          validation.id,
        )
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO users (
            id, name, first_name, last_name, display_name, email, department, title, team_id, access_level,
            role_id, status, created_by_user_id, created_at, updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        )
        .bind(
          validation.id,
          validation.displayName,
          validation.firstName,
          validation.lastName,
          validation.displayName,
          validation.email,
          validation.department.name,
          title,
          validation.department.id,
          validation.accessLevel,
          validation.role.id,
          validation.status,
          actor?.id || null,
        )
        .run();
    }

    await replaceUserRole(db, validation.id, validation.role.id, actor?.id);
    await replaceUserSubRole(db, validation.id, validation.subRole?.id || null, actor?.id);
    await replacePermissionOverrides(db, validation.id, validation.permissions, actor?.id);
    await audit(db, actor || null, isUpdate ? "Update User" : "Create User", validation.id, {
      id: validation.id,
      email: validation.email,
      accessLevel: validation.accessLevel,
      departmentId: validation.department.id,
      roleId: validation.role.id,
      subRoleId: validation.subRole?.id || null,
      permissionIds: validation.permissions.map((permission) => permission.id),
    }, request);
  } catch (error) {
    const message = readableError(error, "User could not be saved.");
    if (/unique/i.test(message)) {
      return jsonResponse({ error: "A user with this email address already exists.", fields: { email: "A user with this email address already exists." } }, 409);
    }
    return jsonResponse({ error: "User could not be saved. Please try again." }, 500);
  }

  const user = await fetchUser(db, validation.id);
  return jsonResponse({ success: true, user }, isUpdate ? 200 : 201);
}

async function saveRole(request: Request, db: D1DatabaseBinding, isUpdate: boolean) {
  const [payload, parseError] = await readJsonBody<RolePayload>(request);
  if (parseError) return parseError;

  const id = String(payload?.id || "").trim();
  const name = String(payload?.name || "").trim();
  if (!id) return jsonResponse({ error: "Role id is required." }, 400);
  if (!name) return jsonResponse({ error: "Role name is required." }, 400);

  const permissionsJson = JSON.stringify(payload?.permissions || []);
  const current = await db.prepare("SELECT access_level FROM roles WHERE id = ?").bind(id).first<{ access_level: AccessLevel }>();
  if (!current && isUpdate) return jsonResponse({ error: "Role not found." }, 404);

  if (isUpdate) {
    await db
      .prepare(
        `UPDATE roles
         SET name = ?, description = ?, permissions_json = ?, access_group = ?, landing_page = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(name, String(payload?.description || ""), permissionsJson, String(payload?.accessGroup || ""), String(payload?.landingPage || ""), id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO roles (id, name, description, permissions_json, access_group, landing_page, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .bind(id, name, String(payload?.description || ""), permissionsJson, String(payload?.accessGroup || ""), String(payload?.landingPage || ""))
      .run();
  }

  const role = await db.prepare(`${rolesSelect()} WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  return jsonResponse({ role: role ? normalizeRole(role) : null }, isUpdate ? 200 : 201);
}

function csvEscape(value: string) {
  const sanitized = String(value || "").replace(/"/g, '""');
  return /[",\n\r]/.test(sanitized) ? `"${sanitized}"` : sanitized;
}

function csvTemplateResponse() {
  const rows = [
    requiredImportColumns,
    ["Jordan", "Smith", "jordan.smith@example.com", "Instructional Design", "Creator / Reviewer", "Instructional Designer", "Active", "Search SOPs|Create SOPs|Edit Drafts|Review SOPs"],
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="sop-user-import-template.csv"',
      "cache-control": "no-store",
    },
  });
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function canonical(value: string) {
  return String(value || "").trim().toLowerCase();
}

function normalizeAccountType(value: string): AccessLevel | "" {
  const text = canonical(value).replace(/[/_-]+/g, " ");
  if (text === "normal user" || text === "standard user" || text === "normal") return "Normal User";
  if (text === "creator reviewer" || text === "creator / reviewer" || text === "creator") return "Creator / Reviewer";
  if (text === "admin" || text === "administrator") return "Admin";
  return "";
}

function normalizeStatus(value: string): UserStatus | "" {
  const text = String(value || "Active").trim();
  const match = Array.from(statuses).find((status) => status.toLowerCase() === text.toLowerCase());
  return (match as UserStatus | undefined) || "";
}

async function buildImportPreview(db: D1DatabaseBinding, csvText: string) {
  const rows = parseCsv(csvText);
  const [header, ...dataRows] = rows;
  if (!header?.length) return { error: "The CSV file is empty.", rows: [], summary: null };
  const normalizedHeader = header.map((column) => canonical(column));
  const missing = requiredImportColumns.filter((column) => !normalizedHeader.includes(column));
  if (missing.length) return { error: `Missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`, rows: [], summary: null };
  if (dataRows.length > maxImportRows) return { error: `Import files are limited to ${maxImportRows} rows.`, rows: [], summary: null };

  const indexFor = (column: string) => normalizedHeader.indexOf(column);
  const departments = await db.prepare("SELECT id, name FROM teams WHERE COALESCE(status, 'Active') = 'Active'").all<{ id: string; name: string }>();
  const subRoles = await db.prepare("SELECT id, label FROM creator_sub_roles WHERE status = 'Active'").all<{ id: string; label: string }>();
  const permissionMap = await loadPermissionMap(db);
  const departmentByName = new Map((departments.results || []).map((row) => [canonical(row.name), row]));
  const subRoleByName = new Map((subRoles.results || []).map((row) => [canonical(row.label), row]));
  const seenEmails = new Set<string>();
  const previewRows: ImportPreviewRow[] = [];

  for (const [rowIndex, values] of dataRows.entries()) {
    const rowNumber = rowIndex + 2;
    const firstName = String(values[indexFor("first_name")] || "").trim();
    const lastName = String(values[indexFor("last_name")] || "").trim();
    const email = String(values[indexFor("email")] || "").trim().toLowerCase();
    const departmentName = String(values[indexFor("department")] || "").trim();
    const accountTypeRaw = String(values[indexFor("account_type")] || "").trim();
    const creatorReviewerRole = String(values[indexFor("creator_reviewer_role")] || "").trim();
    const statusRaw = String(values[indexFor("status")] || "Active").trim();
    const permissionLabels = String(values[indexFor("permissions")] || "")
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
    const messages: string[] = [];

    if (!firstName) messages.push("Missing first name");
    if (!lastName) messages.push("Missing last name");
    if (!email) messages.push("Missing email");
    else if (!validEmail(email)) messages.push("Invalid email");
    if (email && seenEmails.has(email)) messages.push("Duplicate email in file");
    if (email) seenEmails.add(email);
    if (email && (await duplicateEmail(db, email))) messages.push("Email already exists");

    const department = departmentByName.get(canonical(departmentName));
    if (!department) messages.push("Unknown department");

    const accountType = normalizeAccountType(accountTypeRaw);
    if (!accountType) messages.push("Invalid account type");

    let subRoleId = "";
    if (accountType === creatorAccessLevel) {
      const subRole = subRoleByName.get(canonical(creatorReviewerRole));
      if (!subRole) messages.push("Invalid Creator/Reviewer role");
      else subRoleId = subRole.id;
    }

    const status = normalizeStatus(statusRaw);
    if (!status) messages.push("Invalid status");

    const { permissions, invalid } = await resolvePermissions(db, permissionLabels, []);
    if (invalid.length) messages.push(`Permission not recognized: ${invalid.join(", ")}`);

    previewRows.push({
      rowNumber,
      firstName,
      lastName,
      email,
      department: departmentName,
      accountType: accountType || accountTypeRaw,
      creatorReviewerRole,
      status: status || statusRaw,
      permissions: permissions.map((permission) => permission.name),
      valid: messages.length === 0,
      message: messages.length ? messages.join("; ") : "Valid",
      payload: messages.length
        ? undefined
        : {
            firstName,
            lastName,
            name: `${firstName} ${lastName}`.trim(),
            email,
            departmentId: department!.id,
            accessLevel: accountType as AccessLevel,
            status: status as UserStatus,
            subRoleId,
            permissions: permissions.map((permission) => permission.name),
          },
    });
  }

  const invalidCount = previewRows.filter((row) => !row.valid).length;
  return {
    rows: previewRows,
    summary: {
      totalRows: previewRows.length,
      validRows: previewRows.length - invalidCount,
      invalidRows: invalidCount,
      duplicateEmails: previewRows.filter((row) => row.message.includes("Duplicate email")).length,
    },
  };
}

async function handleImport(request: Request, db: D1DatabaseBinding, actor: AuthUser | null, commit: boolean) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonResponse({ error: "Choose a CSV file before validating users." }, 400);
  const fileName = file.name || "user-import.csv";
  const lowerName = fileName.toLowerCase();
  if (file.size > maxImportBytes) return jsonResponse({ error: "Import file is too large. Use a CSV file under 1 MB." }, 400);
  if (lowerName.endsWith(".xlsx")) {
    return jsonResponse({ error: "XLSX import is not enabled in this Cloudflare Worker yet. Download and use the CSV template for this import." }, 400);
  }
  if (!lowerName.endsWith(".csv") && file.type !== "text/csv") {
    return jsonResponse({ error: "Only CSV files are supported for this import workflow." }, 400);
  }

  const preview = await buildImportPreview(db, await file.text());
  if ("error" in preview && preview.error) return jsonResponse({ error: preview.error }, 400);

  if (!commit) return jsonResponse({ success: true, preview });
  if (preview.summary?.invalidRows) return jsonResponse({ error: "Fix invalid rows before importing users.", preview }, 400);

  const jobId = newId("import");
  await db
    .prepare(
      `INSERT INTO import_jobs (id, job_type, status, source, summary_json, started_at, created_at)
       VALUES (?, 'User Import', 'Running', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(jobId, fileName, JSON.stringify(preview.summary || {}))
    .run();

  const imported: Record<string, unknown>[] = [];
  try {
    for (const row of preview.rows) {
      if (!row.payload) continue;
      const syntheticRequest = new Request(request.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(row.payload),
      });
      const response = await saveUser(syntheticRequest, db, false, actor);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || `Row ${row.rowNumber} failed.`));
      imported.push(body.user);
      await db
        .prepare(
          `INSERT INTO user_import_rows (id, import_job_id, row_number, email, status, message, normalized_payload_json)
           VALUES (?, ?, ?, ?, 'Imported', 'Imported', ?)`,
        )
        .bind(newId("import-row"), jobId, row.rowNumber, row.email, JSON.stringify(row.payload))
        .run();
    }

    const summary = { ...preview.summary, importedRows: imported.length };
    await db
      .prepare("UPDATE import_jobs SET status = 'Completed', summary_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(JSON.stringify(summary), jobId)
      .run();
    await audit(db, actor, "Bulk Import Users", jobId, summary, request);
    const usersResult = await db.prepare(`${usersSelect()} GROUP BY users.id ${sortClause()}`).all<Record<string, unknown>>();
    return jsonResponse({ success: true, importJobId: jobId, summary, users: (usersResult.results || []).map(normalizeUser) }, 201);
  } catch (error) {
    await db
      .prepare("UPDATE import_jobs SET status = 'Failed', summary_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(JSON.stringify({ ...preview.summary, error: readableError(error, "Import failed.") }), jobId)
      .run();
    return jsonResponse({ error: readableError(error, "Import failed before all users were created.") }, 400);
  }
}
