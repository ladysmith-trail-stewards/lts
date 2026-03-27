import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export interface DeleteTrailsDbResult {
  error: Error | null;
}

/**
 * Soft-deletes one or more trails by setting deleted_at to the current time.
 *
 * Uses a plain `.update()` — no RPC required.
 * RLS enforced server-side (anon and user roles are blocked by the UPDATE
 * policies; only admin, super_user, and super_admin may soft-delete).
 * Missing ids are a silent no-op (PostgREST returns 204 with 0 rows affected).
 * Soft-deleted trails are excluded from trails_view automatically.
 *
 * The timestamp is generated client-side as a UTC ISO-8601 string. This is
 * intentional: the value is stored as `timestamptz`, so PostgreSQL handles
 * timezone normalisation correctly regardless of the source of the timestamp.
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
