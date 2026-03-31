# Database Architecture

## Design principles

- **Authorization is enforced in SQL.** RLS policies and SECURITY DEFINER RPCs are the authority. Frontend checks are UX only.
- **JWT claims are sourced from `profiles`, not trusted from the client.** `custom_access_token_hook` runs on every token mint and writes `user_role`, `region_id`, and `is_admin` into the JWT. RLS policies read these cheaply via `auth.jwt()` — no per-query round-trip to `profiles`.
- **SECURITY DEFINER is used only where a genuine privilege bypass is required:**
  - `handle_new_user` — trigger, no auth session exists during signup
  - `soft_delete_trails` / `soft_delete_profiles` — column-level bypass for `deleted_at`
  - `get_rls_policies` — reads `pg_catalog`; `service_role` only
  - `get_admin_users` — joins `auth.users`; admin+ only
- **Anon users have no write access** to trails and no access to profiles.
- **Soft-delete is the standard deletion path.** Setting `deleted_at` is the only removal path for `user`, `super_user`, and `admin` roles. Hard-delete (permanent `DELETE`) is `super_admin` only via RLS policy. `deleted_at` cannot be set by a direct `UPDATE` — column-level grants exclude it; only the SECURITY DEFINER soft-delete RPCs may write it.

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
- `deleted_at` is not in the column-level `GRANT UPDATE` for `authenticated` — it can only be written by the SECURITY DEFINER `soft_delete_*` RPCs.
- `custom_access_token_hook` filters `deleted_at IS NULL` when looking up claims, so a soft-deleted user immediately gets `user_role = 'pending'` on their next token mint.

## Region scoping

`region_id` in the JWT claim is used by RLS policies and RPCs to restrict `admin` and `super_user` access to their assigned region. The same stale-token caveat applies: if a user is moved between regions, the old token may authorize actions in the old region until refreshed.

## SECURITY DEFINER hygiene

All SECURITY DEFINER functions:

- Set `search_path = public` explicitly to prevent search-path injection.
- `REVOKE EXECUTE FROM public` then grant only to the intended role(s).
- Perform explicit role/permission checks inside the function body rather than relying solely on the caller's grants.
