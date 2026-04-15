-- assert_data_write_permission(p_region_id bigint)
--
-- SECURITY DEFINER guard for all trail write paths (INSERT, UPDATE, soft-delete,
-- hard-delete). Performs a live lookup of profiles.role so that role changes
-- take effect immediately — independent of the caller's JWT claims.
--
-- Additionally compares the live role against the JWT claim. If they differ the
-- caller's token is stale — raises with errcode 'stale_jwt' so the client can
-- detect this specifically, refresh the session, and redirect to login if the
-- session has been revoked.
--
-- Call this at the top of any trail-write RPC before touching rows.
-- Raises and aborts the transaction on failure.
--
-- Permission model (mirrors RLS write policies):
--   super_admin  — any region
--   admin        — own region only
--   super_user   — own region only
--   all others   — denied
--
-- Pass p_region_id = NULL to skip the region check (super_admin-only paths
-- where the region is not known up front, e.g. hard-delete by id).

create or replace function public.assert_data_write_permission(
  p_region_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role      text;
  v_region_id bigint;
  v_jwt_role  text := auth.jwt() ->> 'user_role';
begin
  select p.role::text, p.region_id
    into v_role, v_region_id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and p.deleted_at is null
  limit 1;

  -- Unauthenticated callers are never permitted.
  if auth.role() <> 'authenticated' then
    raise exception 'insufficient_privilege: not authenticated'
      using errcode = 'insufficient_privilege';
  end if;

  -- No profile → treat as pending / unprivileged.
  if v_role is null then
    raise exception 'insufficient_privilege: no active profile found'
      using errcode = 'insufficient_privilege';
  end if;

  -- JWT claim is stale — role has changed since the token was minted.
  -- Client should refresh the session; if revoked it will be signed out.
  if v_jwt_role is distinct from v_role then
    raise exception 'stale_jwt: JWT role % does not match live role %', v_jwt_role, v_role
      using errcode = 'stale_jwt';
  end if;

  case v_role
    when 'super_admin' then
      -- Super admin may write to any region — no region check needed.
      return;

    when 'admin', 'super_user' then
      -- Region-scoped: caller's live region must match the target region.
      if p_region_id is not null and p_region_id is distinct from v_region_id then
        raise exception 'insufficient_privilege: trail region does not match your region'
          using errcode = 'insufficient_privilege';
      end if;
      return;

    else
      raise exception 'insufficient_privilege: role % may not write trails', v_role
        using errcode = 'insufficient_privilege';
  end case;
end;
$$;

revoke execute on function public.assert_data_write_permission(bigint) from public, anon;
grant  execute on function public.assert_data_write_permission(bigint) to authenticated;

comment on function public.assert_data_write_permission(bigint) is
  'Live-role guard for trail writes. Call at the top of any trail-write RPC. '
  'Raises insufficient_privilege if the caller''s current profile role does not '
  'permit writes to the given region. Pass NULL to skip the region check '
  '(super_admin hard-delete paths).';

-- ── Replace trails INSERT / UPDATE / DELETE policies ─────────────────────────
--
-- SELECT stays JWT-based (fast; stale reads are acceptable).
-- INSERT / UPDATE / DELETE call assert_data_write_permission() for live
-- enforcement so a role downgrade takes effect on the very next write,
-- regardless of JWT age.
--
-- assert_data_write_permission returns void — it raises on failure and returns
-- nothing on success. The IS NULL check always passes on success.

drop policy if exists "trails: insert"             on public.trails;
drop policy if exists "trails: update"             on public.trails;
drop policy if exists "trails: delete"             on public.trails;
drop policy if exists "trails: super_admin delete" on public.trails;

create policy "trails: insert"
  on public.trails for insert
  with check ((select public.assert_data_write_permission(region_id)) is null);

create policy "trails: update"
  on public.trails for update
  using  ((select public.assert_data_write_permission(region_id)) is null)
  with check ((select public.assert_data_write_permission(region_id)) is null);

create policy "trails: delete"
  on public.trails for delete
  using  ((select public.assert_data_write_permission(region_id)) is null);

-- ── Replace block_deleted_at_update with live-lookup version ─────────────────
--
-- Original used auth.jwt() claims for role and region_id. Replaced with a live
-- profiles lookup so that a role downgrade takes effect immediately on the next
-- soft-delete, regardless of JWT age.
--
-- Additionally raises 'stale_jwt' if the JWT claim differs from the live role,
-- giving the client the same signal as assert_data_write_permission so it can
-- refresh the session and redirect to login if the session has been revoked.
--
-- All other behaviour (TG_ARGV permissions, OWN / REGION / ALL scopes,
-- service_role bypass) is unchanged.

create or replace function public.block_deleted_at_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_jwt_role    text   := (select auth.jwt() ->> 'user_role');
  v_role        text;
  v_region_id   bigint;
  v_uid         uuid   := (select auth.uid());

  -- Read per-role permissions from trigger arguments (defaults: REGION / REGION / NONE).
  perm_admin      text := upper(coalesce(TG_ARGV[0], 'REGION'));
  perm_super_user text := upper(coalesce(TG_ARGV[1], 'REGION'));
  perm_user       text := upper(coalesce(TG_ARGV[2], 'NONE'));

  v_perm text;
begin
  -- Only run if deleted_at is actually changing.
  if new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;

  -- Database-level roles always bypass the check.
  if current_role in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  -- Live lookup of role and region_id from profiles.
  select p.role::text, p.region_id
    into v_role, v_region_id
  from public.profiles p
  where p.auth_user_id = v_uid
    and p.deleted_at is null
  limit 1;

  -- No profile → deny.
  if v_role is null then
    raise exception 'permission denied: no active profile found'
      using errcode = 'insufficient_privilege';
  end if;

  -- JWT claim is stale — role has changed since the token was minted.
  if v_jwt_role is distinct from v_role then
    raise exception 'stale_jwt: JWT role % does not match live role %', v_jwt_role, v_role
      using errcode = 'stale_jwt';
  end if;

  -- super_admin always has ALL.
  if v_role = 'super_admin' then
    return new;
  end if;

  -- Resolve the permission for the calling role.
  v_perm := case v_role
    when 'admin'      then perm_admin
    when 'super_user' then perm_super_user
    when 'user'       then perm_user
    else 'NONE'
  end;

  -- Enforce the permission using the live region_id.
  if v_perm = 'ALL' then
    return new;
  elsif v_perm = 'REGION' then
    if new.region_id = v_region_id then
      return new;
    end if;
    raise exception 'permission denied: row is outside your region'
      using errcode = 'insufficient_privilege';
  elsif v_perm = 'OWN' then
    if new.auth_user_id = v_uid then
      return new;
    end if;
    raise exception 'permission denied: you may only soft-delete your own record'
      using errcode = 'insufficient_privilege';
  end if;

  -- NONE or unrecognised role.
  raise exception 'permission denied: role % may not soft-delete rows in %',
    coalesce(v_role, 'anon'), TG_TABLE_NAME
    using errcode = 'insufficient_privilege';
end;
$$;
