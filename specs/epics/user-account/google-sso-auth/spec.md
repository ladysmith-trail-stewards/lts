---
id: F-004
type: feature
epic: user-account
status: complete
created: 2026-03-25
updated: 2026-03-25
pr: https://github.com/ladysmith-trail-stewards/lts/pull/46
---

# Google SSO Authentication

> Epic: [User Account](../spec.md) — E-002

## Flags

| Flag | |
|---|---|
| DB Change | ✅ |
| Style Only | ⬜ |
| Env Update Required | ✅ |

## Problem

The app had no authentication method enabled for production. Email/password auth is unsuitable for a public-facing volunteer organisation site — users shouldn't have to manage passwords. A new user signing in via Google had no profile row created automatically, causing downstream errors wherever `profiles` was queried.

## Solution

### Auth method gating

Both `LoginPage.tsx` and `SignUpPage.tsx` are gated by `import.meta.env.PROD`:

- **Production** — Google SSO button only. Email/password form and "Or continue with" divider are hidden.
- **Dev** — both email/password form and Google SSO button are shown.

Card description text adapts to the active mode.

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
- `handle_new_user()` trigger function (`security definer`): skips if a profile already exists, derives `name` from `full_name` metadata → email prefix → UUID, appends a short UUID suffix if the name is already taken, inserts with `role = 'user'` and `region_id = 0`.
- `on_auth_user_created` trigger on `auth.users` AFTER INSERT.

`seed.sql` profiles section changed from `INSERT` to `UPDATE` statements — the trigger now creates the rows; seed merely updates them with correct roles and `region_id = 1`.

### Header role badge

`Header.tsx` `HeaderUser` refactored to use `useAuth()` instead of its own `useState`/`useEffect` subscription. A role badge is rendered next to the user's display name:

```tsx
{role && (
  <span className="text-[10px] leading-none px-1.5 py-0.5 rounded bg-slate-600 text-slate-300 capitalize">
    {role.replace('_', ' ')}
  </span>
)}
```

## Files modified

| File | Change |
|---|---|
| `src/pages/LoginPage.tsx` | Production = SSO only; dev = both |
| `src/pages/SignUpPage.tsx` | Same gating as LoginPage |
| `src/components/Header.tsx` | Use `useAuth()`, add role badge |
| `supabase/config.toml` | Google provider block; corrected `site_url` + `additional_redirect_urls` |
| `supabase/migrations/20260325000000_auto_create_profile_on_signup.sql` | New — trigger + region 0 |
| `supabase/seed.sql` | Profiles section: INSERT → UPDATE |
| `.env.example` | Documented Google SSO env vars |
| `README.md` | Added User Management section |

## Environment variables added

| Variable | Used in | Purpose |
|---|---|---|
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` | `supabase/config.toml` (local only) | Google OAuth client ID |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` | `supabase/config.toml` (local only) | Google OAuth client secret |

## Testing

- Google SSO button appears on both LoginPage and SignUpPage in dev.
- Email/password form is hidden in a production build (`pnpm build && pnpm preview`).
- Signing in via Google locally redirects to `http://localhost:5173/` and creates a profile row with `role = 'user'` and `region_id = 0`.
- Signing in with a name that already exists appends `_<short-uuid>` suffix.
- Role badge in header reflects the value from `profiles.role`.
- `pnpm db:reset` seed runs without FK constraint errors.
