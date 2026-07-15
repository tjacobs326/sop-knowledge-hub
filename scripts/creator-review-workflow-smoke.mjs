import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const myWork = readFileSync(resolve(root, "src/pages/my-work/index.astro"), "utf8");
const drafts = readFileSync(resolve(root, "src/pages/drafts/index.astro"), "utf8");
const header = readFileSync(resolve(root, "src/components/Header.astro"), "utf8");
const breadcrumbs = readFileSync(resolve(root, "src/components/Breadcrumbs.astro"), "utf8");
const reviewQueuePage = readFileSync(resolve(root, "src/pages/review-queue/index.astro"), "utf8");
const adminReviewPage = readFileSync(resolve(root, "src/pages/admin/review.astro"), "utf8");
const reviewQueue = readFileSync(resolve(root, "src/components/ReviewQueue.astro"), "utf8");
const reviewApi = readFileSync(resolve(root, "functions/api/review-queue.ts"), "utf8");
const myWorkApi = readFileSync(resolve(root, "functions/api/my-work.ts"), "utf8");
const styles = readFileSync(resolve(root, "src/styles/global.css"), "utf8");

const failures = [];

for (const fragment of [
  "scopedReviewUrl",
  "submittedRequestUrl(item)",
  "my-work-submitted-requests",
  "my-work-reviews-needed",
  "my-work-overdue-reviews",
  "reviewUrl(item",
]) {
  if (!myWork.includes(fragment)) failures.push(`My Work review routing is missing: ${fragment}`);
}

for (const fragment of ['{ href: "/review-queue/", label: "Review Queue"', '"review-queue": "Review Queue"']) {
  const source = fragment.includes("href") ? header : breadcrumbs;
  if (!source.includes(fragment)) failures.push(`Creator/Reviewer navigation mapping is missing: ${fragment}`);
}

if (!drafts.includes('href="/review-queue/"')) failures.push("My Drafts still links Creator/Reviewer users to an admin review route.");
if (!reviewQueuePage.includes('mode="creator-reviewer"')) failures.push("Creator/Reviewer Review Queue page is not using creator mode.");
if (!adminReviewPage.includes("<ReviewQueue />")) failures.push("Admin review page no longer uses the admin/default review queue.");

for (const fragment of [
  'mode?: "admin" | "queue" | "creator-reviewer" | "needs-review"',
  'isCreatorReviewMode',
  'Review Submitted Request',
  'my-work-submitted-requests',
  'My Submitted Requests',
  'Review SOP',
  'my-work-reviews-needed',
  'my-work-overdue-reviews',
  'detailHref(item)',
  'scopedOriginHref()',
  'review-item-navigation',
  'review-actions__utility',
  'review-actions__workflow',
  'aria-label="Publishing actions"',
  'review-actions__group-label',
  'review-actions__decisions',
  'requestedReviewId',
  'item.id === reviewId',
  '["assign", "convert", "archive"].includes(action)',
]) {
  if (!reviewQueue.includes(fragment)) failures.push(`Creator/Reviewer review component behavior is missing: ${fragment}`);
}

for (const fragment of ["reviewQueueNavTarget", 'origin.startsWith("my-work-") ? "/my-work/" : "/review-queue/"']) {
  if (!header.includes(fragment)) failures.push(`Origin-aware Review Queue navigation is missing: ${fragment}`);
}

for (const fragment of [
  "routeReviewId",
  "Unsupported review identifier",
  "requestedReviewId",
  "item.id === requestedReviewId",
]) {
  if (!reviewApi.includes(fragment)) failures.push(`Review queue API review-id filtering is missing: ${fragment}`);
}

for (const fragment of [
  "`request:${id}`",
  "origin=my-work-submitted-requests",
  "/review-queue/?review=",
]) {
  if (!myWorkApi.includes(fragment)) failures.push(`My Work API submitted-request routing is missing: ${fragment}`);
}

if (myWorkApi.includes("url: `/admin/review/?request=")) {
  failures.push("My Work API still exposes the admin review URL for submitted requests.");
}

if (!myWork.includes("scopedReviewUrl") || !myWork.includes('params.set("scope"') || !myWork.includes('params.set("subRole"')) {
  failures.push("My Work review links do not preserve the selected scope and Creator/Reviewer sub-role.");
}
if (reviewQueue.includes('? `<a class="button button--ghost" href="${escapeHtml(safeOrigins[requestedOrigin()].href)}">Back to')) {
  failures.push("Back navigation is still mixed into the review decision action row.");
}
if (reviewQueue.indexOf("${backNavigation()}") > reviewQueue.indexOf('<article class="review-card"')) {
  failures.push("Back navigation must render before the review item card.");
}
for (const fragment of [".review-back-link", ".review-actions__bar", ".review-actions__workflow", ".review-actions__group", ".review-actions__decisions", "@media (max-width: 720px)"]) {
  if (!styles.includes(fragment)) failures.push(`Responsive review action styling is missing: ${fragment}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Creator/Reviewer review workflow smoke check passed.");
