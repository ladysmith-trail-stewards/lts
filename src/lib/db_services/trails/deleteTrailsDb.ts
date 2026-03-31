import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export interface DeleteTrailsDbResult {
  error: Error | null;
}

/**
 * Soft-deletes one or more trails by setting deleted_at = now() via the
 * `soft_delete_trails` RPC (SECURITY DEFINER).
 *
 * Using an RPC rather than a bare .update() ensures that only deleted_at is
 * written — a raw UPDATE call would allow the caller to change any column
 * (name, geometry, etc.) in the same request, since RLS UPDATE policies
 * cannot restrict individual columns.
 *
 * Role enforcement is handled inside the RPC:
 *   super_admin  → any trail
 *   admin        → own region only
 *   super_user   → own region only
 *   all others   → permission denied (error returned)
 *
 * Missing ids are a silent no-op (UPDATE … WHERE id = ANY(…) matches 0 rows).
 * Soft-deleted trails are excluded from trails_view automatically.
 */
export async function deleteTrailsDb(
  client: SupabaseClient<Database>,
  ids: number | number[]
): Promise<DeleteTrailsDbResult> {
  const idArray = Array.isArray(ids) ? ids : [ids];
  const { error } = await client.rpc('soft_delete_trails', { ids: idArray });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
