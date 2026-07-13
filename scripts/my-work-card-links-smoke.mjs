import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const myWork = readFileSync(resolve(root, "src/pages/my-work/index.astro"), "utf8");
const drafts = readFileSync(resolve(root, "src/pages/drafts/index.astro"), "utf8");
const reviewQueue = readFileSync(resolve(root, "src/components/ReviewQueue.astro"), "utf8");
const reviewApi = readFileSync(resolve(root, "functions/api/review-queue.ts"), "utf8");
const styles = readFileSync(resolve(root, "src/styles/global.css"), "utf8");

const expectedLinks = [
  ['data-work-filter="submitted"', 'href="/my-work/?workFilter=submitted#work-section-submitted"'],
  ['data-work-filter="drafts"', 'href="/drafts/?source=my-work"'],
  ['data-work-filter="assigned"', 'href="/my-work/?workFilter=assigned#work-section-assigned"'],
  ['data-work-filter="review"', 'href="/admin/review/?filter=review-needed"'],
  ['data-work-filter="overdue"', 'href="/admin/review/?filter=overdue"'],
];

const failures = [];

for (const [filter, href] of expectedLinks) {
  if (!myWork.includes(filter) || !myWork.includes(href)) {
    failures.push(`Missing My Work summary link mapping: ${filter} -> ${href}`);
  }
}

for (const section of [
  'data-work-section="submitted"',
  'data-work-section="drafts"',
  'data-work-section="assigned"',
  'data-work-section="review"',
  'data-work-section="overdue"',
]) {
  if (!myWork.includes(section)) failures.push(`Missing target work section: ${section}`);
}

for (const fragment of ["WORK_SCOPE_KEY", "preserveWorkScope", "requestedWorkFilter", "focusRequestedWorkSection"]) {
  if (!myWork.includes(fragment)) failures.push(`Missing My Work route/scope helper: ${fragment}`);
}

for (const fragment of ["WORK_SCOPE_KEY", "sessionStorage.getItem(WORK_SCOPE_KEY)", 'params.set("scope"', 'params.set("userId"']) {
  if (!drafts.includes(fragment)) failures.push(`Missing My Drafts scope handoff: ${fragment}`);
}

for (const fragment of ["urlFilterMap", "summary:overdue", "requestedQueueFilter"]) {
  if (!reviewQueue.includes(fragment)) failures.push(`Missing Review Queue URL filter support: ${fragment}`);
}

for (const fragment of ["routeFilters", "filterQueueItems", "Unsupported review queue filter"]) {
  if (!reviewApi.includes(fragment)) failures.push(`Missing review API filter validation: ${fragment}`);
}

for (const fragment of [
  ".user-summary .work-summary-card:hover",
  ".user-summary .work-summary-card:focus-visible",
  ".work-section:focus",
  "grid-template-columns: repeat(auto-fit, minmax(min(100%, 13.5rem), 1fr))",
  "font-size: clamp(1.75rem, 3vw, 2.25rem)",
  "word-break: normal",
  "@media (max-width: 520px)",
]) {
  if (!styles.includes(fragment)) failures.push(`Missing accessible card styling: ${fragment}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("My Work dashboard card links smoke check passed.");
