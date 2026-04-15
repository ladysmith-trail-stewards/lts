-- fix_attach_block_deleted_at_trigger_search_path
--
-- Supabase linter: "function has a mutable search_path" (security advisory).
-- Migration 20260411 defined attach_block_deleted_at_trigger without
-- `set search_path = ''`, leaving it vulnerable to search_path hijacking.
--
-- Event trigger functions run as superuser and cannot be SECURITY DEFINER,
-- but fixing the search_path is still required to silence the linter and
-- follow least-privilege hygiene.
--
-- All identifiers inside the function body are already fully schema-qualified
-- (public.%, pg_event_trigger_ddl_commands, pg_class, pg_namespace,
-- pg_attribute) so adding set search_path = '' is a no-op change in behaviour.

create or replace function public.attach_block_deleted_at_trigger()
returns event_trigger
language plpgsql
set search_path = ''
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
