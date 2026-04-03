---
id: F-009
type: feature
epic: user-management
status: in-progress
created: 2026-04-02
updated: 2026-04-02
---

# Policy Acknowledgement on Signup

> Epic: [User Management Improvements](../spec.md) — E-004

## Flags

| Flag                |     |
| ------------------- | --- |
| DB Change           | ✅  |
| Style Only          | ⬜  |
| Env Update Required | ⬜  |

## Problem

New users currently complete Google OAuth and land in the `pending` queue without ever acknowledging any terms, liability waiver, or membership rules. The organisation needs a record of explicit consent before a user is considered a valid applicant — both for legal protection and to ensure users understand the volunteer/membership context before requesting access.

## Solution

### Overview

Because Google OAuth is a full-browser redirect, consent cannot be captured _before_ the OAuth flow. Instead, a post-OAuth policy gate intercepts the user on their first return — before they reach `/pending-approval` — and requires them to explicitly accept the policy. Only after acceptance does their profile become a valid pending application visible to admins.

### Database changes

**Migration:** `supabase/migrations/YYYYMMDD_policy_acceptance.sql`

- Add `policy_accepted_at timestamptz default null` to `public.profiles`.
- The `handle_new_user()` trigger continues to insert new OAuth users with `role = 'pending'` but now leaves `policy_accepted_at = NULL`.
- Add `accept_policy(p_region_id bigint)` SECURITY DEFINER RPC:
  - Accepts a `p_region_id bigint` argument; resolves the caller via `auth.uid()`.
  - Validates that `p_region_id > 0` and that the region exists.
  - Sets `policy_accepted_at = now()` and `region_id = p_region_id` on the matching profile row atomically.
  - Restricted: `REVOKE EXECUTE FROM public`; `GRANT EXECUTE TO authenticated`.
  - Body performs an explicit check that the calling user's profile has `role = 'pending'` and `policy_accepted_at IS NULL` — prevents re-invocation by non-pending users.
- Add `policy_accepted_at` to the `get_admin_users()` RPC return set so admins can see whether a pending user accepted the policy.
- Column-level `GRANT UPDATE (policy_accepted_at)` is **not** given to `authenticated` — the only write path is through the RPC.

### JWT / AuthContext

- `custom_access_token_hook` stamps a new claim `policy_accepted` (`boolean`) into the JWT: `true` when `policy_accepted_at IS NOT NULL`, `false` otherwise.
- `AuthContext` exposes `policyAccepted: boolean` derived from this claim — no extra DB round-trip.

### Frontend flow

```
Google OAuth return
  → handle_new_user: role='pending', policy_accepted_at=NULL
  → RequireAuth: policyAccepted === false → /accept-policy
  → AcceptPolicyPage: display policy, checkbox, submit
  → accept_policy() RPC called
  → token refreshed → policyAccepted === true in JWT
  → RequireAuth: role still 'pending' → /pending-approval
  → Admin promotes role to 'user' → full access
```

**`RequireAuth` (`src/components/RequireAuth.tsx`)** — extend the redirect logic:

```
if (!policyAccepted) → <Navigate to="/accept-policy" />   ← new, checked before pending check
if (role === 'pending') → <Navigate to="/pending-approval" />
```

**`AcceptPolicyPage` (`src/pages/AcceptPolicyPage.tsx`)** — new page:

- Displays the policy text (inline or from a static asset — content TBD by the org).
- Requires the user to select their **region** from a dropdown populated via `getRegionsDb()` (regions with `id > 0`; the Default placeholder region is excluded). Region selection is required — the Submit button stays disabled until a valid region is chosen.
- Requires the user to scroll to a checkbox: "I have read and agree to the Ladysmith Trail Stewards membership policy."
- **Submit** button calls `supabase.rpc('accept_policy', { p_region_id })`, forces a session refresh (`supabase.auth.refreshSession()`), then navigates to `/pending-approval`.
- If the RPC returns an error, show an inline error message — do not silently fail.
- Already-accepted users who navigate directly to `/accept-policy` are redirected to `/` by a guard in the page itself.

**`routes.ts` / `App.tsx`** — add `/accept-policy` route; no auth guard wrapping (user is authenticated but `pending` + not yet accepted, so `RequireAuth` can't wrap it — the route must be accessible to authenticated users regardless of policy state).

### Policy content

The actual policy text is out of scope for this spec — placeholder copy will be used for development. The org will supply final copy before the feature ships.

## Out of Scope

- Versioning of the policy (e.g. re-prompting when the policy changes) — deferred.
- Email confirmation to the user after they accept — deferred.
- Allowing users to withdraw consent — deferred; soft-delete of the profile is the current removal path.

## In Scope

- `policy_accepted_at` exposed in `get_admin_users()` output so admins can distinguish "accepted policy, awaiting approval" from "has not yet accepted" when reviewing the users list.
- Preventing re-invocation of `accept_policy()` RPC by users who already accepted or who are not `pending`.

## Testing

**Unit tests:**

- `AcceptPolicyPage`: checkbox starts unchecked; region selector starts empty; Submit is disabled until both checked and a region is selected; Submit calls `supabase.rpc('accept_policy', { p_region_id })` with the chosen region; on success, navigates to `/pending-approval`.
- `RequireAuth`: renders `/accept-policy` redirect when `policyAccepted === false`; renders `/pending-approval` redirect when `policyAccepted === true && role === 'pending'`; renders children when `policyAccepted === true && role !== 'pending'`.

**Integration tests:**

- `accept_policy()` RPC sets `policy_accepted_at` and `region_id` for the calling user's profile.
- `accept_policy()` RPC raises an error if called by a non-`pending` user.
- `accept_policy()` RPC raises an error if `policy_accepted_at` is already set.
- `accept_policy()` RPC raises an error if `p_region_id` is 0 or invalid.
- `custom_access_token_hook` sets `policy_accepted = false` when `policy_accepted_at IS NULL`.
- `custom_access_token_hook` sets `policy_accepted = true` when `policy_accepted_at IS NOT NULL`.
- A `pending` user with `policy_accepted_at = NULL` cannot read any rows from `profiles` or `trails`.

**Edge cases:**

- User navigates directly to `/accept-policy` after already accepting — redirected to `/`.
- User navigates directly to `/pending-approval` before accepting — `RequireAuth` catches `policyAccepted === false` and sends them to `/accept-policy` first.
- OAuth re-login for an existing accepted-pending user: `policy_accepted_at` is already set, so `handle_new_user` no-ops (profile exists check), and the user proceeds straight to `/pending-approval`.

## Notes

- The `accept_policy()` RPC must refresh the JWT after accepting — the frontend must call `supabase.auth.refreshSession()` immediately after the RPC returns successfully so the new `policy_accepted = true` claim is available to `RequireAuth` before navigation.
- The `/accept-policy` route must **not** be wrapped by `RequireAuth` or the pending redirect will create a redirect loop. Add it as a sibling of `/pending-approval` in the router.
- `AcceptPolicyPage` should guard itself: if `policyAccepted === true`, redirect to `/` immediately — prevents already-accepted users from revisiting.
- Policy content file location (when org supplies it): `src/assets/policy.md` or similar — render as HTML from markdown or inline JSX.

## Related Issues

| Issue                                                            | Description                              | Status |
| ---------------------------------------------------------------- | ---------------------------------------- | ------ |
| [#77](https://github.com/ladysmith-trail-stewards/lts/issues/77) | [F-009] Policy Acknowledgement on Signup | Open   |

## Related PRs

| PR  | Description | Status |
| --- | ----------- | ------ |

## Changelog

| Date       | Description          | Author  | Driver    | Why                                                                      | Status      |
| ---------- | -------------------- | ------- | --------- | ------------------------------------------------------------------------ | ----------- |
| 2026-04-02 | Spec created         | Copilot | blueprint | Organisation needs explicit consent before users enter the pending queue | planned     |
| 2026-04-02 | Implementation begun | Copilot | dev       | Issue #77 picked up                                                      | in-progress |
