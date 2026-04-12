import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export interface RegionRecordMeta {
  id: number;
  name: string;
}

export interface RegionRecord extends RegionRecordMeta {
  bbox: [number, number, number, number] | null; // [minLng, minLat, maxLng, maxLat]
}

export interface GetRegionsDbOptions {
  metaOnly?: boolean;
}

export interface GetRegionsDbResult<T extends RegionRecordMeta = RegionRecord> {
  data: T[] | null;
  error: Error | null;
}

export async function getRegionsDb(
  client: SupabaseClient<Database>,
  options: GetRegionsDbOptions = {}
): Promise<
  GetRegionsDbResult<
    typeof options extends { metaOnly: true } ? RegionRecordMeta : RegionRecord
  >
> {
  if (options.metaOnly) {
    const { data, error } = await client
      .from('regions')
      .select(`id, name`)
      .gt('id', 0)
      .order('name');

    if (error) return { data: null, error: new Error(error.message) };

    const records: RegionRecordMeta[] = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
    }));

    return { data: records as never, error: null };
  }

  const { data, error } = await client
    .from('regions')
    .select(`id, name, bbox`)
    .gt('id', 0)
    .order('name');

  if (error) return { data: null, error: new Error(error.message) };

  const records: RegionRecord[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    bbox: parseBbox(row.bbox),
  }));

  return { data: records as never, error: null };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * PostgREST returns PostGIS geometry columns as a GeoJSON string.
 * For a Polygon bbox we extract [minLng, minLat, maxLng, maxLat] from the
 * first ring's coordinate envelope. Returns null for null/unparseable input.
 */
function parseBbox(raw: unknown): [number, number, number, number] | null {
  if (raw == null) return null;
  try {
    const geojson = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const coords: [number, number][] = geojson?.coordinates?.[0];
    if (!Array.isArray(coords) || coords.length < 4) return null;
    const lngs = coords.map(([lng]) => lng);
    const lats = coords.map(([, lat]) => lat);
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
