import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const page = readFileSync(resolve(root, "src/pages/drafts/index.astro"), "utf8");
const api = readFileSync(resolve(root, "functions/api/my-drafts.ts"), "utf8");

function has(fragment, label) {
  if (!page.includes(fragment)) throw new Error(`My Drafts action layout is missing ${label}: ${fragment}`);
}

for (const [fragment, label] of [
  ['class="drafts-table"', "the responsive table class"],
  ['class="draft-actions-cell" data-label="Actions"', "the labeled action cell"],
  ['class="draft-actions"', "the shared action grid"],
  ['"draft-actions__edit"', "Edit Draft placement"],
  ['"draft-actions__preview"', "Preview placement"],
  ['"draft-actions__submit"', "Submit for Review placement"],
  ['"draft-actions__archive"', "Archive placement"],
  ['"button--danger-outline"', "the outlined destructive style"],
  ['aria-label="Archive ${escapeHtml(draft.title)}"', "the accessible archive label"],
  ['grid-template-columns: repeat(2, minmax(6.875rem, 1fr))', "the two-column action grid"],
  ['min-height: 2.75rem', "the 44px action target"],
  ['@media (max-width: 760px)', "the mobile card breakpoint"],
  ['content: attr(data-label)', "mobile table labels"],
  ['--ask-hub-safe-area: calc(3rem + 1.5rem + 2rem)', "Ask Hub safe spacing"],
  ['body: JSON.stringify(action === "archive" ? { reason, notes: reason }', "archive reason submission"],
]) has(fragment, label);

for (const fragment of ["draft.editUrl", "draft.previewUrl", 'data-draft-id="${escapeHtml(draft.id)}"', "draft.reviewUrl"]) {
  has(fragment, "existing action routing");
}
for (const fragment of ["editUrl:", "previewUrl:", "reviewUrl:", "canSubmitForReview", "canArchive"]) {
  if (!api.includes(fragment)) throw new Error(`My Drafts API action contract is missing: ${fragment}`);
}

console.log("My Drafts action layout smoke checks passed.");
