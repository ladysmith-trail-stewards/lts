-- Helper RPC used by scripts/extract-db-policies.js to generate POLICIES.md.
-- Returns every public-schema function with its grantees, SECURITY DEFINER
-- flag, and description — all from live pg_catalog data.
-- Callable by service_role only (the script uses the service-role key).

create or replace function public.get_rpc_privileges()
returns table (
  routine_name     text,
  security_definer boolean,
  description      text,
  grantee          text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.proname::text,
    p.prosecdef,
    obj_description(p.oid, 'pg_proc'),
    r.rolname::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join pg_roles r
  where n.nspname = 'public'
    and p.prokind = 'f'
    and r.rolname in ('anon', 'authenticated', 'service_role')
    and has_function_privilege(r.oid, p.oid, 'EXECUTE')
    -- exclude functions owned by extensions (PostGIS, etc.)
    and not exists (
      select 1 from pg_depend d
      join pg_extension e on e.oid = d.refobjid
      where d.objid = p.oid
        and d.deptype = 'e'
    )
  order by p.proname, r.rolname;
$$;

revoke execute on function public.get_rpc_privileges() from public, anon, authenticated;
grant  execute on function public.get_rpc_privileges() to service_role;
