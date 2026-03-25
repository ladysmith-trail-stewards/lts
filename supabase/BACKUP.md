# Database Backup & Restore

Manual runbook for dumping and restoring the Ladysmith Trail Stewards PostgreSQL database (hosted on Supabase).

---

## Overview

| Script | Command | Purpose |
|---|---|---|
| `db-backup.js` | `pnpm db:backup` | Dump the database to a SQL file |
| `db-restore.js` | `pnpm db:restore` | Restore the database from a SQL file |

Both scripts work against **local** (Docker) and **remote** (Supabase cloud) databases.

Dump files are written to `backups/` at the repo root. That directory is `.gitignore`d — **never commit backup files to git**.

---

## Prerequisites

| Tool | Install |
|---|---|
| Supabase CLI | `brew install supabase/tap/supabase` |
| psql (PostgreSQL client) | `brew install libpq && brew link --force libpq` (macOS) or `sudo apt install postgresql-client` (Ubuntu) |

---

## Backup — dump to file

### Local database

```bash
pnpm db:backup
```

Writes `backups/YYYY-MM-DDTHH-MM-SSZ.sql`. Local Supabase must be running (`pnpm db:start`).

### Remote / production database

```bash
pnpm db:backup -- --db-url "postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

Find the connection string in the Supabase dashboard under **Project Settings → Database → Connection string** (use the **Direct connection** URI, not the pooler, for schema-aware dumps).

> ⚠️ The connection string contains your database password. Pass it via an environment variable or enter it interactively — never hard-code it in scripts or commit it to git.

```bash
# Safer: store the URL in an environment variable
export PROD_DB_URL="postgresql://postgres.<ref>:<password>@..."
pnpm db:backup -- --db-url "$PROD_DB_URL"
```

### Data-only backup (no schema / DDL)

```bash
pnpm db:backup -- --data-only
pnpm db:backup -- --data-only --db-url "$PROD_DB_URL"
```

### Custom output file

```bash
pnpm db:backup -- --file /path/to/my-backup.sql
```

---

## Restore — load from file

> ⚠️ Always take a fresh backup of the **target** database before restoring. Restoring applies all SQL statements in the dump file — depending on the dump type, existing rows may be overwritten or duplicated.

### Local database

```bash
pnpm db:restore -- --file backups/2026-01-01T00-00-00Z.sql
```

The script will prompt for confirmation before executing.

### Remote / production database

```bash
pnpm db:restore -- --file backups/2026-01-01T00-00-00Z.sql --db-url "$PROD_DB_URL"
```

### Skip confirmation prompt (CI / scripted use)

```bash
pnpm db:restore -- --file backups/2026-01-01T00-00-00Z.sql --yes
```

### After restoring locally

If the schema changed, regenerate TypeScript types:

```bash
pnpm db:types
```

---

## Recommended backup schedule

At this scale (≤ 50 users) a simple manual cadence is sufficient:

| Event | Action |
|---|---|
| Before any production schema migration | `db:backup -- --db-url "$PROD_DB_URL"` |
| Before a major data import or bulk edit | `db:backup -- --db-url "$PROD_DB_URL"` |
| Weekly (or as needed) | `db:backup -- --db-url "$PROD_DB_URL"` |

Store the resulting SQL files somewhere safe and off-repository (e.g. an encrypted cloud storage bucket or a password manager attachment).

Note: Supabase Pro tier includes [automated daily backups](https://supabase.com/docs/guides/platform/backups) with point-in-time recovery — consider upgrading if the data becomes critical.

---

## Troubleshooting

| Error | Fix |
|---|---|
| `Local Supabase is not running` | Run `pnpm db:start` |
| `psql not found` | Install PostgreSQL client tools (see Prerequisites) |
| `Supabase CLI not found` | Install the Supabase CLI (see Prerequisites) |
| `connection refused` on remote | Double-check the connection string and that your IP is allowed in Supabase network settings |
| `permission denied` | Ensure you are using the **Direct connection** URI with the `postgres` superuser role |
