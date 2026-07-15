import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const header = read("src/components/Header.astro");
const page = read("src/pages/my-work/archived/index.astro");
const view = read("src/pages/my-work/archived/view/index.astro");
const archivedApi = read("functions/api/sops/archived.ts");
const archiveApi = read("functions/api/sops/[id]/archive.ts");
const restoreApi = read("functions/api/sops/[id]/restore-as-draft.ts");
const draftsApi = read("functions/api/my-drafts.ts");
const reviewApi = read("functions/api/review-queue.ts");
const migration = read("migrations/0019_archived_sop_workflow.sql");
const backfill = read("migrations/0020_backfill_archived_sop_metadata.sql");

function requireFragments(source, fragments, label) {
  for (const fragment of fragments) if (!source.includes(fragment)) throw new Error(`${label} is missing: ${fragment}`);
}

requireFragments(header, ['href: "/my-work/archived/"', 'label: "Archived SOPs"', 'icon: "archive"'], "Creator navigation");
requireFragments(page, ["Search archived SOPs", "Department", "Category", "Owner", "Archived date", "Previous status", "Archived by", "Archive reason", "View", "Restore as Draft", "restore-archived-dialog"], "Archived SOP page");
requireFragments(view, ["Archived SOP", "This SOP is inactive and should not be used as current guidance", "Read-only archive record"], "Archived read-only view");
requireFragments(archivedApi, ["requirePermission(context, \"Archive SOPs\")", "resolveCreatorWorkScope", "subRoleSopScopeClause", "sops.status = 'Archived'", "archive_reason", "archived_by_user_id", "sops.title LIKE ?", "search_tags.name LIKE ?"], "Archived SOP API");
requireFragments(archiveApi, ["An archive reason is required", "actorDepartment", "reason"], "Archive endpoint");
requireFragments(restoreApi, ["Only archived SOPs can be restored as drafts", "status = 'Draft'", "restore_as_draft", "sop_status_history", "restored_at", "restored_by_user_id"], "Restore endpoint");
requireFragments(migration, ["archive_previous_status", "archived_by_user_id", "archive_reason", "restored_at", "restored_by_user_id"], "Archive migration");
requireFragments(backfill, ["sop_status_history", "Archived before archive reasons were required", "WHERE status = 'Archived'"], "Archive metadata backfill");
requireFragments(draftsApi, ["COALESCE(sops.is_active, 1) = 1", "sops.status IN ('Draft', 'Needs Revision', 'In Review', 'Approved')"], "My Drafts exclusion");
requireFragments(reviewApi, ["COALESCE(sops.is_active, 1) = 1", "sops.status IN ('In Review', 'Approved')"], "Review Queue exclusion");

console.log("Archived SOP workflow smoke checks passed.");
