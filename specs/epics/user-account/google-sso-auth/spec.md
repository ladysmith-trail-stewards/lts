---
id: F-004
type: feature
epic: user-account
status: complete
created: 2026-03-25
updated: 2026-03-25
pr: https://github.com/ladysmith-trail-stewards/lts/pull/46
closed-by: https://github.com/ladysmith-trail-stewards/lts/issues/27
---

# Google SSO Authentication

> Epic: [User Account](../spec.md) — E-002

## Flags

| Flag                |     |
| ------------------- | --- |
| DB Change           | ✅  |
| Style Only          | ⬜  |
| Env Update Required | ✅  |

## Problem

The app had no authentication method enabled for production. Email/password auth is unsuitable for a public-facing volunteer organisation site — users shouldn't have to manage passwords. A new user signing in via Google had no profile row created automatically, causing downstream errors wherever `profiles` was queried.

Additionally, open self-registration via Google is unsafe for this org — new sign-ups need to be vetted by an admin before gaining access.

## Solution

### Auth method

Both `LoginPage.tsx` and `SignUpPage.tsx` are **SSO only** — all email/password form code has been removed. Dev seed users (created directly in `auth.users` via `seed.sql`) retain passwords for integration test use only; there is no UI to sign in with email/password.

### Google provider (local dev)

`supabase/config.toml` now includes:

```toml
[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET)"
redirect_uri = ""
skip_nonce_check = false
```

Secrets are injected at runtime via `env()` substitution from `.env` (never committed). Correct redirect URI for local dev: `http://127.0.0.1:54321/auth/v1/callback`.

`site_url` and `additional_redirect_urls` corrected from the stale port-3000 values to `http://localhost:5173`.

### Google provider (production)

Enabled through the Supabase dashboard under **Authentication → Providers → Google**. No extra env vars needed in the deployed environment — credentials live in the dashboard.

### Auto-create profile on sign-up

Migration `20260325000000_auto_create_profile_on_signup.sql` adds:

- Region `0` ("Default") as an FK-safe placeholder for new users.
- `handle_new_user()` trigger function (`security definer`): skips if a profile already exists, derives `name` from `full_name` metadata → email prefix → UUID, appends a short UUID suffix if the name is already taken.
- `on_auth_user_created` trigger on `auth.users` AFTER INSERT.

### Approval gate — `pending` role

Migration `20260325000001_profiles_approval_gate.sql` adds a `'pending'` value to the `app_role` enum and updates `handle_new_user()`:

- **Email/password users** (dev-seeded only) → `role = 'user'`, active immediately.
- **OAuth (Google) sign-ups** → `role = 'pending'`, zero data access until an admin approves them.

**Why `pending` as a role rather than a separate `approved` column:**

No RLS policy grants `pending` any access, so unapproved users are locked out at the database layer automatically — no policy changes needed now or for future tables. Approval is simply promoting the role: `UPDATE profiles SET role = 'user'`, which admins can already do via their existing UPDATE policies.

`pending` users have the same effective data access as `anon` — zero rows across all tables — despite holding a valid `authenticated` JWT. The only thing they can call are `SECURITY DEFINER` RPCs explicitly granted to `authenticated` (e.g. `get_my_role()`), which is how the frontend detects the pending state and redirects them.

### Frontend approval flow

- `AuthContext` exposes `role` (including `'pending'`). The `approved` boolean approach was considered and rejected in favour of the role-as-state model.
- `RequireAuth` redirects `role === 'pending'` users to `/pending-approval`.
- `PendingApprovalPage` shows a clock icon, explanation, and a sign-out button.

### Header role badge

`Header.tsx` `HeaderUser` refactored to use `useAuth()`. A role badge is rendered next to the user's display name.

## Files modified

| File                                                                   | Change                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/pages/LoginPage.tsx`                                              | SSO only — email/password form removed                                   |
| `src/pages/SignUpPage.tsx`                                             | SSO only — email/password form removed                                   |
| `src/pages/PendingApprovalPage.tsx`                                    | New — shown to `pending` users after sign-in                             |
| `src/components/Header.tsx`                                            | Use `useAuth()`, add role badge                                          |
| `src/components/RequireAuth.tsx`                                       | Redirect `pending` role to `/pending-approval`                           |
| `src/contexts/AuthContext.tsx`                                         | Load role via `get_my_role()`; expose to app                             |
| `src/App.tsx`                                                          | Add `/pending-approval` route                                            |
| `supabase/config.toml`                                                 | Google provider block; corrected `site_url` + `additional_redirect_urls` |
| `supabase/migrations/20260325000000_auto_create_profile_on_signup.sql` | New — trigger + region 0                                                 |
| `supabase/migrations/20260325000001_profiles_approval_gate.sql`        | New — `pending` role; updated trigger                                    |
| `supabase/seed.sql`                                                    | Profiles section: INSERT → UPDATE; no `approved` column                  |
| `scripts/extract-db-policies.js`                                       | Add `pending` role note to generated `POLICIES.md`                       |
| `.env.example`                                                         | Documented Google SSO env vars                                           |
| `README.md`                                                            | Added User Management section                                            |

## Environment variables added

| Variable                                      | Used in                             | Purpose                    |
| --------------------------------------------- | ----------------------------------- | -------------------------- |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`     | `supabase/config.toml` (local only) | Google OAuth client ID     |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` | `supabase/config.toml` (local only) | Google OAuth client secret |

## Testing

- Google SSO button is the only sign-in method on both LoginPage and SignUpPage.
- Signing in via Google creates a profile with `role = 'pending'` and redirects to `/pending-approval`.
- Admin promoting `role = 'user'` grants full access; user is redirected away from `/pending-approval` on next load.
- Dev seed users (`role = 'user'`, `'admin'`, etc.) can sign in via `signInWithPassword` in integration tests.
- `pending` users receive zero rows from all RLS-protected tables when queried directly.
- Role badge in header reflects the value from `profiles.role`.
- `pnpm db:reset` seed runs without errors.

## Changelog

| Date       | Description                                                                              | Initiated by | Why                                                                              |
| ---------- | ---------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------- |
| 2026-03-25 | Spec created                                                                             | kshaw        | Google SSO needed for production; email/password unsuitable for volunteer org    |
| 2026-03-25 | Added approval gate: `pending` role for new OAuth sign-ups                               | kshaw        | Open self-registration unsafe; admins must vet new users before granting access  |
| 2026-03-25 | Replaced `approved` boolean with `pending` role                                          | kshaw        | Role-as-state gives RLS enforcement for free; no per-policy `AND` clauses needed |
| 2026-03-25 | Removed `isProduction` email/password gating; SSO only in all envs                       | kshaw        | Simplifies auth surface; dev seed users cover testing needs without a UI         |
| 2026-03-25 | Closes [#27](https://github.com/ladysmith-trail-stewards/lts/issues/27) — Swapped to SSO | kshaw        | Email/password auth removed in favour of Google SSO                              |
