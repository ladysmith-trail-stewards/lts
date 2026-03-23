import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

// ---------------------------------------------------------------------------
// GeoJSON input shape
// ---------------------------------------------------------------------------

export interface TrailFeatureProperties {
  /** Present for updates, omit for inserts. */
  id?: number | null;
  name: string;
  type?: string;
  trail_class?: string | null;
  activity_types?: string[] | null;
  direction?: string | null;
  hidden?: boolean;
  planned?: boolean;
  connector?: boolean;
  bike?: boolean;
  tf_popularity?: number | null;
  visibility?: 'public' | 'private' | 'shared';
  region_id: number;
}

export interface TrailFeature {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  properties: TrailFeatureProperties;
}

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

/** Per-row result returned by the `upsert_trails` RPC. */
export interface UpsertTrailResult {
  ok: boolean;
  id: number | null;
  message: string | null;
}

export interface UpsertTrailsDbResult {
  /** Per-row outcomes — always present even when some rows failed. */
  results: UpsertTrailResult[];
  /** True when every row succeeded. */
  allOk: boolean;
  /** Top-level RPC error (network / auth), distinct from per-row failures. */
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Service function
// ---------------------------------------------------------------------------

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
  features: TrailFeature | TrailFeature[]
): Promise<UpsertTrailsDbResult> {
  const featureArray = Array.isArray(features) ? features : [features];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc('upsert_trails', {
    features: featureArray,
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
