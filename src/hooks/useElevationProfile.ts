import { useEffect, useRef, useReducer } from 'react';
import {
  buildProfileFromCoords,
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
 * Derives the elevation profile for a trail.
 *
 * - Case A: Uses `elevation_coords` from `trails_view` when available.
 *           This is synchronous — no fetch needed, data already on the trail.
 * - Case B: Falls back to Mapbox terrain sampling when `elevation_coords` is
 *           absent. Requires `map` to be non-null.
 */
export function useElevationProfile(
  trail: Trail | null,
  map: MapboxMapWithTerrain | null
): ElevationProfileState {
  const [state, dispatch] = useReducer(reducer, { status: 'idle' });
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  });

  useEffect(() => {
    if (!trail) {
      dispatchRef.current({ type: 'RESET' });
      return;
    }

    // Case A — elevation_coords already on the trail from trails_view
    if (trail.elevation_coords && trail.elevation_coords.length > 0) {
      try {
        const points = buildProfileFromCoords(trail.elevation_coords);
        dispatchRef.current({ type: 'READY', data: points });
      } catch (err) {
        dispatchRef.current({
          type: 'ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
      return;
    }

    // Case B — fall back to Mapbox terrain
    if (!map) {
      // Map not ready yet; stay in loading until map is available.
      dispatchRef.current({ type: 'LOADING' });
      return;
    }

    const coords = trail.geometry_geojson.coordinates as [number, number][];
    try {
      const points = buildProfileFromMapboxTerrain(coords, map);
      dispatchRef.current({ type: 'READY', data: points });
    } catch (err) {
      dispatchRef.current({
        type: 'ERROR',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [trail?.id, trail?.elevation_coords, map]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
