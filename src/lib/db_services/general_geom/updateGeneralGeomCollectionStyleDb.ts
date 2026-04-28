import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';

export interface UpdateGeneralGeomCollectionStyleDbResult {
  error: Error | null;
}

export async function updateGeneralGeomCollectionStyleDb(
  client: SupabaseClient<Database>,
  collectionId: number,
  style: Record<string, unknown>,
  label?: string
): Promise<UpdateGeneralGeomCollectionStyleDbResult> {
  const patch: { style: Json; label?: string } = { style: style as Json };
  if (label !== undefined) patch.label = label;

  const { error } = await client
    .from('general_geom_collection')
    .update(patch)
    .eq('id', collectionId);

  if (error) return { error: new Error(error.message) };
  return { error: null };
}
