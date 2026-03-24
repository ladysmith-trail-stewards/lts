import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  getTrailsDb,
  type TrailRow,
} from '@/lib/db_services/trails/getTrailsDb';

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
 * Fetches all accessible trails from the `trails_view` view.
 * Hidden trails are excluded by default; pass `{ hidden: true }` to include them.
 * RLS is enforced server-side — results reflect the caller's access level.
 */
export function useTrails(opts: { hidden?: boolean } = {}) {
  const [state, setState] = useState<State>({
    trails: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
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

    fetch();
    return () => {
      cancelled = true;
    };
  }, [opts.hidden]);

  return state;
}
