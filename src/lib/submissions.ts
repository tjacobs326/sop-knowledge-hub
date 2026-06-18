import type { ReviewQueueItem, SopDraft, SopSubmission } from "../types";

export const SUBMISSIONS_STORAGE_KEY = "sopHubSubmissions";
export const REVIEW_QUEUE_STORAGE_KEY = "sopHubReviewQueue";

export function createSubmissionReviewItem(submission: SopSubmission): ReviewQueueItem {
  return {
    id: `review-${submission.id}`,
    source: submission.source,
    submissionType: submission.submissionType,
    title: submission.title,
    department: submission.department,
    submittedBy: submission.submittedBy,
    category: submission.category,
    priority: submission.priority,
    status: submission.status,
    assignedOwner: submission.assignedOwner,
    createdDate: submission.createdDate,
    reviewDate: submission.reviewDate,
    originalId: submission.id,
  };
}

export function submissionToDraft(submission: SopSubmission): SopDraft {
  const now = new Date().toISOString().slice(0, 10);

  return {
    id: `draft-from-${submission.id}`,
    title: submission.title,
    purpose: submission.businessNeed || submission.purpose || "Purpose to be refined by the SOP owner.",
    owner: submission.assignedOwner || "Unassigned SOP Owner",
    category: submission.category,
    type: submission.submissionType === "Request a template" ? "Template" : "Process",
    tools: submission.toolOrSystem ? [submission.toolOrSystem] : [],
    audience: [submission.department, submission.audience].filter(Boolean) as string[],
    tags: [submission.category, submission.priority, submission.submissionType]
      .filter(Boolean)
      .map((value) => value.toLowerCase()),
    estimatedCompletionTime: "To be estimated",
    beforeYouBegin: submission.beforeYouBegin,
    procedureSteps:
      submission.procedureSteps?.map((step, index) => ({
        title: `Step ${index + 1}`,
        instructions: step,
      })) ?? [],
    troubleshootingNotes: submission.knownIssues,
    relatedSops: submission.relatedResources ?? [],
    reviewDate: submission.reviewDate || now,
    status: "Draft",
    version: "0.1",
    changeSummary: "Converted from outside department submission.",
    createdDate: now,
    updatedDate: now,
    originalSubmissionId: submission.id,
  };
}
