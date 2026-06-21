# Database Foundation

The production backend should use the schema in `migrations/0001_initial_schema.sql`.
It is written for Cloudflare D1 / SQLite and gives the SOP Knowledge Hub a durable
workflow foundation behind the current static UI.

## Core Tables

- `users`, `teams`, `roles`: identity, department/team ownership, access level, and permissions.
- `sops`, `sop_versions`: current SOP records plus full version history.
- `categories`, `tags`, `sop_tags`: taxonomy and many-to-many SOP tagging.
- `requests`, `reviews`: intake, assignment, review queue, approvals, and publishing workflow.
- `comments`, `attachments`: collaboration, screenshots, uploaded files, and review evidence.
- `audit_logs`: who changed what and when.
- `search_logs`, `feedback`: analytics for searches, no-result searches, and helpful/not helpful ratings.
- `notifications`: in-app, email, or Teams reminders for assignments and review dates.

## Apply Later With Wrangler

When the project is ready for a real D1 database, create the database and apply the migration:

```bash
npx wrangler d1 create sop-knowledge-hub-db
npx wrangler d1 migrations apply sop-knowledge-hub-db --local
npx wrangler d1 migrations apply sop-knowledge-hub-db --remote
```

Then add the generated D1 binding to `wrangler.jsonc`, for example:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "sop-knowledge-hub-db",
    "database_id": "replace-with-cloudflare-database-id"
  }
]
```

## Design Notes

- IDs are `TEXT` so the app can use UUIDs or identity-provider IDs.
- JSON-style fields are stored as `TEXT` for D1 compatibility.
- Foreign keys are included for data integrity.
- Indexes are included for the screens already in the app: search, My Work, review queue,
  admin analytics, ownership, overdue reviews, and notifications.
- Attachments are modeled with a `storage_key` so files can later live in Cloudflare R2
  while metadata remains in D1.
