import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const myWorkPage = readFileSync(resolve(root, "src/pages/my-work/index.astro"), "utf8");
const myDraftsPage = readFileSync(resolve(root, "src/pages/drafts/index.astro"), "utf8");
const reviewQueue = readFileSync(resolve(root, "src/components/ReviewQueue.astro"), "utf8");
const createForm = readFileSync(resolve(root, "src/components/CreateSopForm.astro"), "utf8");
const draftPreview = readFileSync(resolve(root, "src/components/SopDraftPreview.astro"), "utf8");
const myDraftsApi = readFileSync(resolve(root, "functions/api/my-drafts.ts"), "utf8");
const draftPreviewPage = readFileSync(resolve(root, "src/pages/drafts/preview.astro"), "utf8");
const reviewQueueApi = readFileSync(resolve(root, "functions/api/review-queue.ts"), "utf8");
const sopDetailApi = readFileSync(resolve(root, "functions/api/sops/[id].ts"), "utf8");
const sopWorkflow = readFileSync(resolve(root, "functions/_shared/sop-workflow.ts"), "utf8");
const publishApi = readFileSync(resolve(root, "functions/api/sops/[id]/publish.ts"), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  myWorkPage.includes("/create/?edit=draft&id=${encodeURIComponent(item.id)}"),
  "My Work draft rows must route Edit Draft with the selected draft id.",
);
assert(
  myDraftsPage.includes('actionLink("Edit Draft", draft.editUrl)'),
  "My Drafts rows must use the backend-provided draft edit URL.",
);
assert(
  myDraftsApi.includes("editUrl: `/create/?edit=draft&id=${encodeURIComponent(id)}&origin=my-drafts`"),
  "My Drafts API must return edit URLs that include the draft id.",
);
assert(
  myDraftsApi.includes("previewUrl: `/drafts/preview/?id=${encodeURIComponent(id)}&origin=my-drafts`") &&
    myDraftsPage.includes('actionLink("Preview", draft.previewUrl') &&
    !myDraftsPage.includes('actionLink("Preview", draft.detailUrl'),
  "My Drafts Preview must use the authenticated draft preview route, not the public SOP detail route.",
);
assert(
  draftPreviewPage.includes("Preview Draft SOP") &&
    draftPreviewPage.includes("Back to My Drafts") &&
    draftPreviewPage.includes("fetch(`/api/sops/${encodeURIComponent(sopId)}`") &&
    draftPreviewPage.includes('"x-sop-sub-role": subRole') &&
    draftPreviewPage.includes("loadCapabilities") &&
    draftPreviewPage.includes('id="draft-status" class="status-badge status-badge--draft">Loading</span>') &&
    !draftPreviewPage.includes("Back to Search"),
  "Draft preview page must load authorized unpublished SOP records and use My Drafts recovery/navigation copy.",
);
assert(
  myDraftsApi.includes("sops.current_version_id IS NOT NULL") &&
    myDraftsApi.includes("NULLIF(TRIM(sops.purpose), '') IS NOT NULL") &&
    myDraftsApi.includes("capabilities.canPreview") &&
    myDraftsApi.includes("previewableDrafts"),
  "My Drafts API must exclude unloadable records and count previewable records from backend capabilities.",
);
assert(
  reviewQueueApi.includes("editUrl: `/create/?edit=draft&id=${encodeURIComponent(id)}`") ||
    reviewQueueApi.includes("`/create/?edit=draft&id=${encodeURIComponent(String(row.draftSopId))}`"),
  "Review Queue API must return edit URLs that include the draft id.",
);
assert(
  createForm.includes("async function loadBackendEditSource(id)") &&
    createForm.includes("fetch(`/api/sops/${encodeURIComponent(id)}`") &&
    createForm.includes("const source = data.sop || data") &&
    createForm.includes("fillFormFromSource(source)"),
  "Create SOP form edit mode must fetch and load the selected backend draft.",
);
assert(
  createForm.includes("method: \"PUT\"") &&
    createForm.includes("fetch(`/api/sops/${encodeURIComponent(currentSop.id)}`"),
  "Saving an edited draft must update the existing SOP instead of creating a duplicate.",
);
assert(
  createForm.includes('createHeading.textContent = isEdit ? "Edit Draft SOP"') &&
    createForm.includes('saveDraftButton.textContent = isEdit ? "Save Changes"'),
  "Edit mode must clearly label the form as editing an existing draft.",
);
assert(
  createForm.includes('id="review-sop"') &&
    createForm.includes('data-create-action="preview"') &&
    createForm.includes(">Review</button>") &&
    !createForm.includes('data-create-action="save"') &&
    !createForm.includes('data-create-action="submit"') &&
    !createForm.includes('data-create-action="publish"'),
  "Create/Edit SOP form actions must only offer Review and Cancel before backend workflow actions.",
);
assert(
  draftPreview.includes('data-draft-action="edit"') &&
    draftPreview.includes("Back to Edit") &&
    !draftPreview.includes("Clear Form"),
  "The SOP review step must let users return to editing instead of clearing the form.",
);
assert(
  !createForm.includes('data-create-action="approve"') &&
    !createForm.includes('data-create-action="changes"') &&
    !createForm.includes('data-create-action="reject"') &&
    !createForm.includes('id="approve-sop"') &&
    !createForm.includes('id="request-changes"') &&
    !createForm.includes('id="reject-sop"'),
  "Create/Edit SOP must not render reviewer decision actions.",
);
assert(
  draftPreview.includes('id="publish-sop"') &&
    draftPreview.includes('data-draft-action="publish"') &&
    createForm.includes('permissions.has("Publish SOPs")') &&
    createForm.includes('const isApproved = String(currentSop?.status || "").toLowerCase() === "approved"') &&
    createForm.includes('workflow("publish"'),
  "Create/Edit SOP must expose Publish only on the review step through the backend publish workflow, approved status, and permission check.",
);
assert(
  myDraftsApi.includes("capabilities: {") &&
    myDraftsApi.includes('canSubmitForReview') &&
    myDraftsApi.includes('canPublish') &&
    myDraftsApi.includes("sops.status IN ('Draft', 'Needs Revision', 'In Review', 'Approved')"),
  "My Drafts API must return backend-calculated capabilities for the full draft review-to-publish workflow.",
);
assert(
  myDraftsPage.includes('data-draft-workflow="publish"') &&
    myDraftsPage.includes("Publish SOP") &&
    myDraftsPage.includes("Submit for Review") &&
    myDraftsPage.includes("Review Draft") &&
    myDraftsPage.includes("Approve SOP"),
  "My Drafts must render workflow actions from backend capabilities, including Publish SOP for approved drafts.",
);
assert(
  reviewQueue.includes('"my-drafts-review"') &&
    reviewQueue.includes("Home</a></li>") &&
    reviewQueue.includes("Review Draft"),
  "Review Draft opened from My Drafts must use the My Drafts creator/reviewer breadcrumb origin.",
);
assert(
  sopWorkflow.includes('publish: ["Approved"]') &&
    sopWorkflow.includes("SopWorkflowTransitionError") &&
    publishApi.includes("WORKFLOW_CONFLICT"),
  "The backend workflow must reject Publish unless the SOP is Approved and return a workflow conflict.",
);
assert(
  reviewQueue.includes('"revision"') &&
    reviewQueue.includes('"Request Changes"') &&
    reviewQueue.includes('"approve"') &&
    reviewQueue.includes('"Approve"') &&
    reviewQueue.includes('"publish"') &&
    reviewQueue.includes('"Publish"') &&
    reviewQueue.includes('"archive"') &&
    reviewQueue.includes('"Archive"'),
  "Review decision actions must remain available in the review queue workflow.",
);
assert(
  createForm.includes('const id = params.get("id") ||') &&
    createForm.includes('editMode !== "draft"'),
  "Create SOP form must support legacy /create/?edit=<id> links without opening a blank form.",
);
assert(
  sopDetailApi.includes('requirePermission(context, "Edit Drafts")') &&
    sopDetailApi.includes("requireSopOwnership(context, auth.user!, id)"),
  "The draft update endpoint must enforce edit permission and SOP ownership.",
);

console.log("Draft edit routing smoke checks passed.");
