import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { toJson } from '@/lib/utils';
import type {
  TrailUpsertFeature,
  TrailUpsertProperties,
} from './trailSchemas';

export type { TrailUpsertFeature, TrailUpsertProperties } from './trailSchemas';

/** @deprecated Use TrailUpsertFeature */
export type TrailFeature = TrailUpsertFeature;
/** @deprecated Use TrailUpsertProperties */
export type TrailFeatureProperties = TrailUpsertProperties;

type UpsertTrailRpcRow =
  Database['public']['Functions']['upsert_trails']['Returns'][number];

export type UpsertTrailResult = UpsertTrailRpcRow & { message: string | null };

export interface UpsertTrailsDbResult {
  results: UpsertTrailResult[];
  allOk: boolean;
  error: Error | null;
}

/**
 * Upserts one or more trails via the `upsert_trails` RPC.
 *
 * Accepts an array of GeoJSON Feature objects. Each Feature with a
 * `properties.id` triggers an UPDATE; without an id it triggers an INSERT.
 * Geometry is converted from GeoJSON to PostGIS server-side.
 *
 * Never throws — data errors (bad geometry, not-found id) are collected
 * per-row in `results`.  RLS / permission errors abort the entire batch and
 * surface as a top-level `error` (results will be empty).
 * RLS enforced server-side (caller must be admin / super_user / super_admin).
 */
export async function upsertTrailsDb(
  client: SupabaseClient<Database>,
  features: TrailUpsertFeature | TrailUpsertFeature[]
): Promise<UpsertTrailsDbResult> {
  const featureArray = Array.isArray(features) ? features : [features];

  const { data, error } = await client.rpc('upsert_trails', {
    features: toJson(featureArray),
  });

  if (error) {
    return {
      results: [],
      allOk: false,
      error: new Error(error.message),
    };
  }

  const results = (data ?? []) as UpsertTrailResult[];
  return {
    results,
    allOk: results.every((r) => r.ok),
    error: null,
  };
}
