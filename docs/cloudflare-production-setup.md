# Cloudflare Production Setup

The SOP Knowledge Hub backend is designed for Cloudflare Pages Functions with:

- D1 for relational app data and analytics rollups.
- R2 for uploaded screenshots, videos, and document attachments when the business account enables it.
- Workers Analytics Engine for optional Cloudflare-native event telemetry.
- Workers AI for the controlled Knowledge Hub assistant.

## Current Cloudflare Resources

- Pages project: `sop-knowledge-hub`
- D1 binding: `DB`
- D1 database: `sop-knowledge-hub-db`
- Workers AI binding: `AI`
- R2 binding: optional `SOP_MEDIA`
- R2 bucket: optional `sop-knowledge-hub-media`
- Analytics Engine binding: optional `SOP_ANALYTICS`
- Analytics Engine dataset: optional `sop_knowledge_hub_events`

## Required Account Toggles

Before deploying this backend version, enable these in the Cloudflare dashboard:

1. R2
   - Dashboard path: R2 Object Storage.
   - Then run:
     ```bash
     npm run media:bucket:create
     ```
   - Keep this binding out of `wrangler.jsonc` until the bucket exists in the account.

2. Workers Analytics Engine optional
   - Dashboard path: Workers & Pages > Analytics Engine.
   - The dataset is created automatically the first time the app writes analytics events.
   - Keep this binding out of `wrangler.jsonc` until Analytics Engine is enabled on the account.

3. Cloudflare Access for authenticated staff
   - Protect the production Pages hostname with Cloudflare Access for logged-in staff.
   - Keep public demo/guest access available only for published, non-sensitive routes and APIs.
   - Access sends authenticated identity to the app by using the `Cf-Access-Jwt-Assertion` header and the browser `CF_Authorization` cookie. The app validates the JWT assertion before trusting the user's email.
   - The app maps the authenticated Access email to `users.email` in D1. If no email is present, the backend returns a read-only guest session.
   - Required D1 assignments:
     - Standard users: `users.access_level = 'Normal User'` or the Standard User role.
     - Creator / Reviewer users: `users.access_level = 'Creator / Reviewer'`, role `role-creator-reviewer`, and one or more rows in `user_sub_roles`.
     - Administrators: `users.access_level = 'Admin'`, role `role-admin`.
   - Do not trust `localStorage`, `subRole` URL parameters, or browser-modified headers as authorization. Backend APIs validate the current user, role, permissions, and allowed sub-role from D1.

## Required Environment Variables

No application secret is required for guest mode. Production authentication depends on Cloudflare Access and these bindings/settings:

- `DB`: D1 binding for users, roles, permissions, sub-roles, SOPs, requests, and workflow data.
- `AI`: Workers AI binding for Guided Finder and AI Assist.
- `CF_ACCESS_AUD`: Cloudflare Access application audience tag.
- `CF_ACCESS_TEAM_DOMAIN`: Cloudflare Access team domain, for example `https://your-team.cloudflareaccess.com`.
- `HELPDOCS_API_KEY`: optional local/import secret for HelpDocs import scripts. Do not expose it to frontend code.

If `CF_ACCESS_AUD` and `CF_ACCESS_TEAM_DOMAIN` are not configured, production visitors are treated as view-only guests even if they send identity-looking headers.

## Verification Commands

```bash
npm run check
npm run build
npm run cf:functions:build
npm run db:migrate:remote
npm run db:tables:remote
npm run media:bucket:list
npm run cf:deploy:direct
```

Run access smoke tests against a deployed preview or local Pages dev server:

```bash
TARGET_ORIGIN=https://your-preview.sop-knowledge-hub.pages.dev npm run test:access
```

## Runtime Endpoints

- `POST /api/media`
  - Stores images, videos, and documents in R2.
  - Writes metadata into `media_assets`.

- `GET /api/media?id=<media-id>`
  - Streams an active R2 media object by D1 media ID.

- `POST /api/analytics/track`
  - Writes durable app analytics into D1.
  - Writes telemetry events into Workers Analytics Engine when the optional binding is enabled.

- `GET /api/analytics/summary`
  - Returns manager-facing analytics for the admin dashboard.

- `POST /api/chat`
  - Uses Workers AI and approved SOP source records.

- `GET /api/auth/session`
  - Returns the server-authorized session context.
  - Unauthenticated visitors receive guest mode with read-only permissions.

## Notes

If R2 or Analytics Engine are not enabled, Cloudflare will reject deployment when those bindings are present in `wrangler.jsonc`. Keep optional bindings out of the config until the account feature is enabled.
