import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const myWorkPage = readFileSync(resolve(root, "src/pages/my-work/index.astro"), "utf8");
const myWorkApi = readFileSync(resolve(root, "functions/api/my-work.ts"), "utf8");
const createForm = readFileSync(resolve(root, "src/components/CreateSopForm.astro"), "utf8");
const header = readFileSync(resolve(root, "src/components/Header.astro"), "utf8");
const sopEndpoint = readFileSync(resolve(root, "functions/api/sops/[id].ts"), "utf8");

const failures = [];

for (const fragment of [
  '/create/?edit=draft&id=${encodeURIComponent(item.id)}&origin=owned-sops',
  'returnTo=${encodeURIComponent("/my-work/?workFilter=owned#work-section-owned")}',
  'item.editUrl ||',
  'owned: "SOPs I Own"',
  "focusTarget.focus({ preventScroll: true })",
]) {
  if (!myWorkPage.includes(fragment)) failures.push(`My Work owned edit route is missing: ${fragment}`);
}

for (const fragment of [
  "withEditReturn",
  '"owned-sops"',
  'editUrl: withEditReturn(sop.editUrl, "owned-sops", "/my-work/?workFilter=owned#work-section-owned")',
]) {
  if (!myWorkApi.includes(fragment)) failures.push(`My Work API owned origin is missing: ${fragment}`);
}

for (const fragment of [
  '"owned-sops"',
  "SOPs I Own",
  "/my-work/?workFilter=owned#work-section-owned",
  "returnHref",
  "validatedReturnHref",
  "normalizeInternalReturn",
  "directOwnedOrigin",
  "hasExplicitEditorOrigin",
]) {
  if (!createForm.includes(fragment)) failures.push(`Create SOP editor owned-origin handling is missing: ${fragment}`);
}

for (const fragment of ['if (origin === "owned-sops" || origin === "my-work-drafts") return "/my-work/"']) {
  if (!header.includes(fragment)) failures.push(`Header active-nav owned-origin handling is missing: ${fragment}`);
}

for (const fragment of [
  '!publicOnly && String(sop.status || "") !== "Published"',
  'requirePermission(context, "Edit Drafts")',
  "requireSopOwnership",
  "WORKFLOW_CONFLICT",
]) {
  if (!sopEndpoint.includes(fragment)) failures.push(`SOP edit GET authorization is missing: ${fragment}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Owned SOP edit routing smoke check passed.");
