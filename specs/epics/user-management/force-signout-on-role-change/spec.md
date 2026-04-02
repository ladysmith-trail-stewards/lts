---
id: F-011
type: feature
epic: user-management
status: planned
created: 2026-04-02
updated: 2026-04-02
---

# Force Sign-Out on Role Change

> Epic: [User Management Improvements](../spec.md) — E-004

## Flags

| Flag                |     |
| ------------------- | --- |
| DB Change           | ✅  |
| Style Only          | ⬜  |
| Env Update Required | ⬜  |

## Problem

JWT claims (`user_role`, `region_id`, `is_admin`) are stamped at token mint time by `custom_access_token_hook`. When an admin changes a user's role in `profiles`, the live JWT held by the affected user still carries the old claims until the token naturally expires or is refreshed.

This is explicitly noted as a known risk in `supabase/ARCHITECTURE.md` (the "stale token caveat"). In practice it means:

- A `pending` user just approved to `user` cannot access the app until their token rotates — they are stuck on `/pending-approval` despite being approved.
- A demoted or suspended user (`user` → `pending`, or soft-deleted) retains their old access for the remainder of the token lifetime.
- An `admin` whose `region_id` changes can still authorize actions against the old region until the token refreshes.

There is currently no mechanism to force a session refresh or sign-out when a role change occurs. The app relies entirely on natural token expiry.

## Solution

### Overview

Replace the current bare `UPDATE profiles SET role = ...` path with a SECURITY DEFINER RPC `change_user_role()` that performs the role update **and** immediately revokes the affected user's Supabase sessions via the Admin API, forcing a clean re-login with fresh claims.

```
Admin changes role in UsersPage
  → change_user_role() RPC
  → UPDATE profiles SET role = ...
  → pg_net HTTP call → Supabase Admin API: sign out user by user_id
  → affected user's sessions invalidated
  → next request → user is redirected to /login
  → fresh sign-in mints a new JWT with correct claims
```

### Database changes

**Migration:** `supabase/migrations/YYYYMMDD_change_user_role_rpc.sql`

**New RPC: `change_user_role(target_profile_id bigint, new_role app_role)`**

- `SECURITY DEFINER`, `search_path = public`.
- `REVOKE EXECUTE FROM public`; `GRANT EXECUTE TO authenticated`.
- Permission checks inside the function body:
  - Caller must be `admin` or `super_admin` (read from `auth.jwt()`).
  - `admin` may only change roles for profiles in their own `region_id`.
  - `super_admin` may change any profile.
  - Neither role may set a role higher than their own (e.g. `admin` cannot promote to `super_admin`).
- Performs `UPDATE public.profiles SET role = new_role WHERE id = target_profile_id`.
- After a successful update, calls the Supabase Admin API to sign out the affected user:
  - Uses `pg_net` (Supabase's built-in async HTTP extension) to `POST` to `{SUPABASE_URL}/auth/v1/admin/users/{auth_user_id}/logout` with the `service_role` key in the `Authorization` header.
  - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are available as database secrets via `vault` or `current_setting()` — see Notes.
- Returns the updated profile row's `id` and new `role` to the caller.

**Remove direct `UPDATE` path for role changes:**

- The column-level `GRANT UPDATE (role) ON public.profiles TO authenticated` remains in place for now (other code may rely on it), but `UsersPage` must be updated to call the new RPC exclusively. The grant can be tightened in a follow-up chore once confirmed no other path writes `role` directly.

### Frontend changes

**`UsersPage` (`src/pages/UsersPage.tsx`)**

- Role change UI (dropdown or select per row — this may be part of F-003 User Profile Dialog, or implemented inline here — see Notes).
- On role change, call `supabase.rpc('change_user_role', { target_profile_id, new_role })` instead of a direct `UPDATE`.
- Show a confirmation step before submitting — role changes are irreversible without another change.
- On success: remove the user from the local table state or refresh the list.
- On error: display the RPC error message inline.

### Affected user experience

When the affected user's session is revoked:

- Their next API call or navigation will receive a 401 from Supabase.
- `onAuthStateChange` in `AuthContext` fires with a `SIGNED_OUT` event.
- `AuthContext` clears `user`, `role`, `regionId`.
- `RequireAuth` redirects to `/login`.
- A fresh Google SSO login mints a new JWT with the correct updated claims.

No special frontend handling is needed for the affected user — the existing `onAuthStateChange` listener already handles forced sign-out correctly.

## Out of Scope

- Notifying the affected user by email when their role changes — deferred (covered as a potential enhancement in F-010).
- Revoking sessions for `region_id` changes without a role change — deferred; same stale-token risk applies, lower priority.
- Tightening the column-level `GRANT UPDATE (role)` — deferred as a chore after confirming no other direct write paths exist.
- UI for bulk role changes — deferred.

## In Scope

- All role transitions: `pending` → `user` (approval), `user` → `admin`, demotion, suspension (`* → pending`).
- Preventing privilege escalation: an `admin` cannot use the RPC to set a role ≥ `admin` on another user.
- The confirmation step in the UI before committing the change.

## Testing

**Unit tests:**

- `UsersPage`: role change calls `supabase.rpc('change_user_role', ...)`, not `supabase.from('profiles').update(...)`.
- `UsersPage`: confirmation step is shown before submitting; cancelling does not call the RPC.
- `UsersPage`: on RPC error, error message is displayed inline without crashing.

**Integration tests (RPC):**

- `super_admin` can change any profile to any lower role.
- `admin` can change a `pending` user in their region to `user`.
- `admin` cannot change a profile in a different region — raises `insufficient_privilege`.
- `admin` cannot promote a user to `admin` or higher — raises `insufficient_privilege`.
- A non-admin caller (`user`, `super_user`, `pending`) cannot call the RPC — raises `insufficient_privilege`.
- After a successful call, `profiles.role` is updated in the DB.
- After a successful call, `pg_net` has enqueued an HTTP request to the Admin API sign-out endpoint.

**Edge cases:**

- Role change to the same role the user already has — RPC should succeed silently (idempotent update), still invalidates the session.
- Target profile does not exist — RPC raises a descriptive error.
- Admin API sign-out call fails (network error, bad secret) — RPC logs the error but does **not** roll back the role update; the role change is committed and the stale-token risk is accepted for this edge case. The failure is surfaced in DB logs.
- Affected user is not currently signed in (no active session) — Admin API returns gracefully; RPC proceeds normally.

## Notes

- **`pg_net` and secrets:** `pg_net` is enabled by default in Supabase. Database secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) can be read inside the function using `current_setting('app.settings.supabase_url')` — these are set in the Supabase dashboard under **Project Settings → Database → Configuration → Custom config**. Document the required settings in `supabase/ARCHITECTURE.md`.
- **Alternative — Edge Function:** Instead of `pg_net` inside the RPC, the role update could trigger a Database Webhook → Edge Function that calls the Admin API. This is cleaner for secrets management but adds latency and a second moving part. The `pg_net` approach is preferred for atomicity (role update and sign-out happen in the same transaction scope).
- **Role change UI location:** `UsersPage` currently has no role editing UI — it's read-only. The inline edit may land here or be deferred to F-003 User Profile Dialog. Either way, the RPC must be in place first — the UI is the easier half.
- **`onAuthStateChange` already handles this:** No changes to `AuthContext` or `RequireAuth` are needed for the affected user path — forced sign-out via the Admin API triggers a `SIGNED_OUT` event which the existing listener already handles correctly.
- References: Supabase Admin API — `POST /auth/v1/admin/users/{id}/logout`; `pg_net` docs — `net.http_post(url, body, headers)`.

## Related Issues

| Issue | Description | Status |
| ----- | ----------- | ------ |
| [#79](https://github.com/ladysmith-trail-stewards/lts/issues/79) | [F-011] Force Sign-Out on Role Change | Open |

## Related PRs

| PR  | Description | Status |
| --- | ----------- | ------ |

## Changelog

| Date       | Description  | Author  | Driver    | Why                                                                         | Status  |
| ---------- | ------------ | ------- | --------- | --------------------------------------------------------------------------- | ------- |
| 2026-04-02 | Spec created | Copilot | blueprint | Stale JWT claims after role change leave users with incorrect access levels | planned |
