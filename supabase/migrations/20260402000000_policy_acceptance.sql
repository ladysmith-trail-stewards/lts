-- F-009: Policy Acknowledgement on Signup
-- Adds policy_accepted_at to profiles, the accept_policy() RPC,
-- and the policy_accepted claim to the custom_access_token_hook.

-- ── 1. Add column ─────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists policy_accepted_at timestamptz default null;

comment on column public.profiles.policy_accepted_at is
  'Timestamp when the user explicitly accepted the membership policy. '
  'NULL = not yet accepted. Written only by the accept_policy() RPC.';

-- ── 2. Grant pending users access to their own profile ───────────────────────
-- The initial schema SELECT policy excludes 'pending'. Replace it so that
-- pending users can read and update their own row (name, bio) while the
-- rest of the access rules remain unchanged.

drop policy if exists "profiles: select" on public.profiles;
create policy "profiles: select"
  on public.profiles for select
  using (
    auth_user_id = (select auth.uid())
    or (
      (select auth.jwt() ->> 'user_role') not in ('pending', 'anon')
      and (
        (select auth.jwt() ->> 'user_role') = 'super_admin'
        or (
          (select auth.jwt() ->> 'user_role') = 'admin'
          and region_id = (select (auth.jwt() ->> 'region_id')::bigint)
        )
      )
    )
  );

-- ── 3. accept_policy() RPC ────────────────────────────────────────────────────

create or replace function public.accept_policy()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid   := auth.uid();
  v_role text   := auth.jwt() ->> 'user_role';
  v_already_accepted timestamptz;
begin
  if v_uid is null then
    raise exception 'permission denied: must be authenticated'
      using errcode = 'insufficient_privilege';
  end if;

  if v_role <> 'pending' then
    raise exception 'permission denied: only pending users may accept the policy'
      using errcode = 'insufficient_privilege';
  end if;

  select policy_accepted_at
    into v_already_accepted
  from public.profiles
  where auth_user_id = v_uid
    and deleted_at is null;

  if v_already_accepted is not null then
    raise exception 'policy already accepted'
      using errcode = 'unique_violation';
  end if;

  update public.profiles
    set policy_accepted_at = now()
  where auth_user_id = v_uid
    and deleted_at is null;
end;
$$;

revoke execute on function public.accept_policy() from public;
grant  execute on function public.accept_policy() to authenticated;

comment on function public.accept_policy() is
  'Sets policy_accepted_at = now() for the calling pending user. '
  'Raises if the caller is not pending or has already accepted. '
  'SECURITY DEFINER — policy_accepted_at is not in the column-level UPDATE grant for authenticated.';

-- ── 4. Update custom_access_token_hook to stamp policy_accepted claim ─────────

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  claims             jsonb := coalesce(event->'claims', '{}'::jsonb);
  v_role             text;
  v_region           bigint;
  v_policy_accepted  boolean;
begin
  select p.role::text, p.region_id, (p.policy_accepted_at is not null)
    into v_role, v_region, v_policy_accepted
  from public.profiles p
  where p.auth_user_id = (event->>'user_id')::uuid
    and p.deleted_at is null
  limit 1;

  claims := jsonb_set(claims, '{user_role}',       to_jsonb(coalesce(v_role, 'pending')),                        true);
  claims := jsonb_set(claims, '{region_id}',        to_jsonb(coalesce(v_region, 0)),                              true);
  claims := jsonb_set(claims, '{is_admin}',         to_jsonb(coalesce(v_role in ('admin', 'super_admin'), false)), true);
  claims := jsonb_set(claims, '{policy_accepted}',  to_jsonb(coalesce(v_policy_accepted, false)),                 true);

  return jsonb_set(event, '{claims}', claims, true);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;

revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- ── 5. Update get_admin_users() to expose policy_accepted_at ─────────────────
-- Must DROP first — CREATE OR REPLACE cannot change a function's return type.

drop function if exists public.get_admin_users();

create function public.get_admin_users()
returns table (
  profile_id          bigint,
  auth_user_id        uuid,
  email               text,
  name                text,
  role                public.app_role,
  region_name         text,
  phone               text,
  bio                 text,
  created_at          timestamptz,
  policy_accepted_at  timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id          as profile_id,
    p.auth_user_id::uuid,
    u.email::text,
    p.name,
    p.role,
    r.name        as region_name,
    p.phone,
    p.bio,
    p.created_at,
    p.policy_accepted_at
  from public.profiles p
  join auth.users u on u.id = p.auth_user_id
  join public.regions r on r.id = p.region_id
  where (auth.jwt() ->> 'user_role') in ('admin', 'super_admin')
    and p.deleted_at is null
  order by p.created_at desc;
$$;

revoke execute on function public.get_admin_users() from public, anon;
grant  execute on function public.get_admin_users() to authenticated;
