export type EntityId = string;
export type ISODate = string;
export type ISODateTime = string;

export type RecordStatus = "Active" | "Inactive" | "Archived" | "Deprecated" | "Needs Review";

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

export type Priority = "Low" | "Medium" | "High" | "Urgent";
export type AccessLevel = "Normal User" | "Creator / Reviewer" | "Admin";
export type UserStatus = "Active" | "Suspended" | "Pending" | "Archived";
export type AttachmentType = "Image" | "Video" | "Document" | "Link" | "Other";
export type NotificationStatus = "Unread" | "Read" | "Archived";
export type FeedbackRating = "Helpful" | "Not Helpful";
export type SearchResultType = "Result" | "No Result";

export interface BaseRecord {
  id: EntityId;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Team extends BaseRecord {
  name: string;
  slug: string;
  department: string;
  description: string;
  managerUserId?: EntityId;
  defaultReviewerUserId?: EntityId;
  status: RecordStatus;
}

export interface Role extends BaseRecord {
  name: string;
  slug: string;
  accessLevel: AccessLevel;
  accessGroup: string;
  landingPage: string;
  description: string;
  permissions: string[];
  status: RecordStatus;
}

export interface User extends BaseRecord {
  name: string;
  email: string;
  department: string;
  title?: string;
  teamIds: EntityId[];
  roleIds: EntityId[];
  accessLevel: AccessLevel;
  permissions: string[];
  status: UserStatus;
  lastLoginAt?: ISODateTime;
}

export interface Category extends BaseRecord {
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  ownerTeamId?: EntityId;
  sortOrder: number;
  status: RecordStatus;
}

export interface Tag extends BaseRecord {
  name: string;
  slug: string;
  description?: string;
  usageCount: number;
  status: RecordStatus;
  notes?: string;
}

export interface ProcedureStep {
  title: string;
  instructions: string;
  note?: string;
  screenshot?: string;
  screenshotLabel?: string;
  video?: string;
  videoLabel?: string;
}

export interface SOP extends BaseRecord {
  slug: string;
  title: string;
  purpose: string;
  categoryId: EntityId;
  category: string;
  ownerUserId?: EntityId;
  owner: string;
  status: SopStatus;
  type: SopType | string;
  currentVersionId?: EntityId;
  version: string;
  tools: string[];
  audience: string[];
  tagIds: EntityId[];
  tags: string[];
  estimatedCompletionTime?: string;
  lastUpdated: ISODate;
  reviewDate: ISODate;
  publishedAt?: ISODateTime;
  archivedAt?: ISODateTime;
}

export interface SOPVersion extends BaseRecord {
  sopId: EntityId;
  version: string;
  title: string;
  purpose: string;
  beforeYouBegin?: string;
  procedureSteps: ProcedureStep[];
  screenshots: EntityId[];
  checklist: string[];
  troubleshootingNotes?: string;
  relatedSopIds: EntityId[];
  changeSummary: string;
  authorUserId?: EntityId;
  reviewerUserId?: EntityId;
  approvedByUserId?: EntityId;
  approvedAt?: ISODateTime;
  status: SopStatus;
}

export interface SOPRequest extends BaseRecord {
  source: SubmissionSource;
  submissionType: SubmissionType;
  title: string;
  department?: string;
  submittedBy: string;
  submitterUserId?: EntityId;
  submitterEmail?: string;
  submitterRole?: string;
  bestContactMethod?: string;
  categoryId?: EntityId;
  category: string;
  toolOrSystem?: string;
  audience?: string;
  businessNeed?: string;
  frequency?: string;
  priority: Priority;
  desiredCompletionDate?: ISODate;
  purpose?: string;
  beforeYouBegin?: string;
  procedureSteps?: string[];
  knownIssues?: string;
  relatedResources?: string[];
  screenshots?: string[];
  attachmentIds: EntityId[];
  additionalNotes?: string;
  status: ReviewStatus;
  assignedOwner?: string;
  assignedOwnerUserId?: EntityId;
  createdDate: ISODate;
  updatedDate: ISODate;
  reviewDate?: ISODate;
}

export interface Review extends BaseRecord {
  sopId?: EntityId;
  sopVersionId?: EntityId;
  requestId?: EntityId;
  assignedReviewerUserId?: EntityId;
  assignedReviewerName?: string;
  requestedByUserId?: EntityId;
  status: ReviewStatus;
  priority: Priority;
  submittedDate: ISODate;
  dueDate?: ISODate;
  completedAt?: ISODateTime;
  decision?: "Approved" | "Request Changes" | "Archived";
  notes?: string;
}

export interface Comment extends BaseRecord {
  body: string;
  authorUserId: EntityId;
  authorName: string;
  sopId?: EntityId;
  sopVersionId?: EntityId;
  requestId?: EntityId;
  reviewId?: EntityId;
  parentCommentId?: EntityId;
  isInternal: boolean;
  status: RecordStatus;
}

export interface Attachment extends BaseRecord {
  fileName: string;
  displayName: string;
  type: AttachmentType;
  mimeType: string;
  sizeBytes: number;
  url: string;
  uploadedByUserId?: EntityId;
  sopId?: EntityId;
  sopVersionId?: EntityId;
  requestId?: EntityId;
  stepId?: string;
  altText?: string;
  status: RecordStatus;
}

export interface Notification extends BaseRecord {
  recipientUserId: EntityId;
  title: string;
  message: string;
  href?: string;
  status: NotificationStatus;
  type: "Review Due" | "Request Update" | "Approval" | "System";
  sentAt?: ISODateTime;
  readAt?: ISODateTime;
}

export interface AuditLog extends BaseRecord {
  actorUserId?: EntityId;
  actorName: string;
  action: string;
  entityType:
    | "User"
    | "Team"
    | "Role"
    | "SOP"
    | "SOPVersion"
    | "Category"
    | "Tag"
    | "SOPRequest"
    | "Review"
    | "Comment"
    | "Attachment"
    | "Settings";
  entityId: EntityId;
  summary: string;
  ipAddress?: string;
}

export interface SearchLog extends BaseRecord {
  query: string;
  userId?: EntityId;
  resultCount: number;
  resultType: SearchResultType;
  clickedSopId?: EntityId;
  filters?: Record<string, string>;
}

export interface Feedback extends BaseRecord {
  sopId: EntityId;
  sopVersionId?: EntityId;
  userId?: EntityId;
  rating: FeedbackRating;
  comment?: string;
  source: "SOP Detail" | "Search Result" | "AI Assist";
}

export interface SopDraft {
  id: EntityId;
  title: string;
  purpose: string;
  owner: string;
  ownerUserId?: EntityId;
  category: string;
  categoryId?: EntityId;
  type: SopType | string;
  tools: string[];
  audience: string[];
  tags: string[];
  tagIds?: EntityId[];
  estimatedCompletionTime?: string;
  beforeYouBegin?: string;
  procedureSteps: ProcedureStep[];
  screenshots?: string[];
  troubleshootingNotes?: string;
  relatedSops: string[];
  relatedSopIds?: EntityId[];
  reviewDate: ISODate;
  status: SopStatus;
  version: string;
  changeSummary: string;
  createdDate: ISODate;
  updatedDate: ISODate;
  originalSubmissionId?: EntityId;
}

export type SopSubmission = SOPRequest;

export interface ReviewQueueItem {
  id: EntityId;
  source: SubmissionSource;
  submissionType: SubmissionType;
  title: string;
  department?: string;
  submittedBy: string;
  category: string;
  priority: Priority;
  status: ReviewStatus;
  assignedOwner?: string;
  createdDate: ISODate;
  reviewDate?: ISODate;
  originalId?: EntityId;
}
