import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export interface GeneralGeomCollectionImportInput {
  label: string;
  description?: string | null;
  visibility: 'public' | 'private' | 'shared';
  feature_collection_type: string;
  style?: Record<string, unknown>;
}

export interface GeneralGeomFeatureImportMapper {
  type: { field: string; fallback: string };
  subtype: { field: string; fallback: string };
  visibility: { field: string; fallback: 'public' | 'private' | 'shared' };
  description: {
    field: string;
    fallback: string;
    include_props_json: boolean;
  };
  label: {
    field: string;
    fallback: string;
    auto_increment_suffix: string;
  };
}

export interface ImportGeneralGeomCollectionDbResult {
  results: Array<{ ok: boolean; id: number | null; message: string | null }>;
  allOk: boolean;
  error: Error | null;
}

export async function importGeneralGeomCollectionDb(
  client: SupabaseClient<Database>,
  args: {
    collection: GeneralGeomCollectionImportInput;
    features: GeoJSON.Feature[];
    sourceEpsg?: number;
  }
): Promise<ImportGeneralGeomCollectionDbResult> {
  const rpc = client.rpc as unknown as (
    fn: string,
    params: Record<string, unknown>
  ) => Promise<{
    data: Array<{
      ok: boolean;
      id: number | null;
      message: string | null;
    }> | null;
    error: { message: string } | null;
  }>;

  const { data, error } = await rpc('import_general_geom_collection', {
    p_collection: args.collection,
    p_features: args.features,
    p_source_epsg: args.sourceEpsg ?? 4326,
  });

  if (error) {
    return { results: [], allOk: false, error: new Error(error.message) };
  }

  const results = data ?? [];
  return {
    results,
    allOk: results.every((r) => r.ok),
    error: null,
  };
}
