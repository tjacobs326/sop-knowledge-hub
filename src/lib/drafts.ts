import type { ReviewQueueItem, SopDraft } from "../types";

export const DRAFTS_STORAGE_KEY = "sopHubDrafts";

export function createDraftReviewItem(draft: SopDraft): ReviewQueueItem {
  return {
    id: `review-${draft.id}`,
    source: "Internal SOP Creator",
    submissionType: "Submit a draft SOP",
    title: draft.title,
    department: draft.audience[0],
    submittedBy: draft.owner,
    category: draft.category,
    priority: "Medium",
    status: draft.status === "Published" ? "Published" : "In Review",
    assignedOwner: draft.owner,
    createdDate: draft.createdDate,
    reviewDate: draft.reviewDate,
    originalId: draft.id,
  };
}
