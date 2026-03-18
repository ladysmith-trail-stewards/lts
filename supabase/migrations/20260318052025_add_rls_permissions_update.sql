-- Block all direct modifications to permissions by non-service-role users.
-- The existing "Admins can manage all permissions" policy covers service_role.
-- Regular authenticated users should never be able to INSERT, UPDATE, or DELETE
-- their own or others' permissions rows.

-- Explicitly deny UPDATE for authenticated role (no policy = no access)
-- The existing select-only policy for authenticated users is sufficient;
-- we just need to ensure no UPDATE/INSERT/DELETE policy exists for them.
-- This migration serves as documentation that the omission is intentional.

-- However, the current "Admins can manage all permissions" policy uses
-- auth.role() = 'service_role' which only matches the service_role JWT.
-- Authenticated users have no UPDATE policy → already blocked.
-- The test failure revealed PostgREST was returning null error on a no-op update.
-- Add explicit RESTRICT policies to surface an actual error.

create policy "permissions: authenticated cannot insert"
  on public.permissions for insert
  to authenticated
  with check (false);

create policy "permissions: authenticated cannot update"
  on public.permissions for update
  to authenticated
  using (false);

create policy "permissions: authenticated cannot delete"
  on public.permissions for delete
  to authenticated
  using (false);
