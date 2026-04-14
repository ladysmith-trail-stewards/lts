import { useEffect, useRef, useReducer } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getTrailElevationDb } from '@/lib/db_services/trails/getTrailElevationDb';
import {
  buildProfileFrom4d,
  buildProfileFromMapboxTerrain,
  type ElevationPoint,
} from '@/lib/map/elevationProfile';
import type { Trail } from '@/hooks/useTrails';

type MapboxMapWithTerrain = Parameters<typeof buildProfileFromMapboxTerrain>[1];

export type ElevationProfileState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: ElevationPoint[] }
  | { status: 'error'; message: string };

type Action =
  | { type: 'RESET' }
  | { type: 'LOADING' }
  | { type: 'READY'; data: ElevationPoint[] }
  | { type: 'ERROR'; message: string };

function reducer(
  _state: ElevationProfileState,
  action: Action
): ElevationProfileState {
  switch (action.type) {
    case 'RESET':
      return { status: 'idle' };
    case 'LOADING':
      return { status: 'loading' };
    case 'READY':
      return { status: 'ready', data: action.data };
    case 'ERROR':
      return { status: 'error', message: action.message };
  }
}

/**
 * Fetches and normalises the elevation profile for a trail.
 *
 * - Case A: Uses `geom4d` from `trail_elevations` when available.
 * - Case B: Falls back to Mapbox terrain sampling when `geom4d` is absent.
 *
 * The `map` argument is required for the Case B fallback. If it is `null` the
 * hook stays in `loading` state until the map is ready.
 */
export function useElevationProfile(
  trail: Trail | null,
  map: MapboxMapWithTerrain | null
): ElevationProfileState {
  const [state, dispatch] = useReducer(reducer, { status: 'idle' });
  // Keep a stable ref so the async load() closure always uses the latest dispatch.
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  });

  useEffect(() => {
    if (!trail) {
      dispatchRef.current({ type: 'RESET' });
      return;
    }

    let cancelled = false;
    dispatchRef.current({ type: 'LOADING' });

    async function load() {
      // Case A — prefer DB 4D geometry
      const { data: elevRow, error } = await getTrailElevationDb(
        supabase,
        trail!.id
      );

      if (cancelled) return;

      if (error) {
        dispatchRef.current({ type: 'ERROR', message: error.message });
        return;
      }

      if (elevRow?.geom4d) {
        const points = buildProfileFrom4d(elevRow.geom4d);
        if (!cancelled) dispatchRef.current({ type: 'READY', data: points });
        return;
      }

      // Case B — fall back to Mapbox terrain
      if (!map) {
        // Map not ready yet; stay in loading — effect re-runs when map changes.
        return;
      }

      const coords = trail!.geometry_geojson.coordinates as [number, number][];
      try {
        const points = buildProfileFromMapboxTerrain(coords, map);
        if (!cancelled) dispatchRef.current({ type: 'READY', data: points });
      } catch (err) {
        if (!cancelled)
          dispatchRef.current({
            type: 'ERROR',
            message: err instanceof Error ? err.message : 'Unknown error',
          });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [trail?.id, map]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
