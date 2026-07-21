import { failure, type ApiRole } from "./api";
import { safeJsonParse, type D1DatabaseBinding, type PagesFunctionContext } from "./cloudflare";
import { listUserSubRoles, resolveSelectedSubRole, type CreatorSubRole } from "./ownership";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type PermissionName =
  | "Search SOPs"
  | "Use Guided Finder"
  | "Browse Categories"
  | "Submit Requests"
  | "Create SOPs"
  | "Edit Drafts"
  | "Review SOPs"
  | "Request Changes"
  | "Approve SOPs"
  | "Publish SOPs"
  | "Archive SOPs"
  | "Manage Users"
  | "Manage Categories"
  | "Manage Tags"
  | "View Analytics"
  | "Upload Media"
  | "Manage Media"
  | "Manage SOP Inventory"
  | "Settings";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  accessLevel: "Normal User" | "Creator / Reviewer" | "Admin";
  role: ApiRole;
  permissions: string[];
  subRoles: CreatorSubRole[];
  selectedSubRole: CreatorSubRole | null;
  isLocalDev: boolean;
}

interface UserPermissionRow {
  id: string;
  name: string;
  email: string;
  accessLevel: AuthUser["accessLevel"];
  permissionsJson: string | null;
  rolePermissionsCsv: string | null;
  userPermissionsCsv?: string | null;
}

const roleByAccessLevel: Record<AuthUser["accessLevel"], ApiRole> = {
  "Normal User": "normal",
  "Creator / Reviewer": "creator",
  Admin: "admin",
};

const fallbackPermissionsByRole: Record<ApiRole, PermissionName[]> = {
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
    "Upload Media",
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
    "Manage SOP Inventory",
    "Settings",
  ],
};

function isLocalRequest(request: Request) {
  const host = new URL(request.url).hostname;
  return host === "127.0.0.1" || host === "localhost";
}

function normalizeRole(value: string | null): ApiRole {
  const role = String(value || "").toLowerCase();
  if (role.includes("admin")) return "admin";
  if (role.includes("creator") || role.includes("reviewer")) return "creator";
  return "normal";
}

function accessLevelForRole(role: ApiRole): AuthUser["accessLevel"] {
  if (role === "admin") return "Admin";
  if (role === "creator") return "Creator / Reviewer";
  return "Normal User";
}

const accessKeySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function normalizedTeamDomain(value: string | undefined) {
  const raw = String(value || "").trim().replace(/\/$/, "");
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".cloudflareaccess.com")) return "";
    return url.origin;
  } catch {
    return "";
  }
}

function accessKeySet(teamDomain: string) {
  const existing = accessKeySets.get(teamDomain);
  if (existing) return existing;
  const keySet = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  accessKeySets.set(teamDomain, keySet);
  return keySet;
}

async function verifiedAccessIdentity(context: PagesFunctionContext): Promise<JWTPayload | null> {
  const teamDomain = normalizedTeamDomain(context.env.TEAM_DOMAIN);
  const audience = String(context.env.POLICY_AUD || "").trim();
  const token = String(context.request.headers.get("cf-access-jwt-assertion") || "").trim();
  if (!teamDomain || !audience || !token) return null;
  try {
    const { payload } = await jwtVerify(token, accessKeySet(teamDomain), {
      issuer: teamDomain,
      audience,
      algorithms: ["RS256"],
    });
    return payload;
  } catch {
    return null;
  }
}

function localDevUser(request: Request): AuthUser | null {
  const requestedRole = request.headers.get("x-sop-dev-role");
  if (!isLocalRequest(request)) return null;

  const role = normalizeRole(requestedRole || "admin");
  const email = String(request.headers.get("x-sop-dev-email") || "tjacobs@example.org")
    .trim()
    .toLowerCase();
  const devSubRoles: CreatorSubRole[] = [
    {
      id: "subrole-instructional-technology-specialist",
      label: "Instructional Technologist",
      slug: "instructional-technologist",
      department: "Instructional Technology",
      teamId: "team-instructional-technology-specialists",
    },
    {
      id: "subrole-instructional-designer",
      label: "Instructional Designer",
      slug: "instructional-designer",
      department: "Instructional Design",
      teamId: "team-instructional-designers",
    },
    {
      id: "subrole-project-manager",
      label: "Project Manager",
      slug: "project-manager",
      department: "Project Management",
      teamId: "team-project-managers",
    },
    {
      id: "subrole-quality-assurance-specialist",
      label: "Quality Assurance Specialist",
      slug: "quality-assurance-specialist",
      department: "Quality Assurance",
      teamId: "team-quality-assurance-specialists",
    },
    {
      id: "subrole-multimedia",
      label: "Multimedia",
      slug: "multimedia",
      department: "Multimedia",
      teamId: "team-multimedia",
    },
  ];
  const subRoles = role === "creator" ? devSubRoles : [];

  const user: AuthUser = {
    id: role === "admin" ? "tarek-jacobs" : role === "creator" ? "maya-patel" : "staff-user",
    name: role === "admin" ? "Tarek Jacobs" : role === "creator" ? "Maya Patel" : "Staff User",
    email,
    accessLevel: accessLevelForRole(role),
    role,
    permissions: fallbackPermissionsByRole[role],
    subRoles,
    selectedSubRole: null,
    isLocalDev: true,
  };
  user.selectedSubRole = resolveSelectedSubRole(user, request);
  return user;
}

function normalizePermissions(row: UserPermissionRow) {
  const fromRoleJson = safeJsonParse<string[]>(row.permissionsJson, []);
  const fromJoin = String(row.rolePermissionsCsv || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const fromUserOverrides = String(row.userPermissionsCsv || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set([...fromRoleJson, ...fromJoin, ...fromUserOverrides]));
}

async function findUserByEmail(db: D1DatabaseBinding, email: string) {
  const baseSelect = `SELECT
    users.id,
    users.name,
    users.email,
    users.access_level AS accessLevel,
    roles.permissions_json AS permissionsJson,
    GROUP_CONCAT(DISTINCT permissions.name) AS rolePermissionsCsv`;
  const baseJoin = `FROM users
    LEFT JOIN user_roles ON user_roles.user_id = users.id
      AND (user_roles.expires_at IS NULL OR user_roles.expires_at > CURRENT_TIMESTAMP)
    LEFT JOIN roles ON roles.id = COALESCE(user_roles.role_id, users.role_id)
    LEFT JOIN role_permissions ON role_permissions.role_id = roles.id
    LEFT JOIN permissions ON permissions.id = role_permissions.permission_id`;
  const where = `WHERE lower(users.email) = lower(?)
      AND users.status = 'Active'
      AND COALESCE(users.is_active, 1) = 1
    GROUP BY users.id
    LIMIT 1`;

  try {
    return await db
      .prepare(
        `${baseSelect},
          GROUP_CONCAT(DISTINCT user_override_permissions.name) AS userPermissionsCsv
         ${baseJoin}
         LEFT JOIN user_permission_overrides ON user_permission_overrides.user_id = users.id
         LEFT JOIN permissions user_override_permissions ON user_override_permissions.id = user_permission_overrides.permission_id
         ${where}`,
      )
      .bind(email)
      .first<UserPermissionRow>();
  } catch {
    return await db.prepare(`${baseSelect}, NULL AS userPermissionsCsv ${baseJoin} ${where}`).bind(email).first<UserPermissionRow>();
  }
}

export async function getAuthUser(context: PagesFunctionContext): Promise<AuthUser | null> {
  const local = localDevUser(context.request);
  if (local) return local;

  if (!context.env.DB) return null;
  const identity = await verifiedAccessIdentity(context);
  const email = typeof identity?.email === "string" ? identity.email.trim().toLowerCase() : "";
  if (!email) return null;

  const row = await findUserByEmail(context.env.DB, email);
  if (!row) return null;

  const accessLevel = row.accessLevel || "Normal User";
  const role = roleByAccessLevel[accessLevel] || "normal";
  const permissions = normalizePermissions(row);
  const subRoles = role === "creator" ? await listUserSubRoles(context.env.DB, row.id) : [];

  const user: AuthUser = {
    id: row.id,
    name: row.name,
    email: row.email,
    accessLevel,
    role,
    permissions: permissions.length ? permissions : fallbackPermissionsByRole[role],
    subRoles,
    selectedSubRole: null,
    isLocalDev: false,
  };
  user.selectedSubRole = resolveSelectedSubRole(user, context.request);
  return user;
}

export function hasPermission(user: AuthUser, permission: PermissionName) {
  return user.role === "admin" || user.permissions.includes(permission);
}

export async function requireAuth(context: PagesFunctionContext) {
  const user = await getAuthUser(context);
  if (!user) {
    return {
      user: null,
      response: failure("UNAUTHENTICATED", "Sign in before using this API.", 401),
    };
  }
  return { user, response: null };
}

export async function requirePermission(context: PagesFunctionContext, permission: PermissionName) {
  const { user, response } = await requireAuth(context);
  if (response || !user) return { user, response };

  if (!hasPermission(user, permission)) {
    return {
      user,
      response: failure("FORBIDDEN", "You do not have permission to perform this action.", 403),
    };
  }

  return { user, response: null };
}
