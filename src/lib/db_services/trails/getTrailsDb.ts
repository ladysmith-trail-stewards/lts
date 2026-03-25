import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { TrailRow } from './trailSchemas';

export type { TrailRow } from './trailSchemas';

export interface GetTrailsDbArgs {
  /** When true, hidden trails are included (subject to RLS). */
  hidden?: boolean;
  /** When provided, only trails with these ids are returned. */
  ids?: number[];
}

export interface GetTrailsDbResult {
  data: TrailRow[] | null;
  error: Error | null;
}

/** Fetches trails from the `trails_view` view. RLS enforced server-side. */
export async function getTrailsDb(
  client: SupabaseClient<Database>,
  { hidden = false, ids }: GetTrailsDbArgs = {}
): Promise<GetTrailsDbResult> {
  let query = client.from('trails_view').select('*').order('id');

  if (!hidden) {
    query = query.eq('hidden', false);
  }

  if (ids !== undefined && ids.length > 0) {
    query = query.in('id', ids);
  }

  const { data, error } = await query;

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as unknown as TrailRow[], error: null };
}
