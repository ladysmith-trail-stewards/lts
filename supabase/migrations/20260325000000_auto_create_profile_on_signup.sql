-- ============================================================
-- Auto-create a profile row when a new auth user is created.
-- Assigns role 'user' and region_id 0 (Default) by default.
-- Name falls back to: full_name metadata → email prefix → user id.
-- ============================================================

-- Region 0 is a placeholder used for new users before they are assigned a region.
insert into public.regions (id, name) values (0, 'Default')
on conflict (id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _name text;
begin
  -- Skip if a profile already exists for this auth user
  if exists (select 1 from public.profiles where auth_user_id = new.id) then
    return new;
  end if;

  -- Derive a display name from Google/OAuth metadata or email
  _name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(split_part(new.email, '@', 1)), ''),
    new.id::text
  );

  -- Ensure uniqueness by appending the short user id if the name is taken
  if exists (select 1 from public.profiles where name = _name) then
    _name := _name || '_' || left(new.id::text, 8);
  end if;

  insert into public.profiles (auth_user_id, name, role, region_id)
  values (new.id, _name, 'user', 0);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
