import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const createForm = readFileSync(resolve(root, "src/components/CreateSopForm.astro"), "utf8");
const myWorkPage = readFileSync(resolve(root, "src/pages/my-work/index.astro"), "utf8");
const myWorkApi = readFileSync(resolve(root, "functions/api/my-work.ts"), "utf8");
const myDraftsApi = readFileSync(resolve(root, "functions/api/my-drafts.ts"), "utf8");
const reviewQueue = readFileSync(resolve(root, "src/components/ReviewQueue.astro"), "utf8");
const header = readFileSync(resolve(root, "src/components/Header.astro"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  myWorkApi.includes('withEditReturn(sop.editUrl, "owned-sops", "/my-work/?workFilter=owned#work-section-owned")') &&
    myWorkPage.includes('returnTo=${encodeURIComponent("/my-work/?workFilter=owned#work-section-owned")}'),
  "SOPs I Own must pass an explicit persistent return destination to the editor.",
);

assert(
  myWorkPage.includes('owned: "SOPs I Own"') &&
    myWorkPage.includes('const focusTarget = heading instanceof HTMLElement ? heading : section') &&
    myWorkPage.includes('focusTarget.focus({ preventScroll: true })'),
  "My Work must recognize the owned section and focus its heading after returning.",
);

assert(
  myDraftsApi.includes('origin=my-drafts&returnTo=${encodeURIComponent("/drafts/")}'),
  "My Drafts edit links must return to My Drafts.",
);

assert(
  reviewQueue.includes('const origin = isNeedsReviewMode ? "needs-review" : "review-queue"') &&
    reviewQueue.includes('const returnTo = isNeedsReviewMode ? "/admin/needs-review/" : "/review-queue/"') &&
    reviewQueue.includes('url.searchParams.set("returnTo", returnTo)') &&
    reviewQueue.includes('url.origin !== window.location.origin || url.pathname !== "/create/"'),
  "Review Queue and Needs Review must supply safe, entry-point-specific editor returns.",
);

for (const fragment of [
  '"owned-sops"',
  '"my-drafts"',
  '"review-queue"',
  '"needs-review"',
  'cancelHref: "/my-work/?workFilter=owned#work-section-owned"',
  'cancelHref: "/drafts/"',
  'cancelHref: "/review-queue/"',
  'cancelHref: "/admin/needs-review/"',
  'function normalizeInternalReturn(value)',
  'value.startsWith("//")',
  'url.origin !== window.location.origin',
  'return requested === fallback ? requested : fallback',
  'cancelLink.href = isEdit ? returnHref("cancel") : "/my-work/"',
]) {
  assert(createForm.includes(fragment), `Editor return handling is missing: ${fragment}`);
}

assert(
  createForm.includes('<li><a href="/my-work/?workFilter=owned#work-section-owned">My Work</a></li>') &&
    createForm.includes('<li><a href="/my-work/?workFilter=owned#work-section-owned">SOPs I Own</a></li>') &&
    createForm.includes('<li><span aria-current="page">Edit SOP</span></li>'),
  "Owned SOP editor breadcrumbs must stay in the My Work workflow.",
);

assert(
  !createForm.includes("window.history.back") && !createForm.includes("history.go("),
  "Cancel must use the persistent validated destination rather than browser history.",
);

assert(
  header.includes('if (origin === "review-queue") return "/review-queue/"') &&
    header.includes('if (origin === "needs-review") return "/admin/needs-review/"') &&
    header.includes('return "/drafts/"'),
  "Editor active navigation must match each safe origin and use My Drafts as the direct-entry fallback.",
);

console.log("Editor return routing smoke checks passed.");
