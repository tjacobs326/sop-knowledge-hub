export type AiKnowledgeAccess = "published" | "admin";

export interface AiKnowledgeSource {
  id: string;
  title: string;
  category: string;
  status: "Published" | "Approved" | "Draft" | "Triage" | "Assigned";
  sourceType: "Published SOP" | "Draft SOP" | "Request / Review Item";
  access: AiKnowledgeAccess;
  url: string;
  purpose: string;
  owner: string;
  tools: string[];
  tags: string[];
  excerpt: string;
}

export const aiKnowledgeSources: AiKnowledgeSource[] = [
  {
    id: "sop-ivanti-submit-ticket",
    title: "Submit a New Ivanti Ticket",
    category: "Ivanti / Ticketing System",
    status: "Published",
    sourceType: "Published SOP",
    access: "published",
    url: "/sops/ivanti-ticketing-system/submit-a-new-ivanti-ticket/",
    purpose:
      "Explains how to submit a new Ivanti ticket with the required details for faster routing and resolution.",
    owner: "Instructional Technology",
    tools: ["Ivanti"],
    tags: ["ticketing", "support", "ivanti", "request"],
    excerpt:
      "Gather the affected user's name, email address, course or section code, relevant dates, and screenshots. Open Ivanti, select New Ticket, choose the closest request category, enter a clear title, describe the issue, add affected course or user information, attach screenshots, set priority by impact, submit the ticket, and save the ticket number.",
  },
  {
    id: "sop-copy-d2l-course-shell",
    title: "Copy a Brightspace D2L Course Shell",
    category: "Brightspace D2L",
    status: "Published",
    sourceType: "Published SOP",
    access: "published",
    url: "/sops/brightspace-d2l/copy-a-brightspace-d2l-course-shell/",
    purpose: "Explains how to copy course content from one Brightspace D2L shell into another.",
    owner: "Learning Systems",
    tools: ["Brightspace D2L"],
    tags: ["d2l", "course copy", "shell setup"],
    excerpt:
      "Confirm the source course shell, destination shell, term, owner, and component scope. In the destination shell, open Course Admin, then Import/Export/Copy Components. Choose Copy Components from another Org Unit, select the source shell, choose components, start the copy, review the log, and spot check modules, assessments, links, and dates.",
  },
  {
    id: "sop-course-build-request",
    title: "Prepare a Course Build Request",
    category: "Course Builds",
    status: "Published",
    sourceType: "Published SOP",
    access: "published",
    url: "/sops/course-builds/prepare-a-course-build-request/",
    purpose:
      "Explains how to gather and submit the information needed before beginning a course build.",
    owner: "Course Operations",
    tools: ["Brightspace D2L", "Ivanti"],
    tags: ["course build", "intake", "request"],
    excerpt:
      "Identify the target course, launch term, program owner, source materials, and constraints. Confirm the course code, section, term, launch date, course owner, reviewer, required D2L tools, integrations, accessibility requirements, source files, and known content concerns before submitting through the approved intake channel.",
  },
  {
    id: "sop-final-course-qa",
    title: "Complete Final Course QA",
    category: "QA Processes",
    status: "Published",
    sourceType: "Published SOP",
    access: "published",
    url: "/sops/qa-processes/complete-final-course-qa/",
    purpose:
      "Explains how to complete a final quality assurance review before a course is approved for launch.",
    owner: "Quality Assurance",
    tools: ["Brightspace D2L", "QA Checklist"],
    tags: ["qa", "launch", "review", "accessibility"],
    excerpt:
      "Confirm the course build is ready, the owner has completed changes, and the QA checklist is available. Review homepage, navigation, dates, modules, links, media, documents, external tools, assessments, gradebook, rubrics, accessibility items, and screenshots. Document issues, send them to owners, recheck fixes, and approve launch only when blocking findings are resolved.",
  },
  {
    id: "sop-use-ai-to-draft-course-content",
    title: "Use AI to Draft Course Content",
    category: "AI Tools",
    status: "Published",
    sourceType: "Published SOP",
    access: "published",
    url: "/sops/ai-tools/use-ai-to-draft-course-content/",
    purpose:
      "Explains how to responsibly use approved AI tools to draft instructional content for review.",
    owner: "Learning Innovation",
    tools: ["Approved AI Tools", "Source Documents"],
    tags: ["ai", "drafting", "review", "responsible use"],
    excerpt:
      "Use only organization-approved AI tools and approved source material. Do not enter confidential, student, or sensitive data unless the tool and use case have been approved. Identify the learning outcome, audience, source material, and content format. Ask the tool to cite sources, then review for accuracy, bias, accessibility, and alignment before publishing.",
  },
  {
    id: "sop-troubleshoot-missing-d2l-content",
    title: "Troubleshoot Missing D2L Content",
    category: "Troubleshooting",
    status: "Published",
    sourceType: "Published SOP",
    access: "published",
    url: "/sops/troubleshooting/troubleshoot-missing-d2l-content/",
    purpose:
      "Explains how to investigate and resolve missing content in a Brightspace D2L course shell.",
    owner: "Learning Systems",
    tools: ["Brightspace D2L", "Ivanti"],
    tags: ["d2l", "missing content", "troubleshooting"],
    excerpt:
      "Collect the course code, content title, user role, screenshot, and expected availability date. Confirm the content exists, check visibility, dates, release conditions, group restrictions, user enrollment, and source shell differences. Test as the correct role, correct authorized settings, or submit an Ivanti ticket with screenshots and findings.",
  },
  {
    id: "sop-course-build-request-template",
    title: "Course Build Request Template",
    category: "Templates",
    status: "Published",
    sourceType: "Published SOP",
    access: "published",
    url: "/sops/templates/course-build-request-template/",
    purpose: "Provides a reusable template for submitting a complete course build request.",
    owner: "Course Operations",
    tools: ["Course Build Intake Form", "Brightspace D2L"],
    tags: ["template", "course build", "intake"],
    excerpt:
      "Use the template before opening a course build request. Include course code, course title, term, launch date, request type, course owner, reviewer, source material location, required D2L tools, accessibility notes, known issues, deadline, and priority. Mark unknown fields as pending and assign an owner.",
  },
  {
    id: "draft-ai-content-review-checklist",
    title: "AI Content Review Checklist",
    category: "AI Tools",
    status: "Draft",
    sourceType: "Draft SOP",
    access: "admin",
    url: "/drafts/",
    purpose: "Draft checklist for reviewing AI-assisted course content before approval.",
    owner: "Curriculum Design",
    tools: ["Approved AI Tools"],
    tags: ["ai", "checklist", "review", "draft"],
    excerpt:
      "Admin-only draft source. Review AI-assisted course content for factual accuracy, source alignment, tone, accessibility, learning outcome alignment, documented reviewer changes, and readiness for normal QA.",
  },
  {
    id: "request-d2l-access-troubleshooting",
    title: "Clarify D2L Access Troubleshooting Steps",
    category: "Troubleshooting",
    status: "Triage",
    sourceType: "Request / Review Item",
    access: "admin",
    url: "/admin/review/",
    purpose:
      "Request to clarify first-response troubleshooting steps for missing D2L course access.",
    owner: "Instructional Technology",
    tools: ["Brightspace D2L", "Ivanti"],
    tags: ["d2l", "access", "troubleshooting", "triage"],
    excerpt:
      "Admin-only request source. Support staff need consistent steps before escalating missing course access. Confirm learner, course code, term, enrollment status, active shell visibility, access error screenshots, and timing delays after section changes.",
  },
];
