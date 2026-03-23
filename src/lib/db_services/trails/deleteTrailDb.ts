import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export interface DeleteTrailDbArgs {
  id: number;
}

export interface DeleteTrailDbResult {
  error: Error | null;
}

/** Deletes a trail row by id. RLS enforced server-side. */
export async function deleteTrailDb(
  client: SupabaseClient<Database>,
  { id }: DeleteTrailDbArgs
): Promise<DeleteTrailDbResult> {
  const { error } = await client.from('trails').delete().eq('id', id);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
