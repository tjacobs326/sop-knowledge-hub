import {
  idFrom,
  listFromJson,
  readJsonBody,
  requireDb,
  type AccessLevel,
  type UserStatus,
} from "../../_shared/admin";
import { requirePermission } from "../../_shared/auth";
import { jsonResponse, type D1DatabaseBinding, type PagesFunctionContext } from "../../_shared/cloudflare";
import { getActiveDepartment } from "../../_shared/departments";

interface UserPayload {
  id?: string;
  name?: string;
  email?: string;
  departmentId?: string;
  teamId?: string;
  department?: string;
  title?: string;
  accessLevel?: AccessLevel;
  status?: UserStatus;
  permissions?: string[];
}

interface RolePayload {
  id?: string;
  name?: string;
  accessGroup?: string;
  landingPage?: string;
  description?: string;
  permissions?: string[];
}

const accessLevels = new Set(["Normal User", "Creator / Reviewer", "Admin"]);
const statuses = new Set(["Active", "Pending", "Suspended", "Archived"]);

function usersSelect() {
  return `SELECT
    users.id,
    users.name,
    users.email,
    COALESCE(teams.name, users.department) AS department,
    users.team_id AS departmentId,
    users.team_id AS teamId,
    users.title,
    users.access_level AS accessLevel,
    users.status,
    users.role_id AS roleId,
    roles.permissions_json AS permissionsJson,
    users.created_at AS createdAt,
    users.updated_at AS updatedAt
  FROM users
  LEFT JOIN roles ON roles.id = users.role_id
  LEFT JOIN teams ON teams.id = users.team_id`;
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

function normalizeUser(row: Record<string, unknown>) {
  return {
    ...row,
    permissions: listFromJson(String(row.permissionsJson || "[]")),
    permissionsJson: undefined,
    roleIds: row.roleId ? [row.roleId] : [],
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
  return await db.prepare("SELECT id FROM roles WHERE access_level = ? AND status != 'Archived' LIMIT 1")
    .bind(accessLevel)
    .first<{ id: string }>();
}

async function replaceUserRole(db: D1DatabaseBinding, userId: string, roleId: string | null) {
  await db.prepare("DELETE FROM user_roles WHERE user_id = ?").bind(userId).run();
  if (roleId) {
    await db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)")
      .bind(userId, roleId)
      .run();
  }
}

export const onRequestGet = async (context: PagesFunctionContext) => {
  const { env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Users");
  if (auth.response) return auth.response;
  const db = env.DB!;

  const [usersResult, rolesResult] = await Promise.all([
    db.prepare(`${usersSelect()} ORDER BY users.name ASC`).all<Record<string, unknown>>(),
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

  const url = new URL(request.url);
  if (url.searchParams.get("type") === "role") return saveRole(request, db, false);
  return saveUser(request, db, false);
};

export const onRequestPut = async (context: PagesFunctionContext) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Users");
  if (auth.response) return auth.response;
  const db = env.DB!;

  const url = new URL(request.url);
  if (url.searchParams.get("type") === "role") return saveRole(request, db, true);
  return saveUser(request, db, true);
};

export const onRequestDelete = async (context: PagesFunctionContext) => {
  const { request, env } = context;
  const missingDb = requireDb(env.DB);
  if (missingDb) return missingDb;
  const auth = await requirePermission(context, "Manage Users");
  if (auth.response) return auth.response;
  const db = env.DB!;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonResponse({ error: "id is required." }, 400);

  await db.prepare("UPDATE users SET status = 'Archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(id)
    .run();
  return jsonResponse({ ok: true });
};

async function saveUser(request: Request, db: D1DatabaseBinding, isUpdate: boolean) {
  const [payload, parseError] = await readJsonBody<UserPayload>(request);
  if (parseError) return parseError;

  const name = String(payload?.name || "").trim();
  const email = String(payload?.email || "").trim().toLowerCase();
  if (!name) return jsonResponse({ error: "User name is required." }, 400);
  if (!email) return jsonResponse({ error: "Email is required." }, 400);

  const accessLevel = accessLevels.has(String(payload?.accessLevel))
    ? String(payload?.accessLevel)
    : "Normal User";
  const status = statuses.has(String(payload?.status)) ? String(payload?.status) : "Active";
  const id = payload?.id || idFrom(email, "user");
  const role = await roleForAccessLevel(db, accessLevel);
  const departmentId = String(payload?.departmentId || payload?.teamId || "").trim();
  const department = await getActiveDepartment(db, departmentId);
  if (!department) {
    return jsonResponse(
      {
        error: "Select an active department from the list.",
        fields: { departmentId: "Select an active department." },
      },
      400,
    );
  }

  if (isUpdate) {
    await db.prepare(
      `UPDATE users
       SET name = ?, email = ?, department = ?, title = ?, team_id = ?, access_level = ?, role_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
      .bind(
        name,
        email,
        department.name,
        String(payload?.title || ""),
        department.id,
        accessLevel,
        role?.id || null,
        status,
        id,
      )
      .run();
  } else {
    await db.prepare(
      `INSERT INTO users (id, name, email, department, title, team_id, access_level, role_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
      .bind(
        id,
        name,
        email,
        department.name,
        String(payload?.title || ""),
        department.id,
        accessLevel,
        role?.id || null,
        status,
      )
      .run();
  }

  await replaceUserRole(db, id, role?.id || null);
  const user = await db.prepare(`${usersSelect()} WHERE users.id = ?`).bind(id).first<Record<string, unknown>>();
  return jsonResponse({ user: user ? normalizeUser(user) : null }, isUpdate ? 200 : 201);
}

async function saveRole(request: Request, db: D1DatabaseBinding, isUpdate: boolean) {
  const [payload, parseError] = await readJsonBody<RolePayload>(request);
  if (parseError) return parseError;

  const id = String(payload?.id || "").trim();
  const name = String(payload?.name || "").trim();
  if (!id) return jsonResponse({ error: "Role id is required." }, 400);
  if (!name) return jsonResponse({ error: "Role name is required." }, 400);

  const permissionsJson = JSON.stringify(payload?.permissions || []);
  const current = await db.prepare("SELECT access_level FROM roles WHERE id = ?")
    .bind(id)
    .first<{ access_level: AccessLevel }>();

  if (!current && isUpdate) return jsonResponse({ error: "Role not found." }, 404);

  if (isUpdate) {
    await db.prepare(
      `UPDATE roles
       SET name = ?, description = ?, permissions_json = ?, access_group = ?, landing_page = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
      .bind(
        name,
        String(payload?.description || ""),
        permissionsJson,
        String(payload?.accessGroup || ""),
        String(payload?.landingPage || ""),
        id,
      )
      .run();
  } else {
    await db.prepare(
      `INSERT INTO roles (id, name, description, permissions_json, access_group, landing_page, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
      .bind(
        id,
        name,
        String(payload?.description || ""),
        permissionsJson,
        String(payload?.accessGroup || ""),
        String(payload?.landingPage || ""),
      )
      .run();
  }

  const role = await db.prepare(`${rolesSelect()} WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  return jsonResponse({ role: role ? normalizeRole(role) : null }, isUpdate ? 200 : 201);
}
