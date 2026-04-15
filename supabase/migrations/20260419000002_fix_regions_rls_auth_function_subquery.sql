-- fix_regions_rls_auth_function_subquery
--
-- Supabase linter (1): "re-evaluates auth.<function>() for each row".
-- Migrations 20260401 and 20260410 wrote RLS policies as:
--   (select auth.jwt() ->> 'user_role') = '...'
-- The linter wants auth.jwt() itself to be the subquery subject:
--   (select auth.jwt()) ->> 'user_role' = '...'
-- Both forms evaluate once per statement (not per row), but the latter
-- satisfies the Supabase static analyser.
--
-- Supabase linter (2): "multiple permissive policies for the same role+action".
-- "regions: super_admin update" and "regions: admin bbox update" were both
-- TO authenticated FOR UPDATE — two policies evaluated per query.
-- Merged into a single "regions: update" policy: super_admin may update any
-- region; admin may only update their own region (bbox or otherwise).

drop policy if exists "regions: super_admin insert" on public.regions;
drop policy if exists "regions: super_admin update" on public.regions;
drop policy if exists "regions: super_admin delete" on public.regions;
drop policy if exists "regions: admin bbox update"  on public.regions;

create policy "regions: super_admin insert"
  on public.regions as permissive for insert
  to authenticated
  with check ((select auth.jwt()) ->> 'user_role' = 'super_admin');

-- Merged from "regions: super_admin update" + "regions: admin bbox update".
-- super_admin may update any region; admin may update their own region only.
create policy "regions: update"
  on public.regions as permissive for update
  to authenticated
  using  (
    (select auth.jwt()) ->> 'user_role' = 'super_admin'
    or (
      (select auth.jwt()) ->> 'user_role' = 'admin'
      and id = (select ((select auth.jwt()) ->> 'region_id')::bigint)
    )
  )
  with check (
    (select auth.jwt()) ->> 'user_role' = 'super_admin'
    or (
      (select auth.jwt()) ->> 'user_role' = 'admin'
      and id = (select ((select auth.jwt()) ->> 'region_id')::bigint)
    )
  );

create policy "regions: super_admin delete"
  on public.regions as permissive for delete
  to authenticated
  using  ((select auth.jwt()) ->> 'user_role' = 'super_admin');
