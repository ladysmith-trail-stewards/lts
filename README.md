# Ladysmith Trail Stewards

Web application for the Ladysmith Trail Stewards — a trail stewardship organization in Ladysmith, BC, Canada. Provides public-facing information, user authentication with role-based access control, and an admin dashboard with interactive GIS trail mapping.

## Project Management

Planned work is tracked as specs — the source of truth for all features, bugs, and chores. Issues and PRs are derived from specs.

→ [View specs](./specs/README.md)

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| pnpm | latest | `npm i -g pnpm` |
| Docker Desktop | latest | [docker.com](https://www.docker.com/products/docker-desktop) |
| Supabase CLI | latest | `brew install supabase/tap/supabase` |
| Mapbox account | — | [mapbox.com](https://mapbox.com) — free tier is sufficient |

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/ladysmith-trail-stewards/lts.git
cd lts
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in your values. For **local development** use the local Supabase values (see step 3). For **production** use the Supabase cloud dashboard values.

Required variables:

| Variable | Where to get it |
|---|---|
| `VITE_SUPABASE_URL` | `http://127.0.0.1:54321` (local) or Supabase cloud dashboard |
| `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | `supabase status` → **Publishable** key |
| `VITE_SUPABASE_SECRET_KEY` | `supabase status` → **Secret** key — integration tests only, never in browser code |
| `VITE_MAPBOX_ACCESS_TOKEN` | [Mapbox account tokens page](https://account.mapbox.com/access-tokens/) |

### 3. Start local Supabase

Docker Desktop must be running first.

```bash
pnpm db:start       # starts Supabase containers (first run pulls images — takes a minute)
pnpm db:reset       # applies migrations, seeds data, and generates POLICIES.md
```

After `db:start`, run `supabase status` to get your local keys and paste them into `.env`.

### 4. Start the dev server

```bash
pnpm dev            # http://localhost:5173
```

---

## Seed accounts

Available after `pnpm db:reset` (password: `password123`):

| Email | Role |
|---|---|
| `user@test.com` | user |
| `super_user@test.com` | super_user |
| `admin@test.com` | admin |
| `super_admin@test.com` | super_admin |

---

## Common commands

```bash
# Development
pnpm dev                # dev server on :5173
pnpm build              # TypeScript check + production build
pnpm lint               # ESLint
pnpm format             # Prettier

# Database
pnpm db:start           # start local Supabase (API :54321, Studio :54323)
pnpm db:stop            # stop containers
pnpm db:reset           # ⚠️  full reset — drops all data, re-runs migrations + seed, regenerates types + POLICIES.md
pnpm db:migrate         # apply pending migrations only (no data loss), regenerates types + POLICIES.md
pnpm db:types           # regenerate src/lib/supabase/database.types.ts
pnpm db:policies        # regenerate supabase/POLICIES.md from live DB
pnpm db:backup          # dump local or remote DB to backups/ (see supabase/BACKUP.md)
pnpm db:restore         # restore local or remote DB from a dump file

# Testing
pnpm test               # unit tests only
pnpm test:integration   # integration tests (requires local Supabase running)
pnpm test:all           # all tests
```

---

## Project structure

```
src/
  components/       # React components (ui/ for shadcn primitives)
  pages/            # One file per route
  lib/
    supabase/       # Supabase client + auto-generated database.types.ts
    db_services/    # Typed wrappers around Supabase operations + integration tests
    map/            # Mapbox config
supabase/
  migrations/       # SQL migrations (source of truth for schema + RLS)
  POLICIES.md       # Auto-generated RLS policy snapshot (pnpm db:policies)
  seed.sql          # Local dev seed data
scripts/            # Developer tooling (policy extraction, pre-PR docs)
```

---

## Security notes

- **Never commit secrets** — no `.env`, API keys, or `service_role` keys in git
- **`VITE_SUPABASE_SECRET_KEY` is for tests only** — never import it in browser code
- **RLS is the security boundary** — access control is enforced by Postgres policies, not application logic. See [`supabase/POLICIES.md`](supabase/POLICIES.md) for the active policy matrix

---

## Contact

For questions about this website or the Ladysmith Trail Stewards organization, please use the contact form on the website or join our [Facebook Group](https://www.facebook.com/groups/762166175047717).

---

© 2026 Ladysmith Trail Stewards. All rights reserved.
