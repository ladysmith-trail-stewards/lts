-- fix_assert_data_write_permission
--
-- ROOT CAUSE: plpgsql SECURITY DEFINER functions that RETURN void do NOT return
-- SQL NULL when evaluated inside a policy expression. Instead PostgreSQL returns
-- the plpgsql pseudo-void value, which makes `IS NULL` evaluate to FALSE —
-- causing every write to fail with "new row violates row-level security policy"
-- even for permitted roles.
--
-- FIX: Change the function to RETURNS boolean and RETURN true on success.
--     Update the three RLS policies to use `= true` instead of `IS NULL`.
--
-- Verified behaviour:
--   plpgsql SECURITY DEFINER RETURNS void   → IS NULL = FALSE  (broken)
--   plpgsql SECURITY DEFINER RETURNS boolean RETURN true → = true (works)

-- ── Drop old void signature first (different return type = different overload) ─
-- CASCADE drops the dependent RLS policies; we recreate them below.
drop function if exists public.assert_data_write_permission(bigint) cascade;

create or replace function public.assert_data_write_permission(
  p_region_id bigint default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role      text;
  v_region_id bigint;
  v_jwt_role  text := auth.jwt() ->> 'user_role';
begin
  -- Unauthenticated callers are never permitted.
  if auth.role() <> 'authenticated' then
    raise exception 'insufficient_privilege: not authenticated'
      using errcode = 'insufficient_privilege';
  end if;

  select p.role::text, p.region_id
    into v_role, v_region_id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and p.deleted_at is null
  limit 1;

  -- No profile → treat as pending / unprivileged.
  if v_role is null then
    raise exception 'insufficient_privilege: no active profile found'
      using errcode = 'insufficient_privilege';
  end if;

  -- JWT claim is stale — role has changed since the token was minted.
  -- Client should refresh the session; if revoked it will be signed out.
  -- errcode P0001 = raise_exception (standard user-defined exception SQLSTATE).
  -- The 'stale_jwt:' prefix in the message lets the client discriminate.
  if v_jwt_role is distinct from v_role then
    raise exception 'stale_jwt: JWT role % does not match live role %', v_jwt_role, v_role
      using errcode = 'P0001';
  end if;

  case v_role
    when 'super_admin' then
      -- Super admin may write to any region — no region check needed.
      return true;

    when 'admin', 'super_user' then
      -- Region-scoped: caller's live region must match the target region.
      if p_region_id is not null and p_region_id is distinct from v_region_id then
        raise exception 'insufficient_privilege: trail region does not match your region'
          using errcode = 'insufficient_privilege';
      end if;
      return true;

    else
      raise exception 'insufficient_privilege: role % may not write trails', v_role
        using errcode = 'insufficient_privilege';
  end case;
end;
$$;

revoke execute on function public.assert_data_write_permission(bigint) from public, anon;
grant  execute on function public.assert_data_write_permission(bigint) to authenticated;

comment on function public.assert_data_write_permission(bigint) is
  'Live-role guard for trail writes. Returns TRUE on success; raises on failure. '
  'Call from RLS policies as: (public.assert_data_write_permission(region_id) = true). '
  'Also callable as a direct RPC for pre-flight checks. '
  'Raises stale_jwt if the JWT role differs from the live profile role.';

-- ── Rebuild RLS policies to use `= true` instead of `IS NULL` ────────────────
--
-- The previous pattern `(SELECT fn()) IS NULL` is broken for plpgsql SECURITY
-- DEFINER functions: plpgsql void ≠ SQL NULL, so IS NULL always evaluates false.
-- Using `= true` on a RETURNS boolean function is explicit and correct.

drop policy if exists "trails: insert" on public.trails;
drop policy if exists "trails: update" on public.trails;
drop policy if exists "trails: delete" on public.trails;

create policy "trails: insert"
  on public.trails as permissive for insert
  to authenticated
  with check (public.assert_data_write_permission(region_id) = true);

create policy "trails: update"
  on public.trails as permissive for update
  to authenticated
  using  (public.assert_data_write_permission(region_id) = true)
  with check (public.assert_data_write_permission(region_id) = true);

-- Hard delete is super_admin only — live lookup keeps this revocation-safe.
create policy "trails: delete"
  on public.trails as permissive for delete
  to authenticated
  using  (
    public.assert_data_write_permission(region_id) = true
    and (select auth.jwt()) ->> 'user_role' = 'super_admin'
  );
