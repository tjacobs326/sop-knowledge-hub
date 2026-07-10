import { failure, type ApiRole } from "./api";
import { safeJsonParse, type D1DatabaseBinding, type PagesFunctionContext } from "./cloudflare";
import { listCreatorSubRoles, listUserSubRoles, resolveSelectedSubRole, selectedSubRoleFromRequest, type CreatorSubRole } from "./ownership";

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

function localDevUser(request: Request): AuthUser | null {
  if (!isLocalRequest(request)) return null;

  const role = normalizeRole(request.headers.get("x-sop-dev-role") || "admin");
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

async function previewCreatorUser(request: Request, db: D1DatabaseBinding): Promise<AuthUser | null> {
  const requested = selectedSubRoleFromRequest(request);
  if (!requested) return null;

  const subRoles = await listCreatorSubRoles(db);
  const selected = subRoles.find((subRole) => subRole.id === requested || subRole.slug === requested);
  if (!selected) return null;
  const user = await db
    .prepare(
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
       LIMIT 1`,
    )
    .bind(selected.id, selected.teamId || "", selected.department)
    .first<{ id: string; name: string; email: string; accessLevel: AuthUser["accessLevel"] }>()
    .catch(() => null);

  return {
    id: user?.id || "preview-creator-reviewer",
    name: user?.name || "Creator / Reviewer Preview",
    email: user?.email || "creator-reviewer-preview@example.org",
    accessLevel: user?.accessLevel || "Creator / Reviewer",
    role: user?.accessLevel === "Admin" ? "admin" : "creator",
    permissions: user?.accessLevel === "Admin" ? fallbackPermissionsByRole.admin : fallbackPermissionsByRole.creator,
    subRoles: [selected],
    selectedSubRole: selected,
    isLocalDev: false,
  };
}

export async function getAuthUser(context: PagesFunctionContext): Promise<AuthUser | null> {
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
