-- F-009 (region update): New users must select a region on the policy
-- acknowledgement form. The accept_policy() RPC is extended to accept a
-- p_region_id argument and update region_id on the profile atomically with
-- policy_accepted_at — preventing the Default (id=0) placeholder from
-- persisting into the active user record.

-- Drop and recreate because the function signature changes.
drop function if exists public.accept_policy();

create function public.accept_policy(p_region_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid              uuid   := auth.uid();
  v_role             text   := auth.jwt() ->> 'user_role';
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

  if p_region_id is null or p_region_id <= 0 then
    raise exception 'a valid region must be selected'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Verify the region exists.
  perform 1 from public.regions where id = p_region_id;
  if not found then
    raise exception 'region % does not exist', p_region_id
      using errcode = 'foreign_key_violation';
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
    set policy_accepted_at = now(),
        region_id          = p_region_id
  where auth_user_id = v_uid
    and deleted_at is null;
end;
$$;

revoke execute on function public.accept_policy(bigint) from public;
grant  execute on function public.accept_policy(bigint) to authenticated;

comment on function public.accept_policy(bigint) is
  'Sets policy_accepted_at = now() and region_id = p_region_id for the calling '
  'pending user. Raises if the caller is not pending, has already accepted, or '
  'p_region_id is not a valid non-default region. '
  'SECURITY DEFINER — bypasses column-level UPDATE restrictions on policy_accepted_at.';
