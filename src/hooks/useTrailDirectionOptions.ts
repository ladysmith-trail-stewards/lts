import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  getTrailDirectionOptionsDb,
  type TrailDirectionOption,
} from '@/lib/db_services/trails/getTrailDirectionOptionsDb';

type State = {
  options: TrailDirectionOption[];
  loading: boolean;
  error: string | null;
};

/**
 * Fetches the ordered list of trail direction options from the
 * `trail_direction_options` view. Accessible to all callers (anon and
 * authenticated).
 */
export function useTrailDirectionOptions() {
  const [state, setState] = useState<State>({
    options: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((s) => ({ ...s, loading: true, error: null }));

      const { data, error } = await getTrailDirectionOptionsDb(supabase);

      if (cancelled) return;

      if (error) {
        setState({ options: [], loading: false, error: error.message });
        return;
      }

      setState({ options: data ?? [], loading: false, error: null });
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
