-- Add missing updated_at columns and block_deleted_at / set_updated_at triggers
-- to regions and profiles.
--
-- regions: super_admin-only soft-delete via soft_delete_regions() RPC.
--          The trigger uses NONE/NONE/NONE so every non-super_admin role is
--          denied by block_deleted_at_update (super_admin always bypasses it).
--
-- profiles: set_updated_at trigger only — soft-delete already covered by the
--           existing profiles_block_deleted_at trigger (20260401 / 20260411).
--
-- The auto_attach_block_deleted_at event trigger fires on ALTER TABLE and
-- would try to create triggers that already exist. Disable it around the
-- ALTER TABLE statements and manage all triggers manually below.

alter event trigger auto_attach_block_deleted_at disable;

-- ---------------------------------------------------------------------------
-- regions
-- ---------------------------------------------------------------------------

alter table public.regions
  add column if not exists updated_at timestamptz not null default now();

comment on column public.regions.updated_at is
  'Last-modified timestamp, maintained by the regions_set_updated_at trigger.';

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

comment on column public.profiles.updated_at is
  'Last-modified timestamp, maintained by the profiles_set_updated_at trigger.';

alter event trigger auto_attach_block_deleted_at enable;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger regions_set_updated_at
  before update on public.regions
  for each row execute function public.set_updated_at();

-- NONE / NONE / NONE → only super_admin (which always bypasses the check) may
-- set deleted_at on a region. The auto_attach event trigger created this with
-- default args (REGION/REGION/NONE) when deleted_at was added in 20260411;
-- drop and recreate with the correct args.
drop trigger if exists regions_block_deleted_at on public.regions;
create trigger regions_block_deleted_at
  before update on public.regions
  for each row execute function public.block_deleted_at_update('NONE', 'NONE', 'NONE');

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Column-level update grants (super_admin writes name/updated_at directly;
-- deleted_at is only touched via the security-definer soft_delete_regions RPC).
grant update (name, updated_at) on public.regions to authenticated;

-- Extend the existing column-level update grant to include updated_at.
grant update (updated_at) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- soft_delete_regions RPC
-- ---------------------------------------------------------------------------

create or replace function public.soft_delete_regions(ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := auth.jwt() ->> 'user_role';
begin
  if v_role <> 'super_admin' then
    raise exception 'permission denied: only super_admin may soft-delete regions'
      using errcode = 'insufficient_privilege';
  end if;

  -- super_admin bypasses block_deleted_at_update, so no set_config needed.
  update public.regions set deleted_at = now() where id = any(ids);
end;
$$;

revoke execute on function public.soft_delete_regions(bigint[]) from public;
grant  execute on function public.soft_delete_regions(bigint[]) to authenticated;

comment on function public.soft_delete_regions(bigint[]) is
  'Sets deleted_at = now() on regions. SECURITY DEFINER. super_admin only.';
