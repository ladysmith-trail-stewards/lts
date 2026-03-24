import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

type TrailRow =
  Database['public']['Functions']['get_trails']['Returns'][number];

export interface GetTrailsDbArgs {
  /** When true, hidden trails are included (subject to RLS). */
  hidden?: boolean;
}

export interface GetTrailsDbResult {
  data: TrailRow[] | null;
  error: Error | null;
}

/** Fetches trails via the `get_trails` RPC. RLS enforced server-side. */
export async function getTrailsDb(
  client: SupabaseClient<Database>,
  { hidden = false }: GetTrailsDbArgs = {}
): Promise<GetTrailsDbResult> {
  const { data, error } = await client.rpc('get_trails', { hidden });
  if (error) return { data: null, error: new Error(error.message) };
  return { data, error: null };
}
