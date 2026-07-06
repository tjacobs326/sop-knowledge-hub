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

## Verification Commands

```bash
npm run check
npm run build
npm run cf:functions:build
npm run db:tables:remote
npm run media:bucket:list
npm run cf:deploy:direct
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

## Notes

If R2 or Analytics Engine are not enabled, Cloudflare will reject deployment when those bindings are present in `wrangler.jsonc`. Keep optional bindings out of the config until the account feature is enabled.
