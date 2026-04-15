import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, TablesInsert } from '@/lib/supabase/database.types';
import { toJson } from '@/lib/utils';
import { StaleSessionError } from '@/lib/db_services/errors';

export { StaleSessionError } from '@/lib/db_services/errors';

type TrailInsert = TablesInsert<'trails'>;

export type TrailFeatureProperties = Omit<
  TrailInsert,
  'geometry' | 'created_at' | 'updated_at'
> & {
  id?: number | null;
  visibility?: 'public' | 'private' | 'shared';
};

export interface TrailFeature {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  properties: TrailFeatureProperties;
}

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
 *
 * Throws `StaleSessionError` when the DB detects a stale JWT role claim.
 * Callers should catch this, call supabase.auth.refreshSession(), and handle
 * the resulting SIGNED_OUT event (which AuthContext already redirects to /login).
 */
export async function upsertTrailsDb(
  client: SupabaseClient<Database>,
  features: TrailFeature | TrailFeature[]
): Promise<UpsertTrailsDbResult> {
  const featureArray = Array.isArray(features) ? features : [features];

  const { data, error } = await client.rpc('upsert_trails', {
    features: toJson(featureArray),
  });

  if (error) {
    if (error.code === 'P0001' && error.message.startsWith('stale_jwt:')) {
      throw new StaleSessionError();
    }
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
