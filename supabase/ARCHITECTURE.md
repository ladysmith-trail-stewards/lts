# Database Architecture

## Design principles

- **Authorization is enforced in SQL.** RLS policies and SECURITY DEFINER RPCs are the authority. Frontend checks are UX only.
- **JWT claims are sourced from `profiles`, not trusted from the client.** `custom_access_token_hook` runs on every token mint and writes `user_role`, `region_id`, and `is_admin` into the JWT. RLS policies read these cheaply via `auth.jwt()` — no per-query round-trip to `profiles`.
- **SECURITY DEFINER is used only where a genuine privilege bypass is required:**
  - `handle_new_user` — trigger, no auth session exists during signup
  - `get_rls_policies` — reads `pg_catalog`; `service_role` only
  - `get_rpc_privileges` — reads `pg_catalog`; `service_role` only
  - `get_admin_users` — joins `auth.users`; admin+ only
  - `accept_policy` — updates `policy_accepted_at` and `region_id` atomically for `pending` users
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

> **Stale token caveat:** claims reflect the profile at the time the token was minted. If a user's role or region changes, the old token may carry stale claims until it expires or is refreshed. Mitigations: keep JWT lifetime short; force sign-out on role changes; use live DB lookups inside SECURITY DEFINER RPCs for especially sensitive operations.

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

## Webhooks

Supabase Database Webhooks are configured in the **Supabase dashboard** (not in `config.toml` — they are project-level and cannot be version-controlled in migrations). The configuration below must be kept in sync with this file.

### `on_profile_insert`

Fires on every `INSERT` to `public.profiles` and calls the `notify-new-user` Edge Function, which sends an admin notification email when the new profile has `role = 'pending'`.

| Setting      | Value                                           |
| ------------ | ----------------------------------------------- |
| Name         | `on_profile_insert`                             |
| Table        | `public.profiles`                               |
| Events       | `INSERT`                                        |
| Endpoint     | `.../functions/v1/notify-new-user`              |
| HTTP headers | `Authorization: Bearer <supabase anon key>` (set automatically by Supabase for Edge Function webhooks) |

**To configure in the dashboard:**

1. Go to **Database → Webhooks → Create a new hook**.
2. Set the name to `on_profile_insert`.
3. Select table `public.profiles`, event `INSERT`.
4. Choose **Supabase Edge Functions** as the hook type and select `notify-new-user`.
5. Save. Supabase automatically injects the `Authorization` header.

**Required Supabase project secrets** (set via **Project Settings → Edge Functions → Secrets**):

| Secret                    | Purpose                                         |
| ------------------------- | ----------------------------------------------- |
| `RESEND_API_KEY`          | Authenticates calls to the Resend API           |
| `RESEND_FROM_ADDRESS`     | Verified Resend sender address                  |
| `ADMIN_NOTIFICATION_EMAIL`| Destination address for new-user alerts         |
| `APP_URL`                 | Base URL of the app (defaults to `https://ladysmithtrailstewards.ca`) |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically into every Edge Function and do not need to be set manually.
