import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

/**
 * A single point in a 4D GeoJSON LineString (lon, lat, elevation, distance).
 * PostGIS serialises XYZM as [lng, lat, Z, M].
 */
export type Geom4dLineString = {
  type: 'LineString';
  coordinates: [number, number, number, number][];
};

export interface TrailElevationRow {
  trail_id: number;
  geom4d: Geom4dLineString | null;
  sample_interval_m: number;
  updated_at: string;
}

export interface GetTrailElevationDbResult {
  data: TrailElevationRow | null;
  error: Error | null;
}

/**
 * Fetches the elevation row for a single trail from `trail_elevations`.
 * Returns `data: null` (no error) when the trail has no elevation record.
 */
export async function getTrailElevationDb(
  client: SupabaseClient<Database>,
  trailId: number
): Promise<GetTrailElevationDbResult> {
  const { data, error } = await client
    .from('trail_elevations')
    .select('trail_id, geom4d, sample_interval_m, updated_at')
    .eq('trail_id', trailId)
    .maybeSingle();

  if (error) return { data: null, error: new Error(error.message) };
  if (!data) return { data: null, error: null };

  return {
    data: {
      trail_id: data.trail_id,
      geom4d: (data.geom4d as Geom4dLineString | null) ?? null,
      sample_interval_m: data.sample_interval_m,
      updated_at: data.updated_at,
    },
    error: null,
  };
}
