-- ============================================================
-- RPC: get_rls_policies
--
-- Returns a snapshot of all RLS policies in the public schema,
-- including: table, policy name, command, roles, USING expression,
-- and WITH CHECK expression.
--
-- Restricted to service_role only — not callable by anon or authenticated.
-- Use with the Supabase service-role client (never expose to the browser).
--
-- Usage (JS):
--   const { data } = await supabaseServiceClient
--     .rpc('get_rls_policies')
-- ============================================================

create or replace function public.get_rls_policies()
returns table (
  table_name  text,
  policy_name text,
  command     text,
  roles       text,
  using_expr  text,
  check_expr  text
)
language sql
security definer
stable
as $$
  select
    p.tablename::text                               as table_name,
    p.policyname::text                              as policy_name,
    p.cmd::text                                     as command,
    coalesce(
      nullif(array_to_string(p.roles, ', '), ''),
      'public'
    )                                               as roles,
    p.qual::text                                    as using_expr,
    p.with_check::text                              as check_expr
  from pg_policies p
  where p.schemaname = 'public'
  order by p.tablename, p.policyname;
$$;

-- Strip all default grants, then grant only to service_role
revoke execute on function public.get_rls_policies() from public;
revoke execute on function public.get_rls_policies() from anon;
revoke execute on function public.get_rls_policies() from authenticated;
grant  execute on function public.get_rls_policies() to service_role;
