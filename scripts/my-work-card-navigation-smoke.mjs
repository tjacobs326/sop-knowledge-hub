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
  header.includes('{ href: "/drafts/", label: "My Drafts"'),
  "Sidebar My Drafts navigation must continue to open the standalone My Drafts page.",
);
assert(
  !myWorkPage.includes('href="/drafts/?source=my-work"'),
  "My Work Draft SOPs summary card must not route to the standalone My Drafts page.",
);

console.log("My Work card navigation smoke checks passed.");
