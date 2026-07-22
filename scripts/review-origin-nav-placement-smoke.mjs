import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const reviewQueue = readFileSync(resolve(root, "src/components/ReviewQueue.astro"), "utf8");
const styles = readFileSync(resolve(root, "src/styles/global.css"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  reviewQueue.includes('id="review-origin-nav"') &&
    reviewQueue.includes("function renderOriginNav()") &&
    reviewQueue.includes("renderOriginNav();"),
  "Review Queue must render the source-page return link as page-level origin navigation.",
);
assert(
  reviewQueue.includes('originNavEl.innerHTML') &&
    reviewQueue.includes("Back to ${escapeHtml(origin.label)}"),
  "Review Queue origin navigation must preserve the existing Back to source label.",
);
assert(
  !reviewQueue.includes('isCreatorReviewMode\n              ? `<a class="button button--ghost" href="${escapeHtml(safeOrigins[requestedOrigin()].href)}"'),
  "Back to source navigation must not remain inside each review card action row.",
);
assert(
  styles.includes(".review-origin-nav") &&
    styles.includes("justify-content: flex-start"),
  "Review Queue origin navigation must have page-level layout styling.",
);

console.log("Review origin navigation placement smoke checks passed.");
