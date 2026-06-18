export interface SopCategory {
  name: string;
  slug: string;
  description: string;
}

export const categories: SopCategory[] = [
  {
    name: "Ivanti / Ticketing System",
    slug: "ivanti-ticketing-system",
    description: "Guides for submitting, updating, routing, and resolving tickets.",
  },
  {
    name: "Brightspace D2L",
    slug: "brightspace-d2l",
    description:
      "Guides for managing courses, content, settings, and user experiences in Brightspace D2L.",
  },
  {
    name: "Course Builds",
    slug: "course-builds",
    description: "Processes and checklists for building, updating, and preparing courses.",
  },
  {
    name: "QA Processes",
    slug: "qa-processes",
    description:
      "Quality assurance reviews, launch checks, and issue documentation procedures.",
  },
  {
    name: "AI Tools",
    slug: "ai-tools",
    description:
      "Approved AI workflows, prompt guidance, review practices, and responsible use procedures.",
  },
  {
    name: "Troubleshooting",
    slug: "troubleshooting",
    description: "Step-by-step guides for diagnosing and resolving common problems.",
  },
  {
    name: "Templates",
    slug: "templates",
    description: "Reusable forms, checklists, prompts, and documentation templates.",
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
