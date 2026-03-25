-- ============================================================
-- User approval gate for Google SSO sign-ups.
--
-- New Google (OAuth) users land in the 'pending' role and have
-- zero RLS access until an admin promotes them to 'user'.
-- Email/password users (dev-seeded only) start as 'user'.
--
-- Using a role value instead of a separate approved column means:
--   • No policy changes needed — 'pending' falls through every
--     existing policy with no access granted.
--   • Approval = role promotion (UPDATE profiles SET role = 'user'),
--     which admins can already do via their existing UPDATE policies.
--   • Single source of truth: role covers both authorization level
--     and approval state.
--
-- Changes:
--   1. Add 'pending' to the app_role enum
--   2. Update handle_new_user() trigger: OAuth → role='pending', email → role='user'
-- ============================================================

-- 1. Add 'pending' to the role enum
--    Note: Postgres enum values cannot be removed once added.
alter type public.app_role add value if not exists 'pending';

-- 2. Update trigger function: OAuth users start as 'pending', email users as 'user'
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _name text;
  _role public.app_role;
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

  -- Email/password users (dev-seeded) are active immediately.
  -- OAuth (Google) sign-ups start as 'pending' until an admin approves them.
  if coalesce(new.raw_app_meta_data->>'provider', '') = 'email' then
    _role := 'user';
  else
    _role := 'pending';
  end if;

  insert into public.profiles (auth_user_id, name, role, region_id)
  values (new.id, _name, _role, 0);

  return new;
end;
$$;
