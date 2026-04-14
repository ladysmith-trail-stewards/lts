-- get_soft_delete_perms()
--
-- Returns the block_deleted_at_update trigger arguments for every public table
-- that has the trigger attached. Used by extract-db-policies.js to populate the
-- Soft-D column in the Access Matrix without reading migration files.
--
-- Returns:
--   table_name    text   — unqualified public-schema table name
--   admin_perm    text   — ALL | REGION | OWN | NONE
--   super_user_perm text — ALL | REGION | OWN | NONE
--   user_perm     text   — ALL | REGION | OWN | NONE
create or replace function public.get_soft_delete_perms()
returns table (
  table_name      text,
  admin_perm      text,
  super_user_perm text,
  user_perm       text
)
language sql security definer stable set search_path = public
as $$
  select
    c.relname::text,
    upper(coalesce(m[1], 'REGION')),  -- TG_ARGV[0] = admin_perm
    upper(coalesce(m[2], 'REGION')),  -- TG_ARGV[1] = super_user_perm
    upper(coalesce(m[3], 'NONE'))     -- TG_ARGV[2] = user_perm
  from pg_trigger t
  join pg_class      c on c.oid    = t.tgrelid
  join pg_namespace  n on n.oid    = c.relnamespace
  join pg_proc       p on p.oid    = t.tgfoid
  cross join lateral (
    select regexp_match(
      pg_get_triggerdef(t.oid),
      $re$block_deleted_at_update\('([^']+)',\s*'([^']+)',\s*'([^']+)'\)$re$
    ) as m
  ) args
  where n.nspname  = 'public'
    and p.proname  = 'block_deleted_at_update'
    and not t.tgisinternal
  order by c.relname;
$$;

revoke execute on function public.get_soft_delete_perms() from public, anon, authenticated;
grant  execute on function public.get_soft_delete_perms() to service_role;
