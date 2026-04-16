import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  getGeneralGeomDb,
  type GeneralGeomRow,
} from '@/lib/db_services/general_geom/getGeneralGeomDb';

type State = {
  features: GeneralGeomRow[];
  loading: boolean;
  error: string | null;
};

export function useGeneralGeom() {
  const [state, setState] = useState<State>({
    features: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((s) => ({ ...s, loading: true, error: null }));
      const { data, error } = await getGeneralGeomDb(supabase);

      if (cancelled) return;

      if (error) {
        setState({ features: [], loading: false, error: error.message });
        return;
      }

      setState({ features: data ?? [], loading: false, error: null });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
