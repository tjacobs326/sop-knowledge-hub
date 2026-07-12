import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const requestForm = readFileSync(resolve(root, "src/components/RequestForm.astro"), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  requestForm.includes('id="review-request"') &&
    requestForm.includes('type="submit">Review</button>'),
  "Submit SOP Request form must use Review as the initial primary action.",
);
assert(
  requestForm.includes('id="cancel-request"') &&
    requestForm.includes('id="cancel-request-review"'),
  "Submit SOP Request form must provide Cancel actions before and during review.",
);
assert(
  !requestForm.includes("Clear Form") && !requestForm.includes('type="reset">Clear'),
  "Submit SOP Request form must not show a Clear Form button.",
);
assert(
  requestForm.includes('id="request-review-panel"') &&
    requestForm.includes("renderReviewSummary(submission)") &&
    requestForm.includes("Nothing has been submitted yet."),
  "Submit SOP Request form must include a review step before backend submission.",
);
assert(
  requestForm.includes('form?.addEventListener("submit", (event) =>') &&
    requestForm.includes("showReviewStep(submission);"),
  "The initial Review action must validate and show the review step without submitting to the backend.",
);
assert(
  requestForm.includes('confirmSubmitButton?.addEventListener("click", async () =>') &&
    requestForm.includes("await sendSubmissionToApi(submission)"),
  "Final backend submission must happen only after the user confirms from the review step.",
);

console.log("Request review flow smoke checks passed.");
