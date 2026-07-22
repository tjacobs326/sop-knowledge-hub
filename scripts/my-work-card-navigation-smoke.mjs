import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const myWorkPage = readFileSync(resolve(root, "src/pages/my-work/index.astro"), "utf8");
const header = readFileSync(resolve(root, "src/components/Header.astro"), "utf8");

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
  myWorkPage.includes('href="/my-work/?workFilter=review#my-work-review-queue"') &&
    myWorkPage.includes('data-work-filter="review"'),
  "My Work Team reviews needed summary card must target the My Work review queue section.",
);
assert(
  myWorkPage.includes('id="my-work-review-queue"') &&
    myWorkPage.includes('data-work-section="review"') &&
    myWorkPage.includes('id="work-section-review"'),
  "My Work review section must expose a stable new anchor and preserve the legacy review-section anchor.",
);
assert(
  myWorkPage.includes('href="/my-work/?workFilter=overdue#my-work-overdue-reviews"') &&
    myWorkPage.includes('data-work-filter="overdue"'),
  "My Work Team overdue reviews summary card must target the My Work overdue review section.",
);
assert(
  myWorkPage.includes('id="my-work-overdue-reviews"') &&
    myWorkPage.includes('data-work-section="overdue"') &&
    myWorkPage.includes('id="work-section-overdue"'),
  "My Work overdue section must expose a stable new anchor and preserve the legacy overdue-section anchor.",
);
assert(
  header.includes('{ href: "/drafts/", label: "My Drafts"'),
  "Sidebar My Drafts navigation must continue to open the standalone My Drafts page.",
);
assert(
  header.includes('{ href: "/review-queue/", label: "Review Queue"'),
  "Sidebar Review Queue navigation must continue to open the standalone Review Queue page.",
);
assert(
  !myWorkPage.includes('href="/drafts/?source=my-work"'),
  "My Work Draft SOPs summary card must not route to the standalone My Drafts page.",
);
assert(
  !myWorkPage.includes('href="/review-queue/?filter=review-needed"'),
  "My Work Team reviews needed summary card must not route to the standalone Review Queue page.",
);
assert(
  !myWorkPage.includes('href="/review-queue/?filter=overdue"') &&
    !myWorkPage.includes('href="/needs-review') &&
    !myWorkPage.includes('href="/admin/needs-review'),
  "My Work Team overdue reviews summary card must not route to standalone review or needs-review pages.",
);

console.log("My Work card navigation smoke checks passed.");
