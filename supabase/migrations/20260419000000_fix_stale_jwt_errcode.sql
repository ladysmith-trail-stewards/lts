-- fix_stale_jwt_errcode
--
-- Migration 20260417 used `errcode = 'stale_jwt'` in block_deleted_at_update.
-- PostgreSQL SQLSTATE codes must be exactly 5 alphanumeric characters.
-- 'stale_jwt' is not valid — Postgres rejects it at runtime with:
--   "unrecognized exception condition \"stale_jwt\""  (SQLSTATE 42704)
--
-- FIX: Use errcode = 'P0001' (raise_exception — the standard SQLSTATE for
-- user-defined exceptions) and keep the 'stale_jwt:' prefix in the message
-- so the client can discriminate via error.message.startsWith('stale_jwt').
--
-- assert_data_write_permission is already fixed in 20260418.
-- This migration fixes block_deleted_at_update only.

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
  -- errcode P0001 = raise_exception (standard user-defined exception SQLSTATE).
  -- The 'stale_jwt:' prefix in the message lets the client discriminate.
  if v_jwt_role is distinct from v_role then
    raise exception 'stale_jwt: JWT role % does not match live role %', v_jwt_role, v_role
      using errcode = 'P0001';
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
