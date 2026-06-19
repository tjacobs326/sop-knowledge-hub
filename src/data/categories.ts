export interface SopCategory {
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
}

export const categories: SopCategory[] = [
  {
    name: "Ivanti / Ticketing System",
    slug: "ivanti-ticketing-system",
    description: "Guides for submitting, updating, routing, and resolving tickets.",
    icon: "🎫",
    color: "#e0f2fe",
  },
  {
    name: "Brightspace D2L",
    slug: "brightspace-d2l",
    description:
      "Guides for managing courses, content, settings, and user experiences in Brightspace D2L.",
    icon: "🎓",
    color: "#fef3c7",
  },
  {
    name: "Course Builds",
    slug: "course-builds",
    description: "Processes and checklists for building, updating, and preparing courses.",
    icon: "🏗️",
    color: "#ede9fe",
  },
  {
    name: "QA Processes",
    slug: "qa-processes",
    description:
      "Quality assurance reviews, launch checks, and issue documentation procedures.",
    icon: "✅",
    color: "#dcfce7",
  },
  {
    name: "AI Tools",
    slug: "ai-tools",
    description:
      "Approved AI workflows, prompt guidance, review practices, and responsible use procedures.",
    icon: "🤖",
    color: "#fce7f3",
  },
  {
    name: "Troubleshooting",
    slug: "troubleshooting",
    description: "Step-by-step guides for diagnosing and resolving common problems.",
    icon: "🔧",
    color: "#fee2e2",
  },
  {
    name: "Templates",
    slug: "templates",
    description: "Reusable forms, checklists, prompts, and documentation templates.",
    icon: "📋",
    color: "#f0fdf4",
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
