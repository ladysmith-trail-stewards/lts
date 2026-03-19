-- RLS policies for public.profiles
--
-- Rules:
--   SELECT  — users can always read their own profile; admins can read all
--   INSERT  — admins only
--   UPDATE  — users can update their own profile; admins can update any
--   DELETE  — admins only

-- Helper function: returns true if the calling user has is_admin = true
create or replace function public.is_admin()
returns boolean language sql security definer stable
as $$
  select exists (
    select 1
    from public.profiles  p
    join public.permissions pm on pm.profile_id = p.id
    where p.auth_user_id = auth.uid()
      and pm.is_admin = true
  );
$$;

-- SELECT: own row OR admin
create policy "profiles: users can view own profile"
  on public.profiles for select
  using ( auth_user_id = auth.uid() );

create policy "profiles: admins can view all profiles"
  on public.profiles for select
  using ( public.is_admin() );

-- INSERT: admins only
create policy "profiles: admins can insert profiles"
  on public.profiles for insert
  with check ( public.is_admin() );

-- UPDATE: own row OR admin
create policy "profiles: users can update own profile"
  on public.profiles for update
  using  ( auth_user_id = auth.uid() )
  with check ( auth_user_id = auth.uid() );

create policy "profiles: admins can update any profile"
  on public.profiles for update
  using  ( public.is_admin() )
  with check ( public.is_admin() );

-- DELETE: admins only
create policy "profiles: admins can delete profiles"
  on public.profiles for delete
  using ( public.is_admin() );
