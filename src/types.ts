export type SopStatus =
  | "Draft"
  | "In Review"
  | "Approved"
  | "Needs Revision"
  | "Published"
  | "Archived";

export type SopType =
  | "Process"
  | "Troubleshooting Guide"
  | "Template"
  | "Checklist"
  | "Job Aid"
  | "Decision Tree";

export type SubmissionSource =
  | "Internal SOP Creator"
  | "Outside Department Submission";

export type SubmissionType =
  | "Request a new SOP"
  | "Submit a draft SOP"
  | "Suggest an update to an existing SOP"
  | "Report an issue with an SOP"
  | "Request a template";

export type ReviewStatus =
  | "Submitted"
  | "Triage"
  | "Assigned"
  | "Drafting"
  | "In Review"
  | "Needs More Information"
  | "Needs Revision"
  | "Approved"
  | "Published"
  | "Archived";

export interface ProcedureStep {
  title: string;
  instructions: string;
  note?: string;
  screenshot?: string;
}

export interface SopSubmission {
  id: string;
  source: SubmissionSource;
  submissionType: SubmissionType;
  title: string;
  department?: string;
  submittedBy: string;
  submitterEmail?: string;
  submitterRole?: string;
  bestContactMethod?: string;
  category: string;
  toolOrSystem?: string;
  audience?: string;
  businessNeed?: string;
  frequency?: string;
  priority: "Low" | "Medium" | "High" | "Urgent";
  desiredCompletionDate?: string;
  purpose?: string;
  beforeYouBegin?: string;
  procedureSteps?: string[];
  knownIssues?: string;
  relatedResources?: string[];
  screenshots?: string[];
  additionalNotes?: string;
  status: ReviewStatus;
  assignedOwner?: string;
  createdDate: string;
  updatedDate: string;
  reviewDate?: string;
}

export interface SopDraft {
  id: string;
  title: string;
  purpose: string;
  owner: string;
  category: string;
  type: SopType | string;
  tools: string[];
  audience: string[];
  tags: string[];
  estimatedCompletionTime?: string;
  beforeYouBegin?: string;
  procedureSteps: ProcedureStep[];
  screenshots?: string[];
  troubleshootingNotes?: string;
  relatedSops: string[];
  reviewDate: string;
  status: SopStatus;
  version: string;
  changeSummary: string;
  createdDate: string;
  updatedDate: string;
  originalSubmissionId?: string;
}

export interface ReviewQueueItem {
  id: string;
  source: SubmissionSource;
  submissionType: SubmissionType;
  title: string;
  department?: string;
  submittedBy: string;
  category: string;
  priority: "Low" | "Medium" | "High" | "Urgent";
  status: ReviewStatus;
  assignedOwner?: string;
  createdDate: string;
  reviewDate?: string;
  originalId?: string;
}
