import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const files = {
  form: readFileSync(join(root, "src/components/RequestForm.astro"), "utf8"),
  requestsApi: readFileSync(join(root, "functions/api/sop-requests.ts"), "utf8"),
  requestDetailApi: readFileSync(join(root, "functions/api/sop-requests/[id].ts"), "utf8"),
  reviewQueueApi: readFileSync(join(root, "functions/api/review-queue.ts"), "utf8"),
  reviewQueue: readFileSync(join(root, "src/components/ReviewQueue.astro"), "utf8"),
  migration: readFileSync(join(root, "migrations/0019_sop_request_process_steps.sql"), "utf8"),
};

const checks = [
  ["form label", files.form.includes("Process steps or expected workflow")],
  ["form payload", files.form.includes("processSteps: submission.procedureSteps")],
  ["migration column", files.migration.includes("process_steps TEXT")],
  ["request API select", files.requestsApi.includes("sop_requests.process_steps AS processSteps")],
  ["request API insert", files.requestsApi.includes("draft_content, process_steps, related_links")],
  ["request detail API select", files.requestDetailApi.includes("sop_requests.process_steps AS processSteps")],
  ["review queue API select", files.reviewQueueApi.includes("sop_requests.process_steps AS processSteps")],
  ["review queue normalizes field", files.reviewQueueApi.includes("processSteps: row.processSteps")],
  ["review queue displays field", files.reviewQueue.includes("review-card__workflow")],
  ["conversion carries field", files.reviewQueueApi.includes("Requester-provided workflow outline") && files.requestsApi.includes("Requester-provided workflow outline")],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error("Request process steps smoke check failed:");
  for (const [name] of failed) console.error(`- ${name}`);
  process.exit(1);
}

console.log("Request process steps smoke check passed.");
