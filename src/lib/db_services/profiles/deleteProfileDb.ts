import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export interface DeleteProfileDbResult {
  error: Error | null;
}

/**
 * Soft-deletes one or more profiles by setting deleted_at = now() via the
 * `soft_delete_profiles` RPC (SECURITY DEFINER).
 *
 * Using an RPC rather than a bare .update() ensures that only deleted_at is
 * written — column-level security blocks direct UPDATE of deleted_at.
 *
 * Role enforcement is handled inside the RPC:
 *   super_admin  → any profile
 *   admin        → own region only
 *   Any auth user → own profile only (self-deletion)
 *   All others   → permission denied (error returned)
 *
 * Missing ids are a silent no-op (UPDATE … WHERE id = ANY(…) matches 0 rows).
 */
export async function deleteProfileDb(
  client: SupabaseClient<Database>,
  ids: number | number[]
): Promise<DeleteProfileDbResult> {
  const idArray = Array.isArray(ids) ? ids : [ids];
  const { error } = await client.rpc('soft_delete_profiles', { ids: idArray });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
