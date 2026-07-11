import { readFileSync } from "node:fs";

const files = {
  component: readFileSync("src/components/GuidedFinder.astro", "utf8"),
  api: readFileSync("functions/api/guided-finder.ts", "utf8"),
  header: readFileSync("src/components/Header.astro", "utf8"),
  home: readFileSync("src/pages/index.astro", "utf8"),
  route: readFileSync("src/pages/guided-finder.astro", "utf8"),
};

const checks = [
  ["header uses canonical route", files.header.includes('href: "/guided-finder/"')],
  ["home hero uses canonical route", files.home.includes('href="/guided-finder/"')],
  ["canonical route renders shared component", files.route.includes("<GuidedFinder />")],
  ["component calls guided finder API", files.component.includes('fetch("/api/guided-finder"')],
  ["component renders backend-provided steps", files.component.includes("state.options?.steps")],
  ["component listens for role context changes", files.component.includes("sop-role-context-change")],
  ["component includes Role Need Answer rail", files.component.includes("guided-finder-rail")],
  ["api returns backend-built steps", files.api.includes("buildGuidedSteps") && files.api.includes("steps,")],
  ["api uses Workers AI Llama 3.1", files.api.includes("@cf/meta/llama-3.1-8b-instruct-fast")],
  ["api verifies AI ranked IDs against candidate set", files.api.includes("candidateSet.has")],
  ["api queries public published SOPs", files.api.includes("publicOnly: true")],
  ["api logs no-result searches without blocking", files.api.includes("logGuidedFinderNoResult")],
];

const failed = checks.filter(([, passed]) => !passed);

if (failed.length) {
  console.error("Guided Finder smoke checks failed:");
  failed.forEach(([label]) => console.error(`- ${label}`));
  process.exit(1);
}

console.log(`Guided Finder smoke checks passed (${checks.length}/${checks.length}).`);
