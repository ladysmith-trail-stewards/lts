-- fix_profiles_rls_auth_function_subquery
--
-- Supabase linter: "re-evaluates auth.<function>() for each row".
-- Migrations 20260401 and 20260402 wrote RLS policies as:
--   (select auth.jwt() ->> 'user_role') = '...'
-- The linter wants auth.jwt() itself to be the subquery subject:
--   (select auth.jwt()) ->> 'user_role' = '...'
-- Both forms evaluate once per statement (not per row), but the latter
-- satisfies the Supabase static analyser.
--
-- Recreates all profiles policies in one shot so the linter sees a
-- consistent set.

drop policy if exists "profiles: select"         on public.profiles;
drop policy if exists "profiles: insert"         on public.profiles;
drop policy if exists "profiles: update"         on public.profiles;
drop policy if exists "profiles: super_admin delete" on public.profiles;

-- SELECT — own row always visible; admins can see their region; super_admin sees all.
-- pending users can see their own row (auth_user_id = uid branch).
create policy "profiles: select"
  on public.profiles for select
  using (
    auth_user_id = (select auth.uid())
    or (
      (select auth.jwt()) ->> 'user_role' not in ('pending', 'anon')
      and (
        (select auth.jwt()) ->> 'user_role' = 'super_admin'
        or (
          (select auth.jwt()) ->> 'user_role' = 'admin'
          and region_id = (select ((select auth.jwt()) ->> 'region_id')::bigint)
        )
      )
    )
  );

-- INSERT — super_admin anywhere; admin within their own region.
create policy "profiles: insert"
  on public.profiles as permissive for insert
  to authenticated
  with check (
    (select auth.jwt()) ->> 'user_role' in ('super_admin', 'admin')
    and (
      (select auth.jwt()) ->> 'user_role' = 'super_admin'
      or region_id = (select ((select auth.jwt()) ->> 'region_id')::bigint)
    )
  );

-- UPDATE — own row; super_admin anywhere; admin within their own region.
create policy "profiles: update"
  on public.profiles as permissive for update
  to authenticated
  using (
    auth_user_id = (select auth.uid())
    or (select auth.jwt()) ->> 'user_role' = 'super_admin'
    or (
      (select auth.jwt()) ->> 'user_role' = 'admin'
      and region_id = (select ((select auth.jwt()) ->> 'region_id')::bigint)
    )
  )
  with check (
    auth_user_id = (select auth.uid())
    or (select auth.jwt()) ->> 'user_role' = 'super_admin'
    or (
      (select auth.jwt()) ->> 'user_role' = 'admin'
      and region_id = (select ((select auth.jwt()) ->> 'region_id')::bigint)
    )
  );

-- DELETE — super_admin only.
create policy "profiles: super_admin delete"
  on public.profiles as permissive for delete
  to authenticated
  using ((select auth.jwt()) ->> 'user_role' = 'super_admin');
