import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export interface DeleteTrailsDbResult {
  error: Error | null;
}

/**
 * Soft-deletes one or more trails by setting deleted_at = now() directly.
 *
 * Role enforcement is handled by the `block_deleted_at_update` trigger:
 *   super_admin  → any trail
 *   admin        → own region only
 *   super_user   → own region only
 *   all others   → trigger raises permission denied
 *
 * Missing ids are a silent no-op. Soft-deleted trails are excluded from
 * trails_view automatically.
 */
export async function deleteTrailsDb(
  client: SupabaseClient<Database>,
  ids: number | number[]
): Promise<DeleteTrailsDbResult> {
  const idArray = Array.isArray(ids) ? ids : [ids];
  const { error } = await client
    .from('trails')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', idArray);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
