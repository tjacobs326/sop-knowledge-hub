export const roleAccessViews = [
  {
    id: "normal",
    title: "Normal User",
    label: "Normal Users",
    description: "Search SOPs, use Guided Finder, browse categories, and submit requests.",
    landingPage: "/search/",
    options: ["Search SOPs", "Guided Finder", "Categories", "Submit Request"],
  },
  {
    id: "creator",
    title: "Creator / Reviewer",
    label: "Creators / Reviewers",
    description: "Create SOPs, manage drafts, review submissions, and handle assigned work.",
    landingPage: "/my-work/",
    options: ["My Work", "AI Assist", "Create SOP", "Review Queue", "Needs Review"],
  },
  {
    id: "admin",
    title: "Admin",
    label: "Admins",
    description: "Manage users, taxonomy, analytics, settings, and platform governance.",
    landingPage: "/admin/users/",
    options: ["Users", "Categories", "Tags", "Analytics", "Settings"],
  },
];

export const roleRouteRules = [
  { pattern: "^/admin/users/", roles: ["admin"] },
  { pattern: "^/admin/categories/", roles: ["admin"] },
  { pattern: "^/admin/tags/", roles: ["admin"] },
  { pattern: "^/admin/analytics/", roles: ["admin"] },
  { pattern: "^/admin/settings/", roles: ["admin"] },
  { pattern: "^/admin/review/", roles: ["creator", "admin"] },
  { pattern: "^/admin/needs-review/", roles: ["creator", "admin"] },
  { pattern: "^/create/", roles: ["creator", "admin"] },
  { pattern: "^/drafts/", roles: ["creator", "admin"] },
  { pattern: "^/my-work/", roles: ["creator", "admin"] },
  { pattern: "^/ai-assist/", roles: ["creator", "admin"] },
];

export const adminSettings = [
  {
    id: "access-model",
    label: "Access model",
    description: "Use Cloudflare Access groups for Normal Users, Creators / Reviewers, and Admins.",
    owner: "SOP administrators",
    primaryPolicy: "Cloudflare Access role groups",
    status: "Planned",
    notes: "Map each navigation role to an Access group before sharing broadly.",
    options: ["Normal Users", "Creators / Reviewers", "Admins"],
  },
  {
    id: "review-workflow",
    label: "Review workflow",
    description: "Route submitted requests into the review queue before publishing.",
    owner: "Instructional Technology",
    primaryPolicy: "Draft -> In Review -> Needs Revision -> Approved -> Published",
    status: "Active",
    notes: "Reviewers can move items through the queue and convert submissions into editable drafts.",
    options: ["Require owner assignment", "Require review date", "Allow direct publish"],
  },
  {
    id: "taxonomy",
    label: "Taxonomy",
    description: "Maintain categories and tags as shared admin-controlled lists.",
    owner: "Knowledge Manager",
    primaryPolicy: "Admin-managed categories and tags",
    status: "Active",
    notes: "Categories define major SOP buckets. Tags improve search, analytics, and cross-category discovery.",
    options: ["Allow category edits", "Allow tag edits", "Track unused tags"],
  },
];

export const adminSettingStatusOptions = ["Planned", "Active", "Paused", "Needs Review"];
