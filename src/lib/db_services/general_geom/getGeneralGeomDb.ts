import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export interface GeneralGeomRow {
  id: number;
  collection_id: number;
  collection_label: string;
  feature_collection_type: string;
  region_id: number;
  collection_visibility: 'public' | 'private' | 'shared';
  collection_style: Record<string, unknown>;
  type: string;
  subtype: string | null;
  visibility: 'public' | 'private' | 'shared';
  label: string;
  description: string | null;
  geometry_geojson: GeoJSON.Geometry;
  geometry_type: string;
}

export interface GetGeneralGeomDbResult {
  data: GeneralGeomRow[] | null;
  error: Error | null;
}

export async function getGeneralGeomDb(
  client: SupabaseClient<Database>
): Promise<GetGeneralGeomDbResult> {
  const typedClient = client as unknown as {
    from: (name: string) => {
      select: (query: string) => Promise<{
        data: GeneralGeomRow[] | null;
        error: { message: string } | null;
      }>;
    };
  };

  const { data, error } = await typedClient
    .from('general_geom_view')
    .select(
      'id, collection_id, collection_label, feature_collection_type, region_id, collection_visibility, collection_style, type, subtype, visibility, label, description, geometry_geojson, geometry_type'
    );

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data ?? [], error: null };
}
