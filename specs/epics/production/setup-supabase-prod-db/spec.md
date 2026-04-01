---
id: F-005
type: feature
epic: production
status: planned
created: 2026-03-31
updated: 2026-03-31
---

# Setup Supabase Prod DB

> Epic: [Production](../spec.md) — E-003

## Flags

| Flag                |     |
| ------------------- | --- |
| DB Change           | ✅  |
| Style Only          | ⬜  |
| Env Update Required | ✅  |

## Problem

There is no production Supabase project. The app points at a local instance for development, so there is nowhere to deploy the live site against a real, persistent database.

## Solution

Provision a Supabase cloud project and bring it to the same schema state as local development.

### Steps

1. **Create Supabase project** — create a new project in the Supabase dashboard under the `ladysmith-trail-stewards` organization. Choose the nearest region (e.g. `us-west-1`).
2. **Apply migrations** — run `supabase db push` targeting the production project to apply all migrations from `supabase/migrations/` in order.
3. **Enable Google OAuth** — in **Authentication → Providers → Google**, enter the production Google OAuth client ID and secret. Set the authorized redirect URI in the Google Cloud Console to `https://<prod-supabase-url>/auth/v1/callback`.
4. **Configure `site_url` and redirect URLs** — in **Authentication → URL Configuration**, set `site_url` to the production frontend URL and add it to `additional_redirect_urls`.
5. **Enable the `custom_access_token_hook`** — in **Database → Hooks**, enable the `custom_access_token_hook` function so JWT claims (`user_role`, `region_id`, `is_admin`) are populated on every token mint.
6. **Collect production credentials** — from **Project Settings → API**, copy the `Project URL` and `anon` (publishable) key. Store them as GitHub Actions secrets (see F-008).

### Environment variables

The following variables must be set in the production hosting environment (see F-007 and F-008):

| Variable                                | Source                           |
| --------------------------------------- | -------------------------------- |
| `VITE_SUPABASE_URL`                     | Supabase dashboard → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase dashboard → anon key    |
| `VITE_MAPBOX_ACCESS_TOKEN`              | Mapbox account tokens page       |

> `VITE_SUPABASE_SECRET_KEY` is for integration tests only — never expose it in a deployed build.

## Out of Scope

- Running `supabase link` locally (only needed if developers want to diff against prod — deferred).
- Setting up database backups (tracked separately in `supabase/BACKUP.md`).
- Preview/staging environments — deferred to a future epic.

## In Scope

- All existing migrations applied and verified in production.
- Google OAuth provider configured and tested end-to-end.
- `custom_access_token_hook` active and returning correct JWT claims.

## Testing

**Manual verification:**

- Sign in with Google on the production URL → profile row is created with `role = 'pending'`.
- Admin promotes the user → user gains access on next token refresh.
- `get_my_role()` RPC returns the correct role for a signed-in user.

**Edge cases:**

- A user who signs up before any admin exists — confirm they land on `/pending-approval` and cannot access protected routes.
- JWT claims are populated (check via Supabase JWT inspector or a `console.log` of the session).

## Notes

- Use the Supabase CLI (`supabase db push`) rather than manual SQL copy-paste to avoid migration drift.
- Keep production `service_role` key out of git and out of the frontend build — it belongs in CI secrets only.
- After provisioning, update `README.md` with the production Supabase project URL.

## Related Issues

| Issue                                                            | Description                                 | Status |
| ---------------------------------------------------------------- | ------------------------------------------- | ------ |
| [#61](https://github.com/ladysmith-trail-stewards/lts/issues/61) | [E-003] Production (parent epic)            | Open   |
| [#62](https://github.com/ladysmith-trail-stewards/lts/issues/62) | [F-005] Setup Supabase Prod DB (this issue) | Open   |

## Related PRs

| PR  | Description | Status |
| --- | ----------- | ------ |

## Changelog

| Date       | Description  | Author         | Driver    | Why                                     | Status  |
| ---------- | ------------ | -------------- | --------- | --------------------------------------- | ------- |
| 2026-03-31 | Spec created | KeeganShaw-GIS | blueprint | Derived from issue #61 production tasks | planned |
