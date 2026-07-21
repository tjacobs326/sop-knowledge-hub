import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const myWorkPage = readFileSync(resolve(root, "src/pages/my-work/index.astro"), "utf8");
const globalStyles = readFileSync(resolve(root, "src/styles/global.css"), "utf8");
const header = readFileSync(resolve(root, "src/components/Header.astro"), "utf8");
const myWorkApi = readFileSync(resolve(root, "functions/api/my-work.ts"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  myWorkPage.includes('href="/my-work/?workFilter=drafts#my-draft-sops"') &&
    myWorkPage.includes('data-work-filter="drafts"'),
  "My Work Draft SOPs summary card must target the My Work draft section.",
);
assert(
  myWorkPage.includes('id="my-draft-sops"') &&
    myWorkPage.includes('data-work-section="drafts"') &&
    myWorkPage.includes('id="work-section-drafts"'),
  "My Work draft section must expose a stable new anchor and preserve the legacy draft-section anchor.",
);
assert(
  header.includes('{ href: "/drafts/", label: "My Drafts"'),
  "Sidebar My Drafts navigation must continue to open the standalone My Drafts page.",
);
assert(
  !myWorkPage.includes('href="/drafts/?source=my-work"'),
  "My Work Draft SOPs summary card must not route to the standalone My Drafts page.",
);
assert(
  myWorkPage.includes('href="/my-work/?view=team-reviews-needed&scope=team&workFilter=review#work-section-review"') &&
    myWorkPage.includes('data-work-view="team-reviews-needed"'),
  "Team Reviews Needed must remain inside the scoped My Work dashboard.",
);
assert(
  myWorkPage.includes('if (params.get("view") === "team-reviews-needed") return "review"') &&
    myWorkPage.includes('context.workScope === "team" ? "Team Reviews Needed"'),
  "The filtered My Work route must restore and label the team review view.",
);
assert(
  myWorkPage.includes("routeScopeValue") && myWorkPage.includes("syncScopeToUrl") && myWorkPage.includes("updateWorkSummaryRoutes"),
  "My Work routes must preserve validated role and team scope across refresh and navigation.",
);
assert(
  !myWorkPage.includes('href="/review-queue/?filter=review-needed"'),
  "Team Reviews Needed must not route to the standalone Review Queue.",
);
assert(
  myWorkPage.includes('href="/my-work/?view=team-overdue-reviews&scope=team&workFilter=overdue#work-section-overdue"') &&
    myWorkPage.includes('data-work-view="team-overdue-reviews"'),
  "Team Overdue Reviews must remain inside the scoped My Work dashboard.",
);
assert(
  myWorkPage.includes('if (params.get("view") === "team-overdue-reviews") return "overdue"') &&
    myWorkPage.includes('context.workScope === "team" ? "Team Overdue Reviews"') &&
    myWorkPage.includes('id="clear-work-filter"'),
  "The overdue route must restore its filter, label its team section, and offer a return to the dashboard.",
);
assert(
  !myWorkPage.includes('href="/review-queue/?filter=overdue"'),
  "Team Overdue Reviews must not route to the standalone Review Queue.",
);
for (const fragment of [
  'id="my-work-top"',
  'id="my-work-heading" tabindex="-1"',
  'id="my-work-back-to-top"',
  'href="#my-work-heading"',
  'aria-label="Back to top"',
  'myWorkTop.scrollIntoView',
  'myWorkHeading.focus({ preventScroll: true })',
  'window.matchMedia("(prefers-reduced-motion: reduce)")',
]) {
  assert(myWorkPage.includes(fragment), `My Work Back to Top behavior is missing: ${fragment}`);
}
for (const fragment of [
  ".my-work-back-to-top-row",
  ".my-work-back-to-top",
  "html:has(#my-work-top)",
  "min-height: 2.75rem",
  "@media (max-width: 640px)",
  "@media (prefers-reduced-motion: reduce)",
  "scroll-behavior: auto",
]) {
  assert(globalStyles.includes(fragment), `My Work Back to Top styling is missing: ${fragment}`);
}
for (const status of ['"under review"', '"needs more information"', '"assigned"', '"in approval"', '"in review"', '"needs revision"']) {
  assert(myWorkApi.includes(status), `Overdue backend filtering is missing the open status: ${status}`);
}
assert(
  myWorkApi.includes("item.reviewDate < today") && myWorkApi.includes("overdueOpenStatuses.has"),
  "The overdue count and section must share the same backend due-date and open-status filter.",
);

console.log("My Work card navigation smoke checks passed.");
