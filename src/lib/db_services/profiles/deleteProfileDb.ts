import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export interface DeleteProfileDbResult {
  error: Error | null;
}

/**
 * Soft-deletes one or more profiles by setting deleted_at = now() directly.
 *
 * Role enforcement is handled by the `block_deleted_at_update` trigger:
 *   super_admin  → any profile
 *   admin        → own region or own profile
 *   super_user   → own profile only
 *   all others   → trigger raises permission denied
 *
 * Missing ids are a silent no-op.
 */
export async function deleteProfileDb(
  client: SupabaseClient<Database>,
  ids: number | number[]
): Promise<DeleteProfileDbResult> {
  const idArray = Array.isArray(ids) ? ids : [ids];
  const { error } = await client
    .from('profiles')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', idArray);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
