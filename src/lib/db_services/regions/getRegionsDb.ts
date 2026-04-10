import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { BBox } from '@/lib/geoUploader';

export type RegionRow = Database['public']['Tables']['regions']['Row'];

export interface RegionRecord {
  id: number;
  name: string;
  /** WGS84 bounding box [minLng, minLat, maxLng, maxLat], or null if unrestricted. */
  bbox: BBox | null;
}

export interface GetRegionsDbResult {
  data: RegionRecord[] | null;
  error: Error | null;
}

/**
 * Fetches all selectable regions (id > 0) ordered by name.
 *
 * Region 0 ("Default") is the placeholder assigned to new profiles by the
 * handle_new_user trigger — it is not a real region and must not appear in
 * any user-facing picker. RLS enforced server-side (anon + all roles can SELECT).
 *
 * The `bbox` geometry column is returned as a GeoJSON string via ST_AsGeoJSON
 * and parsed here into [minLng, minLat, maxLng, maxLat] order.
 */
export async function getRegionsDb(
  client: SupabaseClient<Database>
): Promise<GetRegionsDbResult> {
  const { data, error } = await (client
    .from('regions')
    .select('id, name, ST_AsGeoJSON(bbox) as bbox_geojson')
    .gt('id', 0)
    .order('name') as unknown as Promise<{
    data: Array<{
      id: number;
      name: string;
      bbox_geojson: string | null;
    }> | null;
    error: { message: string } | null;
  }>);

  if (error) return { data: null, error: new Error(error.message) };

  const records: RegionRecord[] = (data ?? []).map((row) => {
    const bbox = parseBBoxFromGeoJSON(row.bbox_geojson);
    return { id: row.id, name: row.name, bbox };
  });

  return { data: records, error: null };
}

function parseBBoxFromGeoJSON(raw: unknown): BBox | null {
  if (typeof raw !== 'string') return null;
  try {
    const geojson = JSON.parse(raw) as { coordinates?: number[][][] };
    const ring = geojson.coordinates?.[0];
    if (!ring || ring.length < 4) return null;
    const lngs = ring.map((p) => p[0]);
    const lats = ring.map((p) => p[1]);
    return [
      Math.min(...lngs),
      Math.min(...lats),
      Math.max(...lngs),
      Math.max(...lats),
    ];
  } catch {
    return null;
  }
}
