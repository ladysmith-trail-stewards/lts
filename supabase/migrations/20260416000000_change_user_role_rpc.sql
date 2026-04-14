-- change_user_role(target_profile_id, new_role)
--
-- SECURITY DEFINER RPC that updates profiles.role and immediately revokes the
-- affected user's Supabase sessions via the Admin API (pg_net), forcing a
-- clean re-login with fresh JWT claims.
--
-- Permission model:
--   super_admin  — may change any profile to any role.
--   admin        — may only change profiles in their own region;
--                  may not promote to admin or super_admin.
--   all others   — raises insufficient_privilege.
--
-- The pg_net sign-out call is fire-and-forget: if it fails the role update is
-- NOT rolled back. The failure is surfaced in database logs via RAISE WARNING.
--
-- Required custom config (Supabase dashboard → Project Settings → Database →
-- Configuration → Custom config):
--   app.settings.supabase_url             — e.g. https://xxxx.supabase.co
--   app.settings.supabase_service_role_key — the service_role JWT

create or replace function public.change_user_role(
  target_profile_id bigint,
  new_role          app_role
)
returns table (id bigint, role app_role)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role   text;
  v_caller_region bigint;
  v_target_region bigint;
  v_auth_user_id  uuid;
  v_supa_url      text;
  v_service_key   text;
begin
  v_caller_role   := auth.jwt() ->> 'user_role';
  v_caller_region := (auth.jwt() ->> 'region_id')::bigint;

  if v_caller_role not in ('admin', 'super_admin') then
    raise exception 'insufficient_privilege'
      using errcode = 'insufficient_privilege';
  end if;

  select p.region_id, p.auth_user_id
    into v_target_region, v_auth_user_id
  from public.profiles p
  where p.id = target_profile_id
    and p.deleted_at is null;

  if not found then
    raise exception 'target profile % not found', target_profile_id;
  end if;

  if v_caller_role = 'admin' then
    if v_target_region is distinct from v_caller_region then
      raise exception 'insufficient_privilege'
        using errcode = 'insufficient_privilege';
    end if;

    if new_role in ('admin', 'super_admin') then
      raise exception 'insufficient_privilege'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  update public.profiles p
     set role = new_role
   where p.id = target_profile_id;

  begin
    v_supa_url    := current_setting('app.settings.supabase_url', true);
    v_service_key := current_setting('app.settings.supabase_service_role_key', true);

    if v_supa_url is not null and v_service_key is not null then
      -- v_auth_user_id is a uuid column — cast enforces the format and
      -- prevents any unexpected characters in the URL path segment.
      perform net.http_post(
        url     := v_supa_url || '/auth/v1/admin/users/' || v_auth_user_id::text || '/logout',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_service_key,
          'Content-Type',  'application/json'
        ),
        body    := '{}'::jsonb
      );
    end if;
  exception when others then
    raise warning 'change_user_role: pg_net sign-out failed for user %: %',
      v_auth_user_id, sqlerrm;
  end;

  return query
    select p.id, p.role
      from public.profiles p
     where p.id = target_profile_id;
end;
$$;

revoke execute on function public.change_user_role(bigint, app_role) from public, anon;
grant  execute on function public.change_user_role(bigint, app_role) to authenticated;
