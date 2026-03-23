-- ============================================================
-- Fix profiles + regions RLS policies
--
-- Changes:
--   profiles:
--     1. super_admin: retains unrestricted access (no change)
--     2. super_user: add own-record select/update (same as user)
--   regions:
--     3. authenticated roles: add explicit SELECT (all roles)
--     4. super_admin: add INSERT, UPDATE, DELETE
-- ============================================================

-- ------------------------------------------------------------
-- 1. super_admin retains unrestricted access to all profiles
--    (policies already exist in initial_schema — no changes needed)
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 2. Add super_user own-record policies (same as user)
-- ------------------------------------------------------------
create policy "profiles: super_user select own"
  on public.profiles for select
  using (auth_user_id = auth.uid());

create policy "profiles: super_user update own"
  on public.profiles for update
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- ------------------------------------------------------------
-- 3. Regions: all authenticated roles can SELECT
-- ------------------------------------------------------------
create policy "regions: authenticated select"
  on public.regions for select
  using (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- 4. Regions: super_admin can INSERT, UPDATE, DELETE
-- ------------------------------------------------------------
create policy "regions: super_admin insert"
  on public.regions for insert
  with check (public.get_my_role() = 'super_admin');

create policy "regions: super_admin update"
  on public.regions for update
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "regions: super_admin delete"
  on public.regions for delete
  using (public.get_my_role() = 'super_admin');
