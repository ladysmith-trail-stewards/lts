# Ladysmith Trail Stewards

## Purpose

Web application for the **Ladysmith Trail Stewards** — a trail stewardship organization in Ladysmith, BC, Canada. The app provides public-facing information (charter, contact, trail maps), user authentication with role-based access control (member vs admin), and an admin dashboard for user management and interactive GIS trail mapping.

## Scale & Constraints

- **Target audience**: ~50 users max (small community organization)
- **GIS scope**: Single geographic area (Ladysmith, BC trails only) — keep map data and queries simple
- **Balance speed with scale**: Favour straightforward implementations over enterprise patterns. No need for caching layers, queue systems, or complex state management at this scale. Supabase free/pro tier is sufficient.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React | 19 |
| Build | Vite | 8 |
| Language | TypeScript | 5.9 |
| Styling | Tailwind CSS | 4 |
| Components | shadcn/ui (base-maia style) + Base UI | shadcn 4 / base-ui 1.3 |
| Icons | Lucide React + HugeIcons | |
| Backend/Auth | Supabase (JS client v2, SSR) | supabase-js 2.99 |
| Database | PostgreSQL 17 (via Supabase) | |
| Maps | Mapbox GL JS + react-map-gl | mapbox-gl 3.20 |
| Tables | TanStack React Table | 8 |
| Validation | Valibot | 1.2 |
| Routing | React Router DOM | 7 |
| Testing | Vitest | 4 |
| Package Manager | pnpm | |
| Carousel | Embla Carousel | 8.6 |
| React Compiler | babel-plugin-react-compiler | 1.0 |

**Always push for latest versions** — all deps use `^` ranges. Run `pnpm update` regularly.

## Project Structure

- `src/components/` — React components + `ui/` subdirectory for shadcn primitives
- `src/pages/` — One file per route (public pages, auth pages, admin pages)
- `src/lib/` — Utilities (`cn()`), Supabase client singleton, auto-generated DB types
- `supabase/` — Config, seed data, and SQL migrations (profiles, permissions, RLS, views)
- `public/` + `images/` — Static assets and gallery images

## Path Alias

`@/` maps to `./src/` — use `@/components/...`, `@/lib/...`, `@/pages/...` in imports.

## Commands

```bash
pnpm dev               # Dev server
pnpm build             # TypeScript check + production build
pnpm lint              # ESLint
pnpm format            # Prettier

# Database (requires Supabase CLI + Docker)
pnpm db:start          # Start local Supabase (API :54321, DB :54322, Studio :54323)
pnpm db:stop           # Stop local Supabase
pnpm db:reset          # Reset DB and re-run migrations + seed
pnpm db:types          # Regenerate database.types.ts from local schema

# Testing
pnpm test              # Unit tests only
pnpm test:integration  # Integration tests (needs local Supabase running)
pnpm test:all          # All tests
```

## Environment Variables

Copy `.env.example` to `.env`. Required:
- `VITE_SUPABASE_URL` — Supabase project URL (or `http://127.0.0.1:54321` for local)
- `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` — Supabase anon key
- `VITE_MAPBOX_ACCESS_TOKEN` — Mapbox GL token

## Database Schema

**profiles** — linked to `auth.users` via `auth_user_id` (UUID FK, CASCADE delete)
- `name` (unique), `user_type` ('member'|'admin'), `phone`, `bio`

**permissions** — one-to-one with profiles via `profile_id` (FK, CASCADE, UNIQUE)
- `can_read`, `can_write`, `can_delete`, `is_admin` (booleans)
- Auto-created on profile insert via trigger

**RLS policies**:
- Users see/edit only their own profile; admins see/edit all
- Permissions table: service_role only (no client writes)
- `is_admin()` — RPC function checking current user's admin flag

**`get_admin_users()`** — RPC returning joined user data (profiles + auth.users + permissions), admin-only

## Auth Flow

1. Email/password signup → OTP confirmation email → `/auth/confirm` verifies
2. Login via `signInWithPassword` → auth state change updates Header
3. Protected routes wrapped in `<RequireAdmin>` which calls `supabase.rpc('is_admin')`
4. Password reset: `/forgot-password` → email link → `/update-password`
5. Seed users for local dev: `user@test.com` / `admin@test.com` (password: `password123`)

## Security

- **Never commit secrets** — no `.env` files, API keys, service_role keys, or tokens in git. Use `.env.example` for templates with placeholder values only.
- **Supabase anon key is public** — it's safe in client code, but the service_role key must never appear in browser code or be committed.
- **RLS is the security boundary** — always assume client-side code is untrusted. Enforce access control through Supabase RLS policies, not application logic.

## Patterns & Conventions

- **Component style**: shadcn base-maia with CVA variants. Custom button variants: `madrone-bark`, `forest-shadow`, `storm-slate`
- **Forms**: Native FormData from form events, no form library
- **State**: Local useState only — no global state management (appropriate for this scale)
- **Supabase calls**: Always destructure `{ data, error }` and handle errors in component state
- **Fonts**: Variable fonts — Cabin, Figtree, Josefin Sans, Outfit
- **Formatting**: Prettier (2 spaces, semicolons, single quotes, trailing commas ES5)
- **Colors**: CSS custom properties in oklch color space
- **Naming over comments**: Favour strong, descriptive naming conventions over inline documentation. Use comments only to explain workarounds, novel approaches, or non-obvious "why" decisions.

## Testing Strategy

- **Unit tests**: Write for business logic, utility functions, and data transformations.
- **Integration tests**: Write for Supabase RPCs, RLS policies, and complex query calls. Require local Supabase running.
- **UI / E2E tests**: Suggest minimally — only for critical user flows. Not a priority at this scale.

## Maintaining This File

Keep this document in sync with the codebase. Update it when adding new dependencies, changing the schema, modifying auth flows, or altering project conventions. If something here contradicts the code, the code is the source of truth — fix this file.

## Deployment

Not set up yet.

## Gotchas

- **permissions table is service_role only** — RLS explicitly blocks all INSERT/UPDATE/DELETE for `authenticated` users. To modify permissions from the app, use a Supabase Edge Function or server-side call with the service_role key. Direct client writes will silently fail.
- **database.types.ts is auto-generated** — Don't hand-edit. Run `pnpm db:types` after any migration change.
- **Integration tests need local Supabase running** — `pnpm db:start` before `pnpm test:integration`, or they'll fail with connection errors.

## LLM Documentation for Dependencies

When you need reference docs for the tools in this project, fetch these URLs:

| Tool | LLM Docs |
|------|----------|
| Supabase (guides) | https://supabase.com/llms/guides.txt |
| Supabase JS client | https://supabase.com/llms/js.txt |
| Supabase CLI | https://supabase.com/llms/cli.txt |
| React | https://react.dev/llms.txt |
| shadcn/ui | https://ui.shadcn.com/llms.txt |
| Vite | https://vite.dev/llms.txt |
| Vitest | https://vitest.dev/llms.txt |
| Valibot | https://valibot.dev/llms.txt |
| TanStack | https://tanstack.com/llms.txt |
| Base UI | https://base-ui.com/llms.txt |
| Mapbox GL JS | https://docs.mapbox.com/llms.txt |
| Tailwind CSS v4 | _(no llms.txt — use https://tailwindcss.com/docs)_ |
| React Router v7 | _(no llms.txt — use https://reactrouter.com/home)_ |
| Lucide Icons | _(no llms.txt — use https://lucide.dev/guide/packages/lucide-react)_ |
| pnpm | _(no llms.txt — use https://pnpm.io)_ |
