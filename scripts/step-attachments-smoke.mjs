import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const createForm = readFileSync(resolve(root, "src/components/CreateSopForm.astro"), "utf8");
const mediaApi = readFileSync(resolve(root, "functions/api/media.ts"), "utf8");
const sopsApi = readFileSync(resolve(root, "functions/api/sops.ts"), "utf8");
const sopUpdateApi = readFileSync(resolve(root, "functions/api/sops/[id].ts"), "utf8");
const sopSteps = readFileSync(resolve(root, "functions/_shared/sop-steps.ts"), "utf8");
const sopData = readFileSync(resolve(root, "functions/_shared/sop-data.ts"), "utf8");
const publishedPage = readFileSync(resolve(root, "src/pages/published/index.astro"), "utf8");
const publishedLayout = readFileSync(resolve(root, "src/layouts/SopLayout.astro"), "utf8");
const styles = readFileSync(resolve(root, "src/styles/global.css"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  createForm.includes("data-step-media-input") &&
    createForm.includes("data-step-attachment-list") &&
    createForm.includes("data-replace-attachment") &&
    createForm.includes("data-move-attachment") &&
    createForm.includes("data-attachment-alt") &&
    createForm.includes("data-attachment-caption") &&
    createForm.includes("data-attachment-accessibility") &&
    createForm.includes("data-save-accessibility") &&
    createForm.includes("data-cancel-accessibility"),
  "Create SOP steps must expose upload, preview, replace, reorder, accessibility choice, alt text, caption, and remove controls.",
);
assert(
  createForm.includes('STEP_MEDIA_ACCEPT = "image/png,image/jpeg,image/webp,video/mp4"') &&
    createForm.includes("MAX_STEP_MEDIA_BYTES = 50 * 1024 * 1024") &&
    createForm.includes("MAX_ALT_TEXT_LENGTH = 125") &&
    createForm.includes("uploadStepFiles") &&
    createForm.includes("procedureSteps: draft.procedureSteps"),
  "Create SOP must validate accepted file types/sizes, enforce 125-character alt text, upload to media API, and submit attachments with procedure steps.",
);
assert(
  createForm.includes("choose Requires alternative text or Decorative") &&
    createForm.includes("attachment.accessibilityStatus === \"meaningful\" && !attachment.altText") &&
    createForm.includes("Describe the purpose or meaningful content"),
  "Create SOP must block incomplete attachment accessibility choices and guide meaningful alt text entry.",
);
assert(
  mediaApi.includes('new Set(["image/png", "image/jpeg", "image/webp", "video/mp4"])') &&
    mediaApi.includes('new Set(["png", "jpg", "jpeg", "webp", "mp4"])') &&
    mediaApi.includes("MAX_UPLOAD_BYTES = 50 * 1024 * 1024") &&
    mediaApi.includes("MAX_ALT_TEXT_LENGTH = 125") &&
    mediaApi.includes("is_decorative") &&
    mediaApi.includes("env.SOP_MEDIA.put") &&
    mediaApi.includes("sanitizeFileName") &&
    mediaApi.includes("fileSize: file.size"),
  "Media API must validate PNG/JPG/JPEG/WebP/MP4, size-limit files, cap alt text, store decorative state, sanitize filenames, return file-size metadata, and store binaries in R2.",
);
assert(
  mediaApi.includes('requirePermission({ request, env }, "Upload Media")') &&
    mediaApi.includes("requireSopOwnership") &&
    mediaApi.includes("onRequestDelete") &&
    mediaApi.includes("You do not have permission to view this media asset."),
  "Media API must enforce upload, view, and delete permissions.",
);
assert(
  sopsApi.includes("syncProcedureSteps") &&
    sopUpdateApi.includes("syncProcedureSteps") &&
    sopSteps.includes("procedure_steps") &&
    sopSteps.includes("procedure_step_media") &&
    sopSteps.includes("validateProcedureStepAttachments") &&
    sopSteps.includes("is_decorative") &&
    sopSteps.includes("media.size_bytes AS fileSize") &&
    sopSteps.includes("fileSize: Number(row.fileSize || 0)") &&
    sopSteps.includes("sop_version_media") &&
    sopSteps.includes("sop_media"),
  "SOP create/update must validate and persist procedure step accessibility, step-media relationships, and file-size metadata in D1.",
);
assert(
  sopData.includes("listProcedureSteps") &&
    publishedPage.includes("renderPublishedAttachment") &&
    publishedPage.includes("isLegacyDataAttachment") &&
    publishedPage.includes("Attached image") &&
    publishedPage.includes("loading=\"lazy\"") &&
    publishedPage.includes("preload=\"metadata\"") &&
    publishedLayout.includes("renderPublishedAttachment") &&
    publishedLayout.includes("isLegacyDataAttachment") &&
    publishedLayout.includes("Attached file") &&
    publishedLayout.includes("loading=\"lazy\"") &&
    publishedLayout.includes("preload=\"metadata\"") &&
    styles.includes(".attachment-card") &&
    styles.includes("overflow-wrap: anywhere"),
  "SOP reads and published rendering must return and display step attachments accessibly, hide legacy Base64 data URLs behind friendly labels, and wrap long filenames.",
);

console.log("Step attachment smoke checks passed.");
