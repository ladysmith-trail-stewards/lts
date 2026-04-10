import { supabase } from '@/lib/supabase/client';
import {
  upsertTrailsDb,
  type TrailFeature,
} from '@/lib/db_services/trails/upsertTrailsDb';
import type { UploaderConfig, RawFeature } from '@/lib/geoUploader';

function mapTrailFeature(
  raw: RawFeature,
  regionId: number | null
): { record: TrailFeature; label: string } | null {
  if (raw.geometry.type !== 'LineString') return null;

  const p = raw.properties;
  const name =
    (p['name'] as string | undefined) ??
    (p['title'] as string | undefined) ??
    raw.sourceFile.replace(/\.[^.]+$/, '');

  const record: TrailFeature = {
    type: 'Feature',
    geometry: raw.geometry as TrailFeature['geometry'],
    properties: {
      name,
      type: (p['type'] as string | undefined) ?? 'trail',
      region_id: regionId ?? (undefined as unknown as number),
      visibility: 'public',
      description: (p['desc'] as string | undefined) ?? null,
      planned: false,
      connector: false,
    },
  };

  return { record, label: name };
}

async function submitTrails(
  records: TrailFeature[]
): Promise<{ ok: boolean; message: string | null }[]> {
  const { results, error } = await upsertTrailsDb(supabase, records);

  if (error) {
    return records.map(() => ({ ok: false, message: error.message }));
  }

  return results.map((r) => ({ ok: r.ok, message: r.message ?? null }));
}

export const trailUploaderConfig: UploaderConfig<TrailFeature> = {
  title: 'Upload Trails',
  formats: ['geojson', 'gpx', 'kml'],
  geometryType: 'LineString',
  regionBased: true,
  noun: 'trail',
  mapFeature: mapTrailFeature,
  validate: (record) =>
    record.properties.name?.trim() ? null : 'Trail name is required.',
  submit: submitTrails,
};
