import { readFileSync } from "node:fs";

const files = {
  component: readFileSync("src/components/GuidedFinder.astro", "utf8"),
  api: readFileSync("functions/api/guided-finder.ts", "utf8"),
  styles: readFileSync("src/styles/global.css", "utf8"),
  header: readFileSync("src/components/Header.astro", "utf8"),
  home: readFileSync("src/pages/index.astro", "utf8"),
  route: readFileSync("src/pages/guided-finder.astro", "utf8"),
};

const startGuidedFlowBody = files.component.match(/function startGuidedFlow\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";

const checks = [
  ["header uses canonical route", files.header.includes('href: "/guided-finder/"')],
  ["home hero uses canonical route", files.home.includes('href="/guided-finder/"')],
  ["canonical route renders shared component", files.route.includes("<GuidedFinder />")],
  ["component calls guided finder API", files.component.includes('fetch("/api/guided-finder"')],
  ["component renders backend-provided steps", files.component.includes("state.options?.steps")],
  ["component starts directly with guided questions", !files.component.includes("Start Guided Selections") && !files.component.includes("Describe the task, system, tool, or process")],
  ["component advances to the next question after selecting an answer", files.component.includes("state.stepIndex < state.steps.length - 1") && files.component.includes("state.stepIndex += 1")],
  ["component does not render a guided-step Continue button", !files.component.includes("guided-finder-next") && !files.component.includes(">Continue</button>")],
  ["component does not search before the first answer", Boolean(startGuidedFlowBody) && !startGuidedFlowBody.includes("searchGuidedFinder")],
  ["component listens for role context changes", files.component.includes("sop-role-context-change")],
  ["component omits the removed left progress rail", !files.component.includes("guided-finder-rail") && !files.component.includes("guided-workflow__rail")],
  ["api returns backend-built steps", files.api.includes("buildGuidedSteps") && files.api.includes("steps,")],
  ["api restricts Need options to approved intent labels", files.api.includes("const guidedNeedOptions") && files.api.includes("Use a system or tool") && !files.api.includes("Matches ${item.terms.size} live taxonomy terms")],
  ["api caps category options for a focused decision step", files.api.includes("CATEGORY_OPTION_LIMIT") && files.api.includes("buildCategoryOptions")],
  ["component narrows category options from current matches", files.component.includes("narrowCategoryOptions") && files.component.includes("state.lastResults")],
  ["component fallback restricts Need options to approved intent labels", files.component.includes("const guidedNeedOptions") && files.component.includes("Learn how to perform a task")],
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
