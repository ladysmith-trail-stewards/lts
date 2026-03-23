-- ============================================================
-- Trails: require authentication for SELECT
--
-- Removes the open "visibility = 'public'" policy that allowed
-- anonymous reads. All trail access now requires a logged-in user.
-- ============================================================
drop policy "trails: public visible to all" on public.trails;

create policy "trails: authenticated select public"
  on public.trails for select
  using (
    auth.role() = 'authenticated'
    and visibility = 'public'
  );
