import type { Category } from "./models";

export type SopCategory = Category;

export const categories: SopCategory[] = [
  {
    id: "category-ivanti-ticketing-system",
    name: "Ivanti / Ticketing System",
    slug: "ivanti-ticketing-system",
    description: "Guides for submitting, updating, routing, and resolving tickets.",
    icon: "IT",
    color: "#e0f2fe",
    ownerTeamId: "team-instructional-technology",
    sortOrder: 10,
    status: "Active",
    createdAt: "2026-06-01T09:00:00Z",
    updatedAt: "2026-06-18T15:30:00Z",
  },
  {
    id: "category-brightspace-d2l",
    name: "Brightspace D2L",
    slug: "brightspace-d2l",
    description:
      "Guides for managing courses, content, settings, and user experiences in Brightspace D2L.",
    icon: "D2L",
    color: "#fef3c7",
    ownerTeamId: "team-instructional-technology",
    sortOrder: 20,
    status: "Active",
    createdAt: "2026-06-01T09:00:00Z",
    updatedAt: "2026-06-18T15:30:00Z",
  },
  {
    id: "category-course-builds",
    name: "Course Builds",
    slug: "course-builds",
    description: "Processes and checklists for building, updating, and preparing courses.",
    icon: "CB",
    color: "#ede9fe",
    ownerTeamId: "team-instructional-technology",
    sortOrder: 30,
    status: "Active",
    createdAt: "2026-06-01T09:00:00Z",
    updatedAt: "2026-06-18T15:30:00Z",
  },
  {
    id: "category-qa-processes",
    name: "QA Processes",
    slug: "qa-processes",
    description:
      "Quality assurance reviews, launch checks, and issue documentation procedures.",
    icon: "QA",
    color: "#dcfce7",
    ownerTeamId: "team-quality-assurance",
    sortOrder: 40,
    status: "Active",
    createdAt: "2026-06-01T09:00:00Z",
    updatedAt: "2026-06-18T15:30:00Z",
  },
  {
    id: "category-ai-tools",
    name: "AI Tools",
    slug: "ai-tools",
    description:
      "Approved AI workflows, prompt guidance, review practices, and responsible use procedures.",
    icon: "AI",
    color: "#fce7f3",
    ownerTeamId: "team-curriculum-design",
    sortOrder: 50,
    status: "Active",
    createdAt: "2026-06-01T09:00:00Z",
    updatedAt: "2026-06-18T15:30:00Z",
  },
  {
    id: "category-troubleshooting",
    name: "Troubleshooting",
    slug: "troubleshooting",
    description: "Step-by-step guides for diagnosing and resolving common problems.",
    icon: "TR",
    color: "#fee2e2",
    ownerTeamId: "team-instructional-technology",
    sortOrder: 60,
    status: "Active",
    createdAt: "2026-06-01T09:00:00Z",
    updatedAt: "2026-06-18T15:30:00Z",
  },
  {
    id: "category-templates",
    name: "Templates",
    slug: "templates",
    description: "Reusable forms, checklists, prompts, and documentation templates.",
    icon: "TP",
    color: "#f0fdf4",
    ownerTeamId: "team-curriculum-design",
    sortOrder: 70,
    status: "Active",
    createdAt: "2026-06-01T09:00:00Z",
    updatedAt: "2026-06-18T15:30:00Z",
  },
];

export function getCategoryBySlug(slug: string) {
  return categories.find((category) => category.slug === slug);
}

export function getCategoryByName(name: string) {
  return categories.find((category) => category.name === name);
}

export function categorySlugFromName(name: string) {
  return getCategoryByName(name)?.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
