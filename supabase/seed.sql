-- Seed data for local development
-- Add INSERT statements here to populate the database with test data.
-- Password for all seed users: "password123"

-- ============================================================
-- Auth users (inserted directly into auth.users)
-- ============================================================
insert into auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  role,
  aud,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
) values
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'user@test.com',
    crypt('password123', gen_salt('bf')),
    now(),
    'authenticated',
    'authenticated',
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    false,
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'admin@test.com',
    crypt('password123', gen_salt('bf')),
    now(),
    'authenticated',
    'authenticated',
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    false,
    '', '', '', ''
  );

-- ============================================================
-- Profiles
-- Inserted with service_role bypass (seed runs as superuser)
-- ============================================================
insert into public.profiles (auth_user_id, name, user_type) values
  ('00000000-0000-0000-0000-000000000001', 'Test User',  'member'),
  ('00000000-0000-0000-0000-000000000002', 'Admin User', 'admin');

-- ============================================================
-- Permissions
-- The trigger creates default rows on profile insert,
-- so we only need to elevate the admin.
-- ============================================================
update public.permissions
set
  can_read   = true,
  can_write  = true,
  can_delete = true,
  is_admin   = true
where profile_id = (
  select id from public.profiles where name = 'Admin User'
);
