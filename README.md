# SOP Knowledge Hub

SOP Knowledge Hub is a production-ready starting point for an internal organization-wide SOP knowledge base. It helps users search, browse, print, download/save as PDF, request, create, review, and follow SOPs.

The hub supports two intake paths. Internal SOP creators can use the Create New SOP page to draft a full SOP directly. Outside departments and general organization users can use the Submit SOP Request page to request a new SOP, submit a draft process, suggest an update, or report an issue. Both paths feed into the Review Queue, where reviewers can assign ownership, request more information, approve, publish, or archive submissions.

## Tech Stack

- Astro
- TypeScript
- Markdown content files for SOPs
- Pagefind static search index generated at build time
- Plain CSS with Vocate-inspired design tokens
- Browser-side mock storage for drafts, submissions, and review queue state
- Cloudflare Pages-ready static output in `dist`

## Local Setup

```bash
npm install
npm run dev
npm run build
npm run preview
```

`npm run build` runs `astro build` and then generates the Pagefind index in `dist/pagefind`.

## Project Structure

- `src/content/sops/` contains published SOP Markdown files.
- `src/data/categories.ts` controls category names, slugs, and descriptions.
- `src/data/guided-finder.json` controls guided finder question paths.
- `src/data/mock-submissions.ts` and `src/data/mock-drafts.ts` seed the review queue.
- `src/lib/submissions.ts` and `src/lib/drafts.ts` define the mock workflow abstraction.
- `src/components/` contains reusable UI and workflow components.
- `src/pages/` contains the public routes, admin routes, and content routes.
- `src/styles/print.css` controls print and print-to-PDF output.

## Add a New SOP

1. Create a Markdown file under the correct category folder in `src/content/sops/`.
2. Use the existing frontmatter fields from a nearby SOP as the template.
3. Set `id`, `title`, `slug`, `category`, `tools`, `audience`, `tags`, `status`, `version`, `reviewDate`, `relatedSops`, `changeHistory`, and `screenshots`.
4. Write the body with these sections where relevant: Before You Begin, Procedure, Troubleshooting / Notes.
5. Add screenshot assets to `public/images/screenshots/` and reference them with root-relative paths.
6. Run `npm run build` to validate the content schema and regenerate search.

## Update Categories

Edit `src/data/categories.ts`. Use stable slugs because category URLs are generated from those values. The starting categories are:

- Ivanti / Ticketing System
- Brightspace D2L
- Course Builds
- QA Processes
- AI Tools
- Troubleshooting
- Templates

## Update Guided Finder Questions

Edit `src/data/guided-finder.json`.

Each node has a `question` and a list of `answers`. An answer can either point to another node with `next` or return SOP recommendations with `results`.

```json
{
  "label": "Submit a new ticket",
  "results": ["sop-ivanti-submit-ticket"]
}
```

Use SOP `id` values in `results`.

## Search

The `/search` page supports title, purpose, category, tags, tools, owner, audience, related SOPs, and body text. Filters are available for category, tool, owner, status, and tag.

The build also generates a Pagefind index from SOP detail pages. This keeps the deployed site ready for Pagefind-powered search expansion without requiring server infrastructure.

## Create New SOP

Internal SOP creators, owners, and admins use `/create` to draft complete SOPs. The form includes metadata, procedure steps, screenshots, troubleshooting notes, related SOPs, review date, status, and a live preview.

For this first working version:

- Save Draft stores the draft in browser local storage.
- Submit for Review also adds the draft to the mock review queue.
- Clear Form resets the current draft.

Future backend options can replace the browser storage layer in `src/lib/drafts.ts`.

## Submit SOP Request

Outside departments and general organization users use `/submit` to request new SOPs, suggest updates, submit draft processes, report issues, or request templates.

Required fields include submission type, department name, submitted by, submitter email, requested SOP title, category, audience, business need, and priority.

For this first working version, valid submissions are stored in browser local storage and added to the mock review queue.

## Review Submissions

The review queue is at `/admin/review`.

Reviewers can filter by source, request type, urgent priority, and workflow status. Review cards support:

- Assign Owner
- Request More Information
- Move to Drafting
- Mark In Review
- Request Revision
- Approve
- Publish
- Archive
- Convert to SOP Draft for outside department submissions

The conversion maps department submission details into a draft SOP object for future editing and publishing.

## Approval Workflow

The workflow model supports:

- Submitted
- Triage
- Assigned
- Drafting
- In Review
- Needs More Information
- Needs Revision
- Approved
- Published
- Archived

Roles represented in the model are Submitter, SOP Owner, Reviewer, and Publisher/Admin.

## Permissions and Cloudflare Access

Real authentication is intentionally not implemented yet.

For production, protect the full site with Cloudflare Access / Zero Trust so only organization users can reach it. Then restrict:

- `/create`
- `/admin`
- `/admin/review`

Those routes should be limited to approved SOP creators, reviewers, publishers, and admins through Cloudflare Access groups or application policies.

## Cloudflare Pages Deployment

Recommended production path: use Cloudflare Pages with Git integration. Cloudflare's Astro guide uses `npm run build` as the build command and `dist` as the build directory for Pages deployments.

Use these settings in Cloudflare Pages:

- Framework preset: Astro
- Build command: `npm run build`
- Output directory: `dist`
- Node version: use the current Cloudflare-supported LTS version

Dashboard steps:

1. Push this project to a GitHub or GitLab repository.
2. In Cloudflare, go to Workers & Pages.
3. Create a Pages application and import the repository.
4. Set production branch to `main`.
5. Set build command to `npm run build`.
6. Set build output directory to `dist`.
7. Save and deploy.

The temporary Cloudflare Pages URL is acceptable for the first launch. Connect a custom domain after stakeholder review, for example `sops.your-organization.org`.

For a quick direct upload from this machine, run:

```bash
npm run cf:deploy:direct
```

This uses Wrangler to deploy the already-built `dist` output to a Pages project named `sop-knowledge-hub`. Use this for a fast shareable URL. For long-term maintenance, prefer Git integration because Cloudflare will rebuild automatically on every pushed update.

The project includes:

- `wrangler.jsonc` with the Pages output directory.
- `public/_headers` with basic security headers and long-lived caching for built assets.

## Organization-Wide Access Setup

After the Pages deployment is live, protect the site with Cloudflare Access / Zero Trust:

1. In Cloudflare Zero Trust, add an Access application for the Pages hostname or custom domain.
2. Choose a self-hosted web application.
3. Set the application domain, for example `sops.your-organization.org`.
4. Add an allow policy for your organization identity provider, email domain, or approved user groups.
5. Require login for all organization users.
6. Add a stricter policy for `/create`, `/admin`, and `/admin/review` when role-specific groups are ready.

Suggested access model:

- Everyone in the organization can read SOPs, search, use the guided finder, print, and submit requests.
- SOP creators can access `/create`.
- Reviewers and admins can access `/admin` and `/admin/review`.

This keeps the app itself simple while Cloudflare handles organization authentication at the edge.

## Future D1 Integration

The app is structured so mock storage can later be replaced with Cloudflare D1:

- Draft SOPs can map to a `sop_drafts` table.
- Outside submissions can map to a `sop_submissions` table.
- Review queue status can map to a `review_events` or `review_items` table.
- Published SOP content can remain Markdown-backed or move to a managed editorial workflow.

Keep form submission and review workflow logic behind `src/lib/submissions.ts` and `src/lib/drafts.ts` so Pages Functions or Workers can replace browser storage without rewriting page components.

## Future Notification Options

Good next integrations include:

- Email notifications for new requests and review status changes
- Microsoft Teams notifications for assigned owners
- GitHub issue creation for requested SOP work
- Review date reminders
- Analytics for most-used SOPs
- Real PDF generation
- Publishing workflow that converts approved drafts into Markdown or MDX SOP content
- Archived SOP handling

## Known Limitations

- Drafts, submissions, and review actions use browser local storage.
- Admin routes are visible and not yet access-restricted.
- PDF support uses the browser print dialog and Save as PDF.
- Screenshots are placeholders until process-specific images are added.
- Pagefind index is generated at build time, but the current search UI also includes an immediate client-side metadata/body filter.
