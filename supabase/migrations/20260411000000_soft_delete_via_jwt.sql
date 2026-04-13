
alter table public.regions
  add column if not exists deleted_at timestamptz default null;

comment on column public.regions.deleted_at is
  'Soft-delete timestamp. NULL = active. Only super_admin may set this.';


create or replace function public.block_deleted_at_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role      text   := (select auth.jwt() ->> 'user_role');
  v_region_id bigint := (select (auth.jwt() ->> 'region_id')::bigint);
  v_uid       uuid   := (select auth.uid());
begin
  -- Only run if deleted_at is actually changing.
  if new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;

  -- Database-level roles always bypass the check.
  if current_role in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  -- super_admin may soft-delete anything, regardless of table.
  if v_role = 'super_admin' then
    return new;
  end if;

  if TG_TABLE_NAME = 'profiles' then
    if v_role = 'admin' then
      if new.auth_user_id = v_uid or new.region_id = v_region_id then
        return new;
      end if;
      raise exception 'permission denied: profile is outside your region'
        using errcode = 'insufficient_privilege';
    elsif v_role = 'super_user' then
      if new.auth_user_id = v_uid then
        return new;
      end if;
      raise exception 'permission denied: super_user may only soft-delete their own profile'
        using errcode = 'insufficient_privilege';
    end if;
  elsif TG_TABLE_NAME = 'regions' then
    null; -- fall through to the final denial
  else
    if v_role in ('admin', 'super_user') then
      if new.region_id = v_region_id then
        return new;
      end if;
      raise exception 'permission denied: % is outside your region', TG_TABLE_NAME
        using errcode = 'insufficient_privilege';
    end if;

  end if;

  raise exception 'permission denied: role % may not soft-delete %', coalesce(v_role, 'anon'), TG_TABLE_NAME
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
         for each row execute function public.block_deleted_at_update()',
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
  for each row execute function public.block_deleted_at_update();

drop trigger if exists trails_block_deleted_at on public.trails;
create trigger trails_block_deleted_at
  before update on public.trails
  for each row execute function public.block_deleted_at_update();
