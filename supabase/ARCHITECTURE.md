# Database Architecture

## Design principles

- **Authorization is enforced in SQL.** RLS policies and SECURITY DEFINER RPCs are the authority. Frontend checks are UX only.
- **JWT claims are sourced from `profiles`, not trusted from the client.** `custom_access_token_hook` runs on every token mint and writes `user_role`, `region_id`, and `is_admin` into the JWT. RLS policies on read-only paths use these cheaply via `auth.jwt()`. **Write policies (INSERT / UPDATE / DELETE) on `trails` use live `profiles` lookups via `current_profile_role()` and `current_profile_region_id()` so a role downgrade takes effect immediately without requiring a token refresh.**
- **SECURITY DEFINER is used only where a genuine privilege bypass is required:**
  - `handle_new_user` — trigger, no auth session exists during signup
  - `get_rls_policies` — reads `pg_catalog`; `service_role` only
  - `get_rpc_privileges` — reads `pg_catalog`; `service_role` only
  - `get_admin_users` — joins `auth.users`; admin+ only
  - `accept_policy` — updates `policy_accepted_at` and `region_id` atomically for `pending` users
  - `change_user_role` — updates `profiles.role` and immediately signs out the affected user via the Admin API; admin+ only
  - `assert_data_write_permission(p_region_id)` — live `profiles` lookup used by trail write RLS policies and write RPCs; raises `insufficient_privilege` on failure; reusable for any trail write path
  - `current_profile_role()` — live role lookup used by write RLS policies; readable by `authenticated` only
  - `current_profile_region_id()` — live region lookup used by write RLS policies; readable by `authenticated` only
- **Anon users have no write access** to trails and no access to profiles.
- **Soft-delete is the standard deletion path.** Setting `deleted_at` is the only removal path for `user`, `super_user`, and `admin` roles. Hard-delete (permanent `DELETE`) is `super_admin` only via RLS policy. `deleted_at` is written by a direct `UPDATE`; the `block_deleted_at_update` trigger (attached to every table with a `deleted_at` column) enforces JWT-based scope rules — each trigger declares per-role permissions (`ALL | REGION | OWN | NONE`) as trigger arguments.

## Roles

| Role          | Description                                                    |
| ------------- | -------------------------------------------------------------- |
| `pending`     | New OAuth sign-ups. No data access until promoted by an admin. |
| `user`        | Standard authenticated user. Own profile + read trails.        |
| `super_user`  | Like `user` but can insert/update trails in their region.      |
| `admin`       | Manages profiles and trails within their assigned region.      |
| `super_admin` | Global access. Can hard-delete. Can manage regions.            |

## JWT claims

The `custom_access_token_hook` always sets these claims on every token, unconditionally:

| Claim       | Type      | Notes                                                                 |
| ----------- | --------- | --------------------------------------------------------------------- |
| `user_role` | `text`    | One of the `app_role` enum values, or `'pending'` if no profile found |
| `region_id` | `bigint`  | `NULL` if no profile found                                            |
| `is_admin`  | `boolean` | Convenience flag: `true` when role is `admin` or `super_admin`        |

> **Stale token caveat:** claims reflect the profile at the time the token was minted. If a user's role or region changes, the old token may carry stale claims until it expires or is refreshed. **Read** paths use JWT claims (fast; stale reads are acceptable). **Write** paths on `trails` — both RLS policies and write RPCs — call `assert_data_write_permission()`, a live `profiles` lookup, so a role downgrade takes effect on the very next write attempt regardless of token age. `change_user_role` also fires a best-effort sign-out via the Admin API to clear the client session promptly.

## Soft-delete

- `deleted_at IS NULL` = active record.
- Soft-deleted rows are excluded from `trails_view` and should be excluded by application queries on `profiles`.
- `deleted_at` is written via a direct `UPDATE`. The `block_deleted_at_update` trigger enforces role-based rules using JWT claims (`user_role`, `region_id`, `auth.uid()`). Each trigger is attached with three positional arguments (`admin_perm`, `super_user_perm`, `user_perm`) declaring the allowed scope (`ALL | REGION | OWN | NONE`) for that table. `super_admin` always bypasses. The default for auto-attached triggers is `REGION / REGION / NONE`.
- `custom_access_token_hook` filters `deleted_at IS NULL` when looking up claims, so a soft-deleted user immediately gets `user_role = 'pending'` on their next token mint.

## Region scoping

`region_id` in the JWT claim is used by RLS policies and RPCs to restrict `admin` and `super_user` access to their assigned region. The same stale-token caveat applies: if a user is moved between regions, the old token may authorize actions in the old region until refreshed.

## SECURITY DEFINER hygiene

All SECURITY DEFINER functions:

- Set `search_path = public` explicitly to prevent search-path injection.
- `REVOKE EXECUTE FROM public` then grant only to the intended role(s).
- Perform explicit role/permission checks inside the function body rather than relying solely on the caller's grants.

## Force sign-out on role change

`change_user_role(target_profile_id bigint, new_role app_role)` updates `profiles.role` **and** immediately revokes the affected user's Supabase sessions so their next request forces a fresh login with correct JWT claims.

Permission model:

| Caller        | Scope           | Allowed target roles                     |
| ------------- | --------------- | ---------------------------------------- |
| `super_admin` | Any profile     | Any role                                 |
| `admin`       | Own region only | `pending`, `user`, `super_user`, `admin` |
| all others    | —               | denied (`insufficient_privilege`)        |

It uses `pg_net` to call the Supabase Admin API (`POST /auth/v1/admin/users/{id}/logout`). Two custom config settings must be present in the database:

| Setting key                              | Value                                        |
| ---------------------------------------- | -------------------------------------------- |
| `app.settings.supabase_url`              | Project URL (e.g. `https://xxx.supabase.co`) |
| `app.settings.supabase_service_role_key` | Service-role JWT                             |

Set these in **Supabase dashboard → Project Settings → Database → Configuration → Custom config**.

If either setting is missing the sign-out is silently skipped and only the role update is committed. If the `pg_net` call itself fails the role update is **not** rolled back; the failure is surfaced as a `WARNING` in database logs.
