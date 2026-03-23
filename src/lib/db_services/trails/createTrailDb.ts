import type { Database } from '@/lib/supabase/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

type TrailInsert = Database['public']['Tables']['trails']['Insert'];
type TrailRow = Database['public']['Tables']['trails']['Row'];

export type CreateTrailDbArgs = Omit<
  TrailInsert,
  'id' | 'created_at' | 'updated_at'
>;

export interface CreateTrailDbResult {
  data: Pick<TrailRow, 'id'> | null;
  error: Error | null;
}

/** Inserts a new trail row and returns its generated id. RLS enforced server-side. */
export async function createTrailDb(
  client: SupabaseClient<Database>,
  args: CreateTrailDbArgs
): Promise<CreateTrailDbResult> {
  const { data, error } = await client
    .from('trails')
    .insert(args)
    .select('id')
    .single();

  if (error) return { data: null, error: new Error(error.message) };
  return { data, error: null };
}
