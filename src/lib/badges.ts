export type BadgeKind = "status" | "priority";

export interface BadgeDefinition {
  label: string;
  className: string;
}

const fallbackStatus: BadgeDefinition = {
  label: "New",
  className: "status-badge--new",
};

const fallbackPriority: BadgeDefinition = {
  label: "Medium",
  className: "priority-badge--medium",
};

export const statusBadgeDefinitions: Record<string, BadgeDefinition> = {
  new: { label: "New", className: "status-badge--new" },
  submitted: { label: "New", className: "status-badge--new" },
  draft: { label: "Draft", className: "status-badge--draft" },
  drafting: { label: "Draft", className: "status-badge--draft" },
  "in-review": { label: "In Review", className: "status-badge--in-review" },
  "needs-review": { label: "In Review", className: "status-badge--in-review" },
  "needs-revision": {
    label: "Needs Revision",
    className: "status-badge--needs-revision",
  },
  "needs-more-information": {
    label: "Needs Revision",
    className: "status-badge--needs-revision",
  },
  triage: { label: "Triage", className: "status-badge--triage" },
  assigned: { label: "Triage", className: "status-badge--triage" },
  approved: { label: "Approved", className: "status-badge--approved" },
  published: { label: "Published", className: "status-badge--published" },
  archived: { label: "Archived", className: "status-badge--archived" },
  deprecated: { label: "Archived", className: "status-badge--archived" },
  "past-due": { label: "Past Due", className: "status-badge--past-due" },
  overdue: { label: "Past Due", className: "status-badge--past-due" },
};

export const priorityBadgeDefinitions: Record<string, BadgeDefinition> = {
  low: { label: "Low", className: "priority-badge--low" },
  medium: { label: "Medium", className: "priority-badge--medium" },
  high: { label: "High", className: "priority-badge--high" },
  urgent: { label: "Urgent", className: "priority-badge--urgent" },
};

export function badgeKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getStatusBadge(status: string): BadgeDefinition {
  return statusBadgeDefinitions[badgeKey(status)] ?? {
    label: status || fallbackStatus.label,
    className: fallbackStatus.className,
  };
}

export function getPriorityBadge(priority: string): BadgeDefinition {
  return priorityBadgeDefinitions[badgeKey(priority)] ?? {
    label: priority || fallbackPriority.label,
    className: fallbackPriority.className,
  };
}
