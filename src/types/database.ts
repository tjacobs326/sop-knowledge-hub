export type ISODate = string;
export type ISODateTime = string;
export type JsonText = string;

export interface DatabaseEnv {
  DB: unknown;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  department: string | null;
  title: string | null;
  team_id: string | null;
  role_id: string | null;
  access_level: "Normal User" | "Creator / Reviewer" | "Admin";
  status: "Active" | "Pending" | "Suspended" | "Archived";
  timezone: string | null;
  external_subject: string | null;
  last_login_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  permissions_json: JsonText;
  access_level: "Normal User" | "Creator / Reviewer" | "Admin" | null;
  access_group: string | null;
  landing_page: string | null;
  status: "Active" | "Inactive" | "Archived" | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface SopRow {
  id: string;
  title: string;
  slug: string;
  purpose: string;
  category_id: string | null;
  owner_user_id: string | null;
  owner_team_id: string | null;
  status: "Draft" | "In Review" | "Approved" | "Needs Revision" | "Published" | "Archived";
  type: "Process" | "Troubleshooting Guide" | "Template" | "Checklist" | "Job Aid" | "Decision Tree";
  current_version_id: string | null;
  estimated_completion_time: string | null;
  review_date: ISODate | null;
  visibility: "Internal" | "Restricted" | "Public" | null;
  source_type: "Markdown" | "Database" | "Imported" | null;
  created_by_user_id: string | null;
  approved_by_user_id: string | null;
  published_at: ISODateTime | null;
  archived_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface SopVersionRow {
  id: string;
  sop_id: string;
  version_label: string;
  title: string;
  purpose: string;
  body_markdown: string;
  metadata_json: JsonText;
  change_summary: string | null;
  status: SopRow["status"];
  created_by_user_id: string | null;
  reviewed_by_user_id: string | null;
  approved_by_user_id: string | null;
  created_at: ISODateTime;
  reviewed_at: ISODateTime | null;
  approved_at: ISODateTime | null;
}

export interface MediaAssetRow {
  id: string;
  asset_type: "Image" | "Video" | "Document" | "Avatar" | "Other";
  purpose:
    | "SOP Step"
    | "SOP Reference"
    | "Request Attachment"
    | "Comment Attachment"
    | "User Avatar"
    | "Admin Evidence"
    | "Other";
  original_file_name: string;
  display_name: string | null;
  mime_type: string;
  size_bytes: number;
  storage_provider: "r2" | "external_url" | "legacy_public";
  bucket_name: string | null;
  object_key: string;
  public_url: string | null;
  checksum_sha256: string | null;
  width_px: number | null;
  height_px: number | null;
  duration_seconds: number | null;
  alt_text: string | null;
  caption: string | null;
  uploaded_by_user_id: string | null;
  status: "Pending Scan" | "Active" | "Quarantined" | "Archived" | "Deleted";
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface RequestRow {
  id: string;
  request_type:
    | "Request a new SOP"
    | "Submit a draft SOP"
    | "Suggest an update to an existing SOP"
    | "Report an issue with an SOP"
    | "Request a template";
  title: string;
  description: string | null;
  business_need: string | null;
  department: string | null;
  category_id: string | null;
  requested_sop_id: string | null;
  submitted_by_user_id: string | null;
  submitter_name: string | null;
  submitter_email: string | null;
  assigned_to_user_id: string | null;
  priority: "Low" | "Medium" | "High" | "Urgent";
  status:
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
  desired_completion_date: ISODate | null;
  review_date: ISODate | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface AdminAnalyticsDailyRow {
  metric_date: ISODate;
  metric_name: string;
  dimension_key: string;
  dimension_value: string;
  metric_value: number;
  calculated_at: ISODateTime;
}
