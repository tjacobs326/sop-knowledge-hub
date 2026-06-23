# Cloudflare Production Setup

The SOP Knowledge Hub backend is designed for Cloudflare Pages Functions with:

- D1 for relational app data and analytics rollups.
- R2 for uploaded screenshots, videos, and document attachments.
- Workers Analytics Engine for Cloudflare-native event telemetry.
- Workers AI for the controlled Knowledge Hub assistant.

## Current Cloudflare Resources

- Pages project: `sop-knowledge-hub`
- D1 binding: `DB`
- D1 database: `sop-knowledge-hub-db`
- Workers AI binding: `AI`
- R2 binding expected by the app: `SOP_MEDIA`
- R2 bucket expected by the app: `sop-knowledge-hub-media`
- Analytics Engine binding expected by the app: `SOP_ANALYTICS`
- Analytics Engine dataset expected by the app: `sop_knowledge_hub_events`

## Required Account Toggles

Before deploying this backend version, enable these in the Cloudflare dashboard:

1. R2
   - Dashboard path: R2 Object Storage.
   - Then run:
     ```bash
     npm run media:bucket:create
     ```

2. Workers Analytics Engine
   - Dashboard path: Workers & Pages > Analytics Engine.
   - The dataset is created automatically the first time the app writes analytics events.

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
  - Writes telemetry events into Workers Analytics Engine when enabled.

- `GET /api/analytics/summary`
  - Returns manager-facing analytics for the admin dashboard.

- `POST /api/chat`
  - Uses Workers AI and approved SOP source records.

## Notes

If R2 or Analytics Engine are not enabled, Cloudflare will reject deployment when the bindings are present in `wrangler.jsonc`. That is expected and protects the app from deploying with missing production resources.
