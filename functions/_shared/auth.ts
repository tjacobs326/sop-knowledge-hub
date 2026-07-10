import { failure, type ApiRole } from "./api";
import { safeJsonParse, type D1DatabaseBinding, type PagesFunctionContext } from "./cloudflare";
import { listUserSubRoles, resolveSelectedSubRole, type CreatorSubRole } from "./ownership";

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
  | "Settings";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  accessLevel: "Guest" | "Standard User" | "Normal User" | "Creator / Reviewer" | "Admin";
  role: ApiRole;
  permissions: string[];
  subRoles: CreatorSubRole[];
  selectedSubRole: CreatorSubRole | null;
  isLocalDev: boolean;
  isGuest: boolean;
}

interface UserPermissionRow {
  id: string;
  name: string;
  email: string;
  accessLevel: AuthUser["accessLevel"];
  permissionsJson: string | null;
  rolePermissionsCsv: string | null;
}

const roleByAccessLevel: Record<string, ApiRole> = {
  Guest: "normal",
  "Standard User": "normal",
  "Normal User": "normal",
  "Creator / Reviewer": "creator",
  Admin: "admin",
};

const guestPermissions: PermissionName[] = ["Search SOPs", "Use Guided Finder", "Browse Categories"];

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

function guestUser(): AuthUser {
  return {
    id: "guest",
    name: "Guest",
    email: "",
    accessLevel: "Guest",
    role: "normal",
    permissions: guestPermissions,
    subRoles: [],
    selectedSubRole: null,
    isLocalDev: false,
    isGuest: true,
  };
}

function emailFromRequest(request: Request) {
  return (
    request.headers.get("cf-access-authenticated-user-email") ||
    request.headers.get("x-authenticated-user-email") ||
    request.headers.get("x-forwarded-email") ||
    ""
  )
    .trim()
    .toLowerCase();
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function jsonFromJwtPart<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(value))) as T;
  } catch {
    return null;
  }
}

function normalizeAccessDomain(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
}

async function emailFromAccessJwt(context: PagesFunctionContext) {
  const jwt = context.request.headers.get("cf-access-jwt-assertion") || "";
  const teamDomain = normalizeAccessDomain(context.env.CF_ACCESS_TEAM_DOMAIN || "");
  const expectedAudience = String(context.env.CF_ACCESS_AUD || "").trim();
  if (!jwt || !teamDomain || !expectedAudience) return "";

  const parts = jwt.split(".");
  if (parts.length !== 3) return "";
  const header = jsonFromJwtPart<{ kid?: string; alg?: string }>(parts[0]);
  const payload = jsonFromJwtPart<{
    aud?: string[] | string;
    email?: string;
    exp?: number;
    nbf?: number;
    iss?: string;
  }>(parts[1]);
  if (!header?.kid || header.alg !== "RS256" || !payload?.email) return "";

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return "";
  if (payload.nbf && payload.nbf > now) return "";
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud].filter(Boolean);
  if (!audiences.includes(expectedAudience)) return "";
  if (payload.iss && !payload.iss.startsWith(teamDomain)) return "";

  const certsResponse = await fetch(`${teamDomain}/cdn-cgi/access/certs`, {
    headers: { accept: "application/json" },
  }).catch(() => null);
  if (!certsResponse?.ok) return "";
  const certs = (await certsResponse.json().catch(() => null)) as { keys?: Array<JsonWebKey & { kid?: string }> } | null;
  const key = certs?.keys?.find((item) => item.kid === header.kid);
  if (!key) return "";

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    base64UrlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  return verified ? payload.email.trim().toLowerCase() : "";
}

function localDevUser(request: Request): AuthUser | null {
  if (!isLocalRequest(request)) return null;
  if (!request.headers.get("x-sop-dev-role")) return null;

  const role = normalizeRole(request.headers.get("x-sop-dev-role"));
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
      label: "Multimedia Specialist",
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
    isGuest: false,
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
  return Array.from(new Set([...fromRoleJson, ...fromJoin]));
}

async function findUserByEmail(db: D1DatabaseBinding, email: string) {
  return await db
    .prepare(
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
       LIMIT 1`,
    )
    .bind(email)
    .first<UserPermissionRow>();
}

export async function getAuthUser(context: PagesFunctionContext): Promise<AuthUser | null> {
  const local = localDevUser(context.request);
  if (local) return local;

  const email = (await emailFromAccessJwt(context)) || (isLocalRequest(context.request) ? emailFromRequest(context.request) : "");
  if (!context.env.DB) return guestUser();
  if (!email) return guestUser();

  const row = await findUserByEmail(context.env.DB, email);
  if (!row) return guestUser();

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
    isGuest: false,
  };
  user.selectedSubRole = resolveSelectedSubRole(user, context.request);
  return user;
}

export function hasPermission(user: AuthUser, permission: PermissionName) {
  return !user.isGuest && (user.role === "admin" || user.permissions.includes(permission));
}

export async function requireAuth(context: PagesFunctionContext) {
  const user = await getAuthUser(context);
  if (!user || user.isGuest) {
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
