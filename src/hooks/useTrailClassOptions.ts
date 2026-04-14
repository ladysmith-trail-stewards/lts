import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  getTrailClassOptionsDb,
  type TrailClassOption,
} from '@/lib/db_services/trails/getTrailClassOptionsDb';

type State = {
  options: TrailClassOption[];
  loading: boolean;
  error: string | null;
};

/**
 * Fetches the ordered list of trail class options from the
 * `trail_class_options` view. Accessible to all callers (anon and
 * authenticated).
 */
export function useTrailClassOptions() {
  const [state, setState] = useState<State>({
    options: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((s) => ({ ...s, loading: true, error: null }));

      const { data, error } = await getTrailClassOptionsDb(supabase);

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
