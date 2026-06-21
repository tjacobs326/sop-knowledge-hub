export const USER_STORAGE_KEY = "sopHubAdminUsers";

export const accessLevels = ["Normal User", "Creator / Reviewer", "Admin"];

export const userAccounts = [
  {
    id: "tarek-jacobs",
    name: "Tarek Jacobs",
    email: "tjacobs@example.org",
    department: "Instructional Technology",
    accessLevel: "Admin",
    permissions: ["Manage Users", "Manage Categories", "Manage Tags", "View Analytics", "Settings"],
    status: "Active",
  },
  {
    id: "course-qa-team",
    name: "Course QA Team",
    email: "courseqa@example.org",
    department: "Quality Assurance",
    accessLevel: "Creator / Reviewer",
    permissions: ["Create SOPs", "Edit Drafts", "Review Queue", "Needs Review"],
    status: "Active",
  },
  {
    id: "maya-patel",
    name: "Maya Patel",
    email: "maya.patel@example.edu",
    department: "Curriculum Design",
    accessLevel: "Creator / Reviewer",
    permissions: ["Create SOPs", "Edit Drafts", "Review Queue", "Needs Review"],
    status: "Active",
  },
  {
    id: "staff-user",
    name: "Staff User",
    email: "staff@example.org",
    department: "Academic Operations",
    accessLevel: "Normal User",
    permissions: ["Search SOPs", "Use Guided Finder", "Browse Categories", "Submit Requests"],
    status: "Active",
  },
];
