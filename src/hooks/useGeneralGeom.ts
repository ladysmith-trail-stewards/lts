import { useCallback, useEffect, useMemo, useState } from 'react';
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

export interface GeneralGeomCollectionOption {
  id: number;
  label: string;
  featureCollectionType: string;
  count: number;
}

export function useGeneralGeom() {
  const [state, setState] = useState<State>({
    features: [],
    loading: true,
    error: null,
  });
  const [visibleCollectionIds, setVisibleCollectionIds] = useState<number[]>(
    []
  );

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

      const nextFeatures = data ?? [];
      setState({ features: nextFeatures, loading: false, error: null });

      setVisibleCollectionIds((prev) => {
        const allIds = Array.from(
          new Set(nextFeatures.map((f) => f.collection_id))
        );
        if (prev.length === 0) return allIds;
        const merged = new Set(prev);
        for (const id of allIds) merged.add(id);
        return Array.from(merged);
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const collections = useMemo<GeneralGeomCollectionOption[]>(() => {
    const byCollection = new Map<number, GeneralGeomCollectionOption>();

    for (const feature of state.features) {
      const current = byCollection.get(feature.collection_id);
      if (current) {
        current.count += 1;
        continue;
      }

      byCollection.set(feature.collection_id, {
        id: feature.collection_id,
        label: feature.collection_label,
        featureCollectionType: feature.feature_collection_type,
        count: 1,
      });
    }

    return Array.from(byCollection.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [state.features]);

  const visibleCollectionIdSet = useMemo(
    () => new Set(visibleCollectionIds),
    [visibleCollectionIds]
  );

  const setCollectionVisible = useCallback(
    (collectionId: number, visible: boolean) => {
      setVisibleCollectionIds((prev) => {
        if (visible) {
          if (prev.includes(collectionId)) return prev;
          return [...prev, collectionId];
        }
        return prev.filter((id) => id !== collectionId);
      });
    },
    []
  );

  return {
    ...state,
    collections,
    visibleCollectionIds,
    visibleCollectionIdSet,
    setCollectionVisible,
  };
}
