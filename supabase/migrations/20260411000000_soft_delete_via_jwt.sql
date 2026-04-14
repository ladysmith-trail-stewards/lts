
alter table public.regions
  add column if not exists deleted_at timestamptz default null;

comment on column public.regions.deleted_at is
  'Soft-delete timestamp. NULL = active. Only super_admin may set this.';


-- block_deleted_at_update(admin_perm, super_user_perm, user_perm)
--
-- Trigger function that enforces role-based soft-delete rules.
-- Each trigger passes three positional arguments declaring what scope
-- each role is permitted to soft-delete on that table:
--
--   TG_ARGV[0]  admin permission
--   TG_ARGV[1]  super_user permission
--   TG_ARGV[2]  user permission
--
-- Permission values (case-insensitive):
--   ALL    — may soft-delete any row
--   REGION — may soft-delete rows where region_id matches their JWT region
--             (own row is implicitly covered since it shares the same region)
--   OWN    — may soft-delete rows where auth_user_id matches their JWT uid
--   NONE   — may not soft-delete
--
-- super_admin always has ALL. Database-level roles (service_role, postgres,
-- supabase_admin) always bypass. Any role not listed above is denied.
-- Default when auto-attached to a new table: REGION / REGION / NONE.
create or replace function public.block_deleted_at_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role        text   := (select auth.jwt() ->> 'user_role');
  v_region_id   bigint := (select (auth.jwt() ->> 'region_id')::bigint);
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

  -- Enforce the permission.
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


drop function if exists public.soft_delete_trails(bigint[]);
drop function if exists public.soft_delete_profiles(bigint[]);

-- ---------------------------------------------------------------------------
-- Event trigger: auto-attach block_deleted_at_update to any public table
-- that has a deleted_at column, whenever a table is created or altered.
-- ---------------------------------------------------------------------------

create or replace function public.attach_block_deleted_at_trigger()
returns event_trigger
language plpgsql
as $$
declare
  r record;
begin
  for r in
    select c.relname as tbl
    from pg_event_trigger_ddl_commands() cmd
    join pg_class     c on c.oid = cmd.objid
    join pg_namespace n on n.oid = c.relnamespace
    where cmd.command_tag in ('CREATE TABLE', 'ALTER TABLE')
      and cmd.object_type = 'table'
      and n.nspname = 'public'
      and c.relkind = 'r'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid
          and a.attname  = 'deleted_at'
          and a.attnum   > 0
          and not a.attisdropped
      )
  loop
    execute format(
      'create trigger %I
         before update on public.%I
         for each row execute function public.block_deleted_at_update(''REGION'', ''REGION'', ''NONE'')',
      r.tbl || '_block_deleted_at', r.tbl
    );
  end loop;
end;
$$;

-- Drop existing event trigger if it exists (idempotent on db reset).
drop event trigger if exists auto_attach_block_deleted_at;

create event trigger auto_attach_block_deleted_at
  on ddl_command_end
  when tag in ('CREATE TABLE', 'ALTER TABLE')
  execute function public.attach_block_deleted_at_trigger();

-- ---------------------------------------------------------------------------
-- Backfill: drop the old named triggers on tables that already existed before
-- this migration. The function body is replaced above (create or replace), but
-- the old trigger binding on profiles/trails still points to the previous
-- stub logic. Drop + recreate so the new JWT-aware function is active.
-- regions gets its trigger via the ALTER TABLE above firing the event trigger.
-- ---------------------------------------------------------------------------
drop trigger if exists profiles_block_deleted_at on public.profiles;
create trigger profiles_block_deleted_at
  before update on public.profiles
  for each row execute function public.block_deleted_at_update('REGION', 'OWN', 'OWN');

drop trigger if exists trails_block_deleted_at on public.trails;
create trigger trails_block_deleted_at
  before update on public.trails
  for each row execute function public.block_deleted_at_update('REGION', 'REGION', 'NONE');
