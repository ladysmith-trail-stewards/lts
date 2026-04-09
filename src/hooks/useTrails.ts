import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  getTrailsDb,
  type TrailRow,
} from '@/lib/db_services/trails/getTrailsDb';
import {
  upsertTrailsDb,
  type TrailFeature,
} from '@/lib/db_services/trails/upsertTrailsDb';
import { deleteTrailsDb } from '@/lib/db_services/trails/deleteTrailsDb';

export type Trail = Omit<TrailRow, 'geometry_geojson'> & {
  /** GeoJSON LineString geometry, typed narrowly for map consumers. */
  geometry_geojson: GeoJSON.LineString;
};

type State = {
  trails: Trail[];
  loading: boolean;
  error: string | null;
};

/**
 * Fetches all accessible trails from the `trails_view` view and exposes
 * mutation helpers that keep the local list in sync after a save or delete.
 *
 * Hidden trails are excluded by default; pass `{ hidden: true }` to include them.
 * RLS is enforced server-side — results reflect the caller's access level.
 */
export function useTrails(opts: { hidden?: boolean } = {}) {
  const [state, setState] = useState<State>({
    trails: [],
    loading: true,
    error: null,
  });

  // Stable ref so mutation helpers can read current trails without stale closure.
  const trailsRef = useRef<Trail[]>([]);
  useEffect(() => {
    trailsRef.current = state.trails;
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((s) => ({ ...s, loading: true, error: null }));

      const { data, error } = await getTrailsDb(supabase, {
        hidden: opts.hidden ?? false,
      });

      if (cancelled) return;

      if (error) {
        setState({ trails: [], loading: false, error: error.message });
        return;
      }

      setState({
        trails: (data ?? []) as unknown as Trail[],
        loading: false,
        error: null,
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [opts.hidden]);

  /**
   * Upsert a trail in the DB and patch the local list.
   * Returns the saved `Trail` on success, or throws with a human-readable message.
   */
  const saveTrail = useCallback(
    async (feature: TrailFeature): Promise<Trail> => {
      const { results, allOk, error } = await upsertTrailsDb(supabase, feature);

      if (error || !allOk) {
        throw new Error(
          error?.message ?? 'Save failed. Check your permissions.'
        );
      }

      const savedId = results[0].id;

      // Re-fetch the single row so we get all computed columns (distance_m, etc.).
      const { data } = await getTrailsDb(supabase, { ids: [savedId] });
      const saved = data?.[0] as unknown as Trail | undefined;

      if (!saved) {
        throw new Error('Save succeeded but trail could not be re-fetched.');
      }

      const current = trailsRef.current;
      const next = current.some((t) => t.id === savedId)
        ? current.map((t) => (t.id === savedId ? saved : t))
        : [...current, saved];

      setState((s) => ({ ...s, trails: next }));

      return saved;
    },
    []
  );

  /**
   * Soft-delete a trail in the DB and remove it from the local list.
   * Throws with a human-readable message on failure.
   */
  const deleteTrail = useCallback(async (id: number): Promise<void> => {
    const { error } = await deleteTrailsDb(supabase, id);

    if (error) {
      throw new Error(
        error.message ?? 'Delete failed. Check your permissions.'
      );
    }

    setState((s) => ({ ...s, trails: s.trails.filter((t) => t.id !== id) }));
  }, []);

  return { ...state, saveTrail, deleteTrail };
}
