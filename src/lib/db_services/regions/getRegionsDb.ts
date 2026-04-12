import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export interface RegionRecordMeta {
  id: number;
  name: string;
}

export interface RegionRecord extends RegionRecordMeta {
  bbox_arr: [number, number, number, number] | null; // [minLng, minLat, maxLng, maxLat]
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
    .from('regions_with_bbox')
    .select(`id, name, bbox_arr`)
    .gt('id', 0)
    .order('name');

  if (error) return { data: null, error: new Error(error.message) };

  const records: RegionRecord[] = (data ?? []).map((row) => ({
    id: row.id!,
    name: row.name!,
    bbox_arr: row.bbox_arr as [number, number, number, number] | null,
  }));

  return { data: records as never, error: null };
}
