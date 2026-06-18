import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const statusValues = [
  "Draft",
  "In Review",
  "Approved",
  "Needs Revision",
  "Published",
  "Archived",
] as const;

const sopTypeValues = [
  "Process",
  "Troubleshooting Guide",
  "Template",
  "Checklist",
  "Job Aid",
  "Decision Tree",
] as const;

const sops = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/sops" }),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    purpose: z.string(),
    owner: z.string(),
    lastUpdated: z.string(),
    reviewDate: z.string(),
    category: z.string(),
    type: z.enum(sopTypeValues),
    tools: z.array(z.string()),
    audience: z.array(z.string()),
    tags: z.array(z.string()),
    status: z.enum(statusValues),
    version: z.string(),
    approver: z.string(),
    createdDate: z.string(),
    lastReviewedBy: z.string(),
    changeHistory: z.array(
      z.object({
        version: z.string(),
        date: z.string(),
        editor: z.string(),
        summary: z.string(),
      }),
    ),
    estimatedCompletionTime: z.string(),
    relatedSops: z.array(z.string()).default([]),
    screenshots: z
      .array(
        z.object({
          src: z.string(),
          alt: z.string(),
          caption: z.string(),
        }),
      )
      .default([]),
  }),
});

export const collections = { sops };
