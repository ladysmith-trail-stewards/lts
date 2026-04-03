import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

/**
 * A single row from the `trail_direction_options` view.
 *
 * Note: `trail_direction_options` is not yet included in `database.types.ts`
 * because it requires a running local Supabase instance to regenerate.
 * Run `pnpm db:types` after `pnpm db:reset` to include it automatically.
 */
export interface TrailDirectionOption {
  value: string;
  label: string;
  sort_order: number;
}

export interface GetTrailDirectionOptionsResult {
  data: TrailDirectionOption[] | null;
  error: Error | null;
}

/**
 * Fetches all trail direction options from the `trail_direction_options` view,
 * ordered by `sort_order`. Accessible to all callers (anon and authenticated).
 *
 * The view is read-only (backed by a SQL VALUES clause) and carries no RLS —
 * any client may query it.
 */
export async function getTrailDirectionOptionsDb(
  client: SupabaseClient<Database>
): Promise<GetTrailDirectionOptionsResult> {
  // Type cast required until `pnpm db:types` is regenerated after migration
  // 20260403000000 is applied; `trail_direction_options` is not yet in Database.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as SupabaseClient<any>)
    .from('trail_direction_options')
    .select('value, label, sort_order')
    .order('sort_order');

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as TrailDirectionOption[], error: null };
}
