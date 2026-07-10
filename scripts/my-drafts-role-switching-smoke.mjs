import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const draftsPage = readFileSync(resolve(root, "src/pages/drafts/index.astro"), "utf8");
const myDraftsApi = readFileSync(resolve(root, "functions/api/my-drafts.ts"), "utf8");
const ownership = readFileSync(resolve(root, "functions/_shared/ownership.ts"), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  draftsPage.includes('const ROLE_CONTEXT_EVENT = "sop-role-context-change"'),
  "My Drafts must listen for the shared role context event.",
);
assert(
  draftsPage.includes("window.addEventListener(ROLE_CONTEXT_EVENT"),
  "My Drafts must refresh when the current role/sub-role changes in the same tab.",
);
assert(
  draftsPage.includes("let activeDraftRequestId = 0") &&
    draftsPage.includes("requestId !== activeDraftRequestId") &&
    draftsPage.includes("requestedSubRole !== selectedSubRole()"),
  "My Drafts must ignore stale responses from prior role/sub-role loads.",
);
assert(
  draftsPage.includes("currentDrafts = []") && draftsPage.includes("canArchive = false"),
  "My Drafts must clear prior draft state before loading a new role/sub-role.",
);
assert(
  draftsPage.includes('"x-sop-sub-role": subRole') &&
    draftsPage.includes("selectedSubRoleQuery()") &&
    draftsPage.includes("subRole=${encodeURIComponent(subRole)}"),
  "My Drafts must send the active sub-role through the backend request headers and query string.",
);
assert(
  myDraftsApi.includes('requirePermission(context, "Edit Drafts")'),
  "The My Drafts API must require draft-edit permission.",
);
assert(
  myDraftsApi.includes('auth.user.role === "creator"') &&
    myDraftsApi.includes("!auth.user.subRoles.some((item) => item.id === subRole.id)"),
  "The My Drafts API must reject creator users requesting an unassigned sub-role.",
);
assert(
  myDraftsApi.includes("sops.owner_sub_role_id = ?") &&
    myDraftsApi.includes("sops.owner_team_id = ?") &&
    myDraftsApi.includes("sop_assignments team_assignments"),
  "The My Drafts API must scope draft records to the selected sub-role, team, or assignment.",
);
assert(
  ownership.includes('request.headers.get("x-sop-sub-role")') &&
    ownership.includes('url.searchParams.get("subRole")'),
  "Backend sub-role resolution must use the active sub-role request context.",
);

console.log("My Drafts role-switching smoke checks passed.");
