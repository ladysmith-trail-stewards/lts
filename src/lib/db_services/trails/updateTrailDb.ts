import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

type TrailUpdate = Database['public']['Tables']['trails']['Update'];
type TrailRow = Database['public']['Tables']['trails']['Row'];

export interface UpdateTrailDbArgs {
  id: number;
  changes: Omit<TrailUpdate, 'id' | 'created_at'>;
}

export interface UpdateTrailDbResult {
  data: Pick<TrailRow, 'id'> | null;
  error: Error | null;
}

/** Updates a trail row by id and returns the updated id. RLS enforced server-side. */
export async function updateTrailDb(
  client: SupabaseClient<Database>,
  { id, changes }: UpdateTrailDbArgs
): Promise<UpdateTrailDbResult> {
  const { data, error } = await client
    .from('trails')
    .update(changes)
    .eq('id', id)
    .select('id')
    .single();

  if (error) return { data: null, error: new Error(error.message) };
  return { data, error: null };
}
