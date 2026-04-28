import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  getGeneralGeomDb,
  type GeneralGeomRow,
} from '@/lib/db_services/general_geom/getGeneralGeomDb';
import { updateGeneralGeomCollectionStyleDb } from '@/lib/db_services/general_geom/updateGeneralGeomCollectionStyleDb';
import {
  parseCollectionStyle,
  type CollectionStyle,
} from '@/lib/map/generalGeomStyle';

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
  /** Parsed and validated style for this collection's map rendering. */
  style: CollectionStyle;
  /**
   * Unique (type, subtype) combinations found in this collection.
   * Used to build per-value colour maps in the style editor.
   */
  featureRows: Array<{ type: string; subtype: string | null; label: string }>;
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
    // key: `${collectionId}::${type}::${subtype ?? ''}` → sample label
    const rowKeys = new Map<string, string>();

    for (const feature of state.features) {
      const cid = feature.collection_id;
      const current = byCollection.get(cid);
      if (current) {
        current.count += 1;
      } else {
        byCollection.set(cid, {
          id: cid,
          label: feature.collection_label,
          featureCollectionType: feature.feature_collection_type,
          count: 1,
          style: parseCollectionStyle(feature.collection_style),
          featureRows: [],
        });
      }

      const rowKey = `${cid}::${feature.type}::${feature.subtype ?? ''}`;
      if (!rowKeys.has(rowKey)) {
        rowKeys.set(rowKey, feature.label);
        byCollection.get(cid)!.featureRows.push({
          type: feature.type,
          subtype: feature.subtype,
          label: feature.label,
        });
      }
    }

    // Sort rows: type → subtype → label
    for (const opt of byCollection.values()) {
      opt.featureRows.sort(
        (a, b) =>
          a.type.localeCompare(b.type) ||
          (a.subtype ?? '').localeCompare(b.subtype ?? '') ||
          a.label.localeCompare(b.label)
      );
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

  const updateCollectionStyle = useCallback(
    async (
      collectionId: number,
      style: CollectionStyle,
      label?: string
    ): Promise<Error | null> => {
      const { error } = await updateGeneralGeomCollectionStyleDb(
        supabase,
        collectionId,
        style as Record<string, unknown>,
        label
      );
      if (error) return error;
      // Optimistically update local feature state so the map re-renders
      setState((prev) => ({
        ...prev,
        features: prev.features.map((f) =>
          f.collection_id === collectionId
            ? {
                ...f,
                collection_style: style as Record<string, unknown>,
                ...(label !== undefined ? { collection_label: label } : {}),
              }
            : f
        ),
      }));
      return null;
    },
    []
  );

  return {
    ...state,
    collections,
    visibleCollectionIds,
    visibleCollectionIdSet,
    setCollectionVisible,
    updateCollectionStyle,
  };
}
