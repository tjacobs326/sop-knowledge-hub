import type { SopDraft } from "../types";

export const mockDrafts: SopDraft[] = [
  {
    id: "draft-ticket-resolution-notes",
    title: "Document Ivanti Resolution Notes",
    purpose:
      "Defines the minimum information required when closing an Ivanti ticket after resolution.",
    owner: "Instructional Technology",
    category: "Ivanti / Ticketing System",
    type: "Process",
    tools: ["Ivanti"],
    audience: ["Faculty Support", "Instructional Technology"],
    tags: ["ticketing", "resolution", "documentation"],
    estimatedCompletionTime: "4 minutes",
    beforeYouBegin: "Confirm the issue has been resolved and the user has been notified.",
    procedureSteps: [
      {
        title: "Open the resolved ticket",
        instructions: "Open the Ivanti ticket and confirm the latest activity is visible.",
      },
      {
        title: "Summarize the resolution",
        instructions:
          "Add the root cause, action taken, affected course or user, and any follow-up notes.",
      },
    ],
    troubleshootingNotes:
      "If the resolution is temporary, assign the ticket to the responsible owner instead of closing it.",
    relatedSops: ["Submit a New Ivanti Ticket", "Check Ivanti Ticket Status"],
    reviewDate: "2026-07-15",
    status: "In Review",
    version: "0.2",
    changeSummary: "Expanded the resolution note requirements.",
    createdDate: "2026-06-11",
    updatedDate: "2026-06-17",
  },
];
