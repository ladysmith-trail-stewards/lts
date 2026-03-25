# Database Backup & Restore

Manual runbook for backing up and restoring the Ladysmith Trail Stewards PostgreSQL database (hosted on Supabase).

> **Free tier note:** Supabase's automated daily backups (visible in the dashboard) require a paid plan. However, **manual dumps using the Supabase CLI or `pg_dump` work on the free tier** and are the recommended approach here.

---

## Overview

Two complementary approaches:

| Approach | Free tier | When to use |
|---|---|---|
| `supabase db dump` (Supabase CLI) | ✅ Yes | Quick dump via the Supabase CLI |
| `pg_dump` / `pg_restore` (PostgreSQL tools) | ✅ Yes | Full control; works with any PostgreSQL-compatible tool |
| Supabase Dashboard (Backups page) | ⛔ Paid plans only | Automated daily snapshots + point-in-time recovery |

For this project the CLI or `pg_dump` approach is the right one.

---

## Prerequisites

| Tool | Install |
|---|---|
| Supabase CLI | `brew install supabase/tap/supabase` |
| pg_dump / psql | `brew install libpq && brew link --force libpq` (macOS) or `sudo apt install postgresql-client` (Ubuntu) |

---

## Getting the connection string

All commands below need the production database connection string.

1. Open the [Supabase dashboard](https://supabase.com/dashboard) and select the project.
2. Go to **Project Settings → Database → Connection string**.
3. Copy the **Direct connection** URI (not the pooler — `pg_dump` needs a direct connection):
   ```
   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.supabase.com:5432/postgres
   ```

> ⚠️ This string contains your database password — never commit it to git. Store it in a password manager or pass it as an environment variable:
> ```bash
> export PROD_DB_URL="postgresql://postgres.<ref>:<password>@..."
> ```

---

## Backup — dump to file

### Using the Supabase CLI (recommended)

The Supabase CLI wraps `pg_dump` and handles auth automatically when you are logged in (`supabase login`):

```bash
# Dump schema + data
supabase db dump --db-url "$PROD_DB_URL" -f backup-$(date +%F).sql

# Dump data only (no DDL)
supabase db dump --db-url "$PROD_DB_URL" --data-only -f backup-data-$(date +%F).sql
```

Reference: [Supabase CLI — `db dump`](https://supabase.com/docs/reference/cli/supabase-db-dump)

### Using pg_dump directly

```bash
pg_dump "$PROD_DB_URL" \
  --clean \
  --if-exists \
  --quote-all-identifiers \
  --no-owner \
  --no-privileges \
  -f backup-$(date +%F).sql
```

> Store the resulting `.sql` file somewhere safe and **off-repository** (e.g. an encrypted cloud storage bucket, Dropbox, or a password manager attachment). Never commit backup files to git — the `backups/` directory is listed in `.gitignore` if you choose to dump there locally.

---

## Restore — load from file

> ⚠️ Always take a fresh backup of the **target** database before restoring. Running a dump against a live database may overwrite or duplicate existing data.

### Restore to local database

```bash
# Ensure local Supabase is running
pnpm db:start

psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f backup-2026-01-01.sql
```

### Restore to production database

```bash
psql "$PROD_DB_URL" -f backup-2026-01-01.sql
```

After restoring locally, regenerate TypeScript types if the schema changed:

```bash
pnpm db:types
```

---

## Supabase dashboard backups (paid plans)

On **Pro** and higher plans, Supabase automatically takes daily backups accessible from:

**Dashboard → Project → Database → Backups**

From there you can download a backup or trigger a point-in-time restore directly in the UI without running any commands. See [Supabase docs — Backups](https://supabase.com/docs/guides/platform/backups) for full details.

---

## Recommended cadence

| Event | Action |
|---|---|
| Before any production schema migration | Dump prod with `supabase db dump` |
| Before a major data import or bulk edit | Dump prod with `supabase db dump` |
| Weekly (or as needed) | Dump prod and store off-repository |

---

## Troubleshooting

| Error | Fix |
|---|---|
| `connection refused` | Double-check the connection string; ensure your IP is not blocked in Supabase network settings |
| `pg_dump: error: query failed: ERROR: permission denied` | Use the **Direct connection** URI (not the pooler) with the `postgres` superuser |
| `psql: command not found` | Install PostgreSQL client tools (see Prerequisites) |
| `supabase: command not found` | Install the Supabase CLI (see Prerequisites) |

