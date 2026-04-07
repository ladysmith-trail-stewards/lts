import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export type RegionRow = Database['public']['Tables']['regions']['Row'];

export interface GetRegionsDbResult {
  data: RegionRow[] | null;
  error: Error | null;
}

/**
 * Fetches all selectable regions (id > 0) ordered by name.
 *
 * Region 0 ("Default") is the placeholder assigned to new profiles by the
 * handle_new_user trigger — it is not a real region and must not appear in
 * any user-facing picker. RLS enforced server-side (anon + all roles can SELECT).
 */
export async function getRegionsDb(
  client: SupabaseClient<Database>
): Promise<GetRegionsDbResult> {
  const { data, error } = await client
    .from('regions')
    .select('id, name')
    .gt('id', 0)
    .order('name');

  if (error) return { data: null, error: new Error(error.message) };
  return { data, error: null };
}
