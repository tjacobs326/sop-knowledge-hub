import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const header = readFileSync(resolve(root, "src/components/Header.astro"), "utf8");
const createForm = readFileSync(resolve(root, "src/components/CreateSopForm.astro"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  header.includes("data-nav-href={item.href}") &&
    header.includes("sopEditorNavTarget") &&
    header.includes('params.has("edit") || params.has("id") ? "/drafts/" : "/create/"'),
  "Header must switch active navigation from Create SOP to My Drafts for draft edit URLs.",
);

assert(
  header.includes("document.querySelectorAll(\".main-nav a[aria-current='page']\")") &&
    header.includes('target?.setAttribute("aria-current", "page")'),
  "Header must leave exactly one active aria-current page item after applying route-aware state.",
);

assert(
  createForm.includes("currentFormMode") &&
    createForm.includes("renderEditorBreadcrumbs") &&
    createForm.includes("<li><a href=\"/drafts/\">My Drafts</a></li>") &&
    createForm.includes("<li><span aria-current=\"page\">Edit Draft</span></li>"),
  "Create SOP form must render Home / My Drafts / Edit Draft breadcrumbs in edit mode.",
);

assert(
  createForm.includes('document.title = isEdit ? "Edit Draft SOP | SOP Knowledge Hub"') &&
    createForm.includes('createHeading.textContent = isEdit ? "Edit Draft SOP" : "Create New SOP"'),
  "Create SOP form must keep edit and create headings/titles distinct.",
);

assert(
  createForm.includes('if (cancelLink) cancelLink.href = isEdit ? "/drafts/" : "/my-work/"') &&
    createForm.includes('window.location.assign("/drafts/")'),
  "Edit mode cancel and successful save must return to My Drafts.",
);

console.log("SOP editor navigation smoke checks passed.");
