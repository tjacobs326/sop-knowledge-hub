import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const reviewQueueApi = readFileSync(resolve(root, "functions/api/review-queue.ts"), "utf8");
const reviewQueue = readFileSync(resolve(root, "src/components/ReviewQueue.astro"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  reviewQueueApi.includes('type ReviewQueueMode = "personal" | "team" | "admin"'),
  "Review Queue API must model personal, team, and admin queues as separate modes.",
);
assert(
  !reviewQueueApi.includes("users[0] ||") && !reviewQueueApi.includes("|| users[0]"),
  "Review Queue API must not silently fall back to the first user in the scoped user list.",
);
assert(
  reviewQueueApi.includes('const selectedUserId = wantsAdmin ? "admin" : requestedUserId || activeUser?.id || "team"'),
  "Review Queue API must default to the active user first, then explicit team queue when no active user matches.",
);
assert(
  reviewQueueApi.includes('mode === "personal"') &&
    reviewQueueApi.includes('"sop_requests.assigned_to = ?"') &&
    reviewQueueApi.includes('"assignments.user_id = ?"'),
  "Personal Review Queue mode must use direct request and SOP assignment filters.",
);
assert(
  reviewQueueApi.includes('mode === "team"') &&
    reviewQueueApi.includes("sop_requests.owner_sub_role_id = ?") &&
    reviewQueueApi.includes("sops.owner_sub_role_id = ?"),
  "Team Review Queue mode must use sub-role/team scope only when explicitly selected.",
);
assert(
  reviewQueueApi.includes("Personal, team, and admin queues must remain separate"),
  "Review Queue API must document that personal/team/admin counts must not be blended.",
);
assert(
  reviewQueue.includes('id="review-work-view"') &&
    reviewQueue.includes('id="review-work-scope"') &&
    reviewQueue.includes('params.set("userId", selectedReviewScope)') &&
    reviewQueue.includes('params.set("scope", "admin")'),
  "Review Queue UI must expose the selected queue and pass it to the backend.",
);
assert(
  reviewQueue.includes("renderWorkViewOptions") &&
    reviewQueue.includes('selectedReviewScope = isAdminMode ? "admin" : ""') &&
    reviewQueue.includes('selectedReviewScope = isAdminMode ? "admin" : "";'),
  "Review Queue UI must reset to the logged-in user's queue after role/sub-role changes instead of keeping a stale person.",
);

console.log("Review Queue scope mode smoke checks passed.");
