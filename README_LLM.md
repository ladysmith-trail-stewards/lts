# Ladysmith Trail Stewards

## Purpose

Web application for the **Ladysmith Trail Stewards** — a trail stewardship organization in Ladysmith, BC, Canada. The app provides public-facing information (charter, contact, trail maps), user authentication with role-based access control (member vs admin), and an admin dashboard for user management and interactive GIS trail mapping.

## Scale & Constraints

- **Target audience**: ~50 users max (small community organization)
- **GIS scope**: Single geographic area (Ladysmith, BC trails only) — keep map data and queries simple
- **Balance speed with scale**: Favour straightforward implementations over enterprise patterns. No need for caching layers, queue systems, or complex state management at this scale. Supabase free/pro tier is sufficient.

## Tech Stack

| Layer           | Technology                            | Version                |
| --------------- | ------------------------------------- | ---------------------- |
| Framework       | React                                 | 19                     |
| Build           | Vite                                  | 8                      |
| Language        | TypeScript                            | 5.9                    |
| Styling         | Tailwind CSS                          | 4                      |
| Components      | shadcn/ui (base-maia style) + Base UI | shadcn 4 / base-ui 1.3 |
| Icons           | Lucide React + HugeIcons              |                        |
| Backend/Auth    | Supabase (JS client v2, SSR)          | supabase-js 2.99       |
| Database        | PostgreSQL 17 (via Supabase)          |                        |
| Maps            | Mapbox GL JS + react-map-gl           | mapbox-gl 3.20         |
| Tables          | TanStack React Table                  | 8                      |
| Validation      | Valibot                               | 1.2                    |
| Routing         | React Router DOM                      | 7                      |
| Testing         | Vitest                                | 4                      |
| Package Manager | pnpm                                  |                        |
| Carousel        | Embla Carousel                        | 8.6                    |
| React Compiler  | babel-plugin-react-compiler           | 1.0                    |

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
pnpm db:reset          # ⚠️  Full reset — drops all data, re-runs migrations + seed, regenerates types + POLICIES.md
pnpm db:migrate        # Apply pending migrations only (no data loss), regenerates types + POLICIES.md
pnpm db:types          # Regenerate database.types.ts from local schema
pnpm db:policies       # Regenerate supabase/POLICIES.md from live DB
# Backup / restore — see supabase/BACKUP.md (uses supabase db dump / pg_dump; works on free tier)

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

**Web app (temporary):** https://ladysmithtrailstewards.vercel.app/

### Supabase production project

Production Supabase URL: `https://alflxeqrnbomoxhgqpyd.supabase.co`

#### Linking your local CLI to production

```bash
supabase login
supabase link --project-ref alflxeqrnbomoxhgqpyd
```

Only needs to be done once per machine. After linking, the CLI knows which remote project to target.

#### Pushing schema migrations to production

```bash
supabase db push
```

Applies any pending migrations from `supabase/migrations/` to the linked production project. Schema only — seed data is never pushed.

#### After a schema push — manual dashboard steps

Some configuration cannot be applied via `db push` and must be set in the [Supabase dashboard](https://supabase.com/dashboard):

1. **Enable `custom_access_token_hook`** — _Authentication → Auth Hooks (beta)_ — hook type: **Postgres**, schema: `public`, function: `custom_access_token_hook`. Required for JWT claims (`user_role`, `region_id`, `is_admin`) — without this, all profile fetches will fail due to RLS.
2. **Add a Region** — _Table Editor → regions_ — insert at least one region row (e.g. `id=1, name="Ladysmith"`) before any users can be assigned a `region_id`.
3. **Upload Trails** — use the map UI or a direct insert into the `trails` table once a region exists.
4. **Enable Google OAuth** — _Authentication → Providers → Google_ — add client ID/secret and set the redirect URI to `https://alflxeqrnbomoxhgqpyd.supabase.co/auth/v1/callback`.
5. **Set `site_url`** — _Authentication → URL Configuration_ — point at the production frontend URL.

See `specs/epics/production/setup-supabase-prod-db/spec.md` (F-005) for the full checklist.

## Gotchas

- **permissions table is service_role only** — RLS explicitly blocks all INSERT/UPDATE/DELETE for `authenticated` users. To modify permissions from the app, use a Supabase Edge Function or server-side call with the service_role key. Direct client writes will silently fail.
- **database.types.ts is auto-generated** — Don't hand-edit. Run `pnpm db:types` after any migration change.
- **Integration tests need local Supabase running** — `pnpm db:start` before `pnpm test:integration`, or they'll fail with connection errors.

## LLM Documentation for Dependencies

When you need reference docs for the tools in this project, fetch these URLs:

| Tool               | LLM Docs                                                             |
| ------------------ | -------------------------------------------------------------------- |
| Supabase (guides)  | https://supabase.com/llms/guides.txt                                 |
| Supabase JS client | https://supabase.com/llms/js.txt                                     |
| Supabase CLI       | https://supabase.com/llms/cli.txt                                    |
| React              | https://react.dev/llms.txt                                           |
| shadcn/ui          | https://ui.shadcn.com/llms.txt                                       |
| Vite               | https://vite.dev/llms.txt                                            |
| Vitest             | https://vitest.dev/llms.txt                                          |
| Valibot            | https://valibot.dev/llms.txt                                         |
| TanStack           | https://tanstack.com/llms.txt                                        |
| Base UI            | https://base-ui.com/llms.txt                                         |
| Mapbox GL JS       | https://docs.mapbox.com/llms.txt                                     |
| Tailwind CSS v4    | _(no llms.txt — use https://tailwindcss.com/docs)_                   |
| React Router v7    | _(no llms.txt — use https://reactrouter.com/home)_                   |
| Lucide Icons       | _(no llms.txt — use https://lucide.dev/guide/packages/lucide-react)_ |
| pnpm               | _(no llms.txt — use https://pnpm.io)_                                |

## Tool mappings (how to implement the conceptual tools)

This project defines a small set of conceptual tools used by the `Agent-LLM` chatmode. Below are concrete mappings and implementation notes for three common runtimes: VS Code (Copilot Chat / Codespaces), GitHub Codespaces, and a custom LangChain-style agent.

- repo-file-reader
  - VS Code / Copilot Chat: built-in file access — ensure `README_LLM.md`, `CLAUDE.md`, and active source files are open in the editor. The chat UI will automatically include open files as context.
  - Codespaces: same as VS Code; file access is provided by the editor environment.
  - LangChain/custom agent: implement a read-only file tool that reads files from the repository workspace, e.g. `read_file(path) -> string`.

- repo-search
  - VS Code: use the workspace search / ripgrep integration or the chat's search capability.
  - LangChain: implement a search tool that runs `rg` or a semantic search over an index and returns matching file snippets.

- web-fetch
  - VS Code/Copilot: some chat runtimes provide a web-preview or fetch tool; otherwise the agent should return the link to the user.
  - LangChain: implement a `web_fetch(url)` tool that fetches content (mind CORS and network rules).

- apply-patch
  - VS Code/Copilot: generate a unified diff in the assistant response; require the user to accept before applying edits.
  - LangChain/custom agent: implement a `generate_patch(diff)` tool that returns a patch string; require an explicit `confirm_apply` step before writing files.

- terminal-runner
  - Run build/test commands in a sandboxed terminal and return stdout/stderr. For VS Code use the built-in terminal; for custom agents run subprocesses and return output.

Confirmation / safety flow (required)

1. Agent proposes edits and shows the exact unified diff or file patches.
2. Agent asks: `Do you authorize applying these changes? (yes/no)`.
3. On `yes`, agent applies patches locally and prepares a branch/commit and optionally opens a PR if explicitly requested.
4. On `no`, the agent aborts and suggests next steps.

Example LangChain tool stubs (conceptual)

// read_file(path): returns file contents
// generate_patch(changes): returns unified diff string
// run_command(cmd): executes and returns stdout/stderr

Notes

- Map the conceptual tool names in `.github/chatmodes/Agent-LLM.chatmode.md` to the actual function names your runtime exposes. If a runtime doesn't support a named tool, the agent should degrade gracefully and only suggest manual steps.
- Keep all write-capable tools behind explicit confirmation gates.

## Testing policy (recommended)

- Any RPC exposed by the backend **must** have an integration test. Integration tests should run against the local Supabase instance (`pnpm db:start`) and verify RLS behavior and response shapes.
- E2E/UI tests are recommended for critical user flows (signup, login, map interactions, admin tasks). Treat E2E as desired but note it's lower priority than integration tests for this project.
- Non-UI functions should be small and atomic where possible and covered by unit tests. Prefer unit tests for pure logic and integration tests for RPCs and DB interactions.
