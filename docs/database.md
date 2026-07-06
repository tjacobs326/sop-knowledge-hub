# Backend Database

The production backend uses Cloudflare D1 / SQLite for relational data and should use
Cloudflare R2 for uploaded image, video, and document binaries. D1 stores the metadata,
relationships, permissions, workflow state, search data, and analytics. R2 stores the
actual files.

Remote D1 database created:

- Database name: `sop-knowledge-hub-db`
- Binding: `DB`
- Database ID: `dcb9428d-9b7a-46b2-a44a-8600b5ed898d`
- Region reported by Wrangler: `ENAM`

## Core Tables

- `users`, `teams`, `roles`, `permissions`, `role_permissions`, `user_roles`: identity,
  department/team ownership, multi-role assignment, and authorization.
- `identity_accounts`, `access_groups`, `user_access_groups`: Cloudflare Access or identity
  provider mapping.
- `sops`, `sop_versions`: current SOP records plus full version history.
- `procedure_steps`, `procedure_step_media`: structured step records and step-specific media.
- `categories`, `tags`, `sop_tags`: taxonomy and many-to-many SOP tagging.
- `requests`, `reviews`: intake, assignment, review queue, approvals, and publishing workflow.
- `media_assets`, `sop_media`, `sop_version_media`: R2 object metadata, image/video metadata,
  alt text, captions, and SOP relationships.
- `comments`, `attachments`: collaboration, uploaded files, and review evidence.
- `sop_publication_events`: publish/approve/archive workflow audit trail.
- `sop_subscriptions`, `sop_acknowledgements`, `sop_favorites`: user-specific SOP tracking.
- `sop_search_documents`: database-backed search documents for future dynamic search.
- `audit_logs`: who changed what and when.
- `page_view_events`, `sop_view_events`, `sop_export_events`, `search_logs`, `feedback`,
  `admin_analytics_daily`: analytics for admin dashboards, searches, no-result searches,
  exports, and helpful/not helpful ratings.
- `notifications`: in-app, email, or Teams reminders for assignments and review dates.
- `system_settings`, `import_jobs`: operational settings and import/backfill job tracking.

## Apply With Wrangler

The project now includes npm scripts for local and remote database work:

```bash
npm run db:migrate:local
npm run db:seed:local
npm run db:tables:local

npm run db:migrate:remote
npm run db:seed:remote
npm run db:tables:remote
```

The D1 binding is configured in `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "sop-knowledge-hub-db",
    "database_id": "dcb9428d-9b7a-46b2-a44a-8600b5ed898d",
    "migrations_dir": "./migrations"
  }
]
```

## Media Storage

Do not store image binaries in D1. The database stores:

- R2 object key
- file name and display name
- MIME type and size
- checksum
- width, height, duration
- alt text and caption
- uploader and workflow relationship
- status such as active, quarantined, archived, or deleted

The account currently needs R2 enabled in the Cloudflare dashboard before a bucket can be
created. After R2 is enabled, create a bucket such as `sop-knowledge-hub-media`, then add
an `r2_buckets` binding to `wrangler.jsonc`.

## Design Notes

- IDs are `TEXT` so the app can use UUIDs or identity-provider IDs.
- JSON-style fields are stored as `TEXT` for D1 compatibility.
- Foreign keys are included for data integrity.
- Indexes are included for the screens already in the app: search, My Work, review queue,
  admin analytics, ownership, overdue reviews, and notifications.
- Attachments and media are modeled with storage keys so files live in Cloudflare R2 while
  searchable metadata remains in D1.

## Current Validation

Local D1 migrations were applied successfully through `0003_d1_single_source_foundation.sql`.
The current local smoke checks verified:

- `GET /api/categories`
- `GET /api/sops?limit=2`
- `POST /api/sop-requests`

Earlier remote verification counts:

- 44 tables/views
- 5 users
- 3 roles
- 14 permissions
- 7 SOPs
- 7 SOP versions
- 7 media assets
- 2 requests
- 3 reviews
- 6 daily analytics rows

## Runtime Integration

Cloudflare Pages Functions now expose D1-backed endpoints for:

- published SOP search/list/detail reads
- category and tag reads
- SOP draft creation
- SOP metadata updates
- SOP version list/create
- review workflow transitions: submit for review, request changes, approve, publish, archive
- SOP view tracking
- helpful/not helpful feedback
- SOP request submission, assignment, and status updates
- search logging

The submit request page writes to `/api/sop-requests` first and keeps the existing browser
storage workflow as a static-preview fallback.

Before deploying this schema to production, run:

```bash
npm run db:migrate:remote
```

Then redeploy the Pages project:

```bash
npm run cf:deploy:direct
```
