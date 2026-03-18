-- Admin-only view joining profiles, permissions, and auth.users (for email).
-- RLS does not apply to views, so we secure access via the is_admin() check
-- baked into the view definition with security_invoker = true on the function.

create or replace function public.get_admin_users()
returns table (
  profile_id   bigint,
  auth_user_id uuid,
  email        text,
  name         text,
  user_type    text,
  phone        text,
  bio          text,
  is_admin     boolean,
  can_read     boolean,
  can_write    boolean,
  can_delete   boolean,
  created_at   timestamptz
)
language sql
security definer
stable
as $$
  select
    p.id          as profile_id,
    p.auth_user_id::uuid,
    u.email::text,
    p.name,
    p.user_type,
    p.phone,
    p.bio,
    pm.is_admin,
    pm.can_read,
    pm.can_write,
    pm.can_delete,
    p.created_at
  from public.profiles p
  join auth.users u    on u.id = p.auth_user_id::uuid
  join public.permissions pm on pm.profile_id = p.id
  where public.is_admin()  -- only admins can call this
  order by p.created_at desc;
$$;
