import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export interface DeleteTrailsDbResult {
  error: Error | null;
}

/**
 * Deletes one or more trails by id.
 *
 * Uses a plain `.delete().in()` — no RPC required.
 * RLS enforced server-side (anon and user roles are blocked by policy).
 * Missing ids are a silent no-op (PostgREST returns 204 with 0 rows affected).
 */
export async function deleteTrailsDb(
  client: SupabaseClient<Database>,
  ids: number | number[]
): Promise<DeleteTrailsDbResult> {
  const idArray = Array.isArray(ids) ? ids : [ids];
  const { error } = await client.from('trails').delete().in('id', idArray);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
