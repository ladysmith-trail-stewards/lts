import { useCallback, useEffect, useRef, useState } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import {
  SnapDirectSelect,
  SnapLineMode,
  SnapModeDrawStyles,
} from 'mapbox-gl-draw-snap-mode';
import type { Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';
import { TRAILS_LAYER } from '@/lib/map/config';

export interface DrawTrailApi {
  /** Whether geometry-edit mode is currently active */
  isEditing: boolean;
  /** Whether a new-trail draw session is active (snap_line / draw_line_string mode) */
  isCreating: boolean;
  /** Whether snap-to-line/point is enabled (toggle with Space) */
  snapEnabled: boolean;
  /** Whether the drawn geometry differs from the version loaded on activate */
  isDirty: boolean;
  /** Activate geometry editing and load the given LineString into the draw layer */
  activateEdit: (
    geometry: GeoJSON.LineString,
    callbacks?: {
      onClickNoTarget?: () => void;
      onClickOtherTrail?: (trailId: number) => void;
    }
  ) => void;
  /**
   * Activate create mode — opens a blank snap_line draw session with a
   * crosshair cursor. The user clicks to place waypoints; Enter / right-click
   * finishes the line. Once a point is placed isDirty becomes true.
   */
  activateCreate: () => void;
  /** Remove the draw control and reset all state */
  deactivateEdit: () => void;
  /** Return the current drawn LineString, or null if not editing/creating */
  getCurrentGeometry: () => GeoJSON.LineString | null;
  /**
   * If editing and an onClickOtherTrail callback was registered, fires it with
   * the given trail id. Used by useMapbox to route trail clicks during editing.
   */
  notifyOtherTrailClick: (trailId: number) => void;
}

// ── Shared draw options builder ───────────────────────────────────────────────

function buildDrawOptions(
  snapDirectSelectMode: Record<string, unknown>,
  map: MapboxMap
): MapboxDraw.MapboxDrawOptions {
  return {
    displayControlsDefault: false,
    userProperties: true,
    styles: SnapModeDrawStyles,
    modes: {
      ...MapboxDraw.modes,
      snap_direct_select:
        snapDirectSelectMode as unknown as MapboxDraw.DrawCustomMode,
      snap_line: SnapLineMode as unknown as MapboxDraw.DrawCustomMode,
    },
    snap: true,
    snapOptions: {
      snapPx: 10,
      snapToMidPoints: false,
      snapVertexPriorityDistance: 0.05,
      snapGetFeatures: (_m: MapboxMap, drawInstance: MapboxDraw) => [
        ...map.queryRenderedFeatures({ layers: [TRAILS_LAYER] }),
        ...drawInstance.getAll().features,
      ],
    },
  } as unknown as MapboxDraw.MapboxDrawOptions;
}

export function useDrawTrail(
  mapRef: React.RefObject<MapboxMap | null>
): DrawTrailApi {
  const drawRef = useRef<MapboxDraw | null>(null);
  const featureIdRef = useRef<string | null>(null);
  const snapRef = useRef(true);

  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  // Callbacks supplied at activateEdit time
  const onClickNoTargetRef = useRef<(() => void) | undefined>(undefined);
  const onClickOtherTrailRef = useRef<((id: number) => void) | undefined>(
    undefined
  );

  // Undo/redo history
  const historyRef = useRef<[number, number][][]>([]);
  const historyIndexRef = useRef(-1);

  // ── Internal helpers ──────────────────────────────────────────────────────

  function pushHistory(coords: [number, number][]) {
    historyRef.current = historyRef.current.slice(
      0,
      historyIndexRef.current + 1
    );
    historyRef.current.push(
      coords.map((c) => [c[0], c[1]] as [number, number])
    );
    historyIndexRef.current = historyRef.current.length - 1;
  }

  function getFeatureCoords(): [number, number][] | null {
    const draw = drawRef.current;
    const id = featureIdRef.current;
    if (!draw || !id) return null;
    const feature = draw.get(id);
    if (!feature || feature.geometry.type !== 'LineString') return null;
    return feature.geometry.coordinates as [number, number][];
  }

  function applyCoords(coords: [number, number][]) {
    const draw = drawRef.current;
    const id = featureIdRef.current;
    if (!draw || !id) return;
    draw.set({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id,
          geometry: { type: 'LineString', coordinates: coords },
          properties: {},
        },
      ],
    });
    const mode = snapRef.current ? 'snap_direct_select' : 'direct_select';
    draw.changeMode(mode as 'direct_select', { featureId: id });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  const activateEdit = useCallback(
    (
      geometry: GeoJSON.LineString,
      callbacks?: {
        onClickNoTarget?: () => void;
        onClickOtherTrail?: (trailId: number) => void;
      }
    ) => {
      const map = mapRef.current;
      if (!map) return;

      onClickNoTargetRef.current = callbacks?.onClickNoTarget;
      onClickOtherTrailRef.current = callbacks?.onClickOtherTrail;

      if (drawRef.current) {
        try {
          map.removeControl(drawRef.current);
        } catch {
          /* map may already have removed it */
        }
        drawRef.current = null;
      }

      const LockedSnapDirectSelect = {
        ...(SnapDirectSelect as unknown as Record<string, unknown>),
        clickNoTarget: () => {
          onClickNoTargetRef.current?.();
        },
        clickOnFeature: (
          _state: unknown,
          e: { featureTarget: { properties?: { id?: unknown } } }
        ) => {
          const rawId = e?.featureTarget?.properties?.id;
          if (rawId != null) {
            const id = Number(rawId);
            if (!isNaN(id)) onClickOtherTrailRef.current?.(id);
          }
        },
      };

      const draw = new MapboxDraw(
        buildDrawOptions(LockedSnapDirectSelect, map)
      );
      drawRef.current = draw;
      map.addControl(draw);

      const ids = draw.add({
        type: 'Feature',
        geometry: geometry,
        properties: {},
      });
      featureIdRef.current = ids[0];

      const initial = geometry.coordinates.map(
        (c) => [c[0], c[1]] as [number, number]
      );
      historyRef.current = [initial];
      historyIndexRef.current = 0;

      const mode = snapRef.current ? 'snap_direct_select' : 'direct_select';
      draw.changeMode(mode as 'direct_select', { featureId: ids[0] });

      setIsCreating(false);
      setIsEditing(true);
      setIsDirty(false);
    },
    [mapRef]
  );

  const activateCreate = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    onClickNoTargetRef.current = undefined;
    onClickOtherTrailRef.current = undefined;

    if (drawRef.current) {
      try {
        map.removeControl(drawRef.current);
      } catch {
        /* ignore */
      }
      drawRef.current = null;
    }

    const draw = new MapboxDraw(
      buildDrawOptions(
        SnapDirectSelect as unknown as Record<string, unknown>,
        map
      )
    );
    drawRef.current = draw;
    map.addControl(draw);

    // snap_line gives a crosshair cursor dedicated to placing waypoints
    draw.changeMode('snap_line' as 'draw_line_string');

    historyRef.current = [];
    historyIndexRef.current = -1;
    featureIdRef.current = null;

    setIsCreating(true);
    setIsEditing(true);
    setIsDirty(false);
  }, [mapRef]);

  const deactivateEdit = useCallback(() => {
    const map = mapRef.current;
    if (drawRef.current) {
      try {
        map?.removeControl(drawRef.current);
      } catch {
        /* ignore */
      }
      drawRef.current = null;
    }
    featureIdRef.current = null;
    historyRef.current = [];
    historyIndexRef.current = -1;
    setIsCreating(false);
    setIsEditing(false);
    setIsDirty(false);
  }, [mapRef]);

  const getCurrentGeometry = useCallback((): GeoJSON.LineString | null => {
    const draw = drawRef.current;
    if (!draw) return null;
    const id = featureIdRef.current;
    if (id) {
      const feature = draw.get(id);
      if (feature && feature.geometry.type === 'LineString')
        return feature.geometry as GeoJSON.LineString;
    }
    // Fallback for create mode before draw.create fires
    const all = draw.getAll();
    const line = all.features.find((f) => f.geometry.type === 'LineString');
    return line ? (line.geometry as GeoJSON.LineString) : null;
  }, []);

  // ── Capture featureId + seed history when a new line is finished ──────────

  useEffect(() => {
    if (!isCreating) return;
    const map = mapRef.current;
    if (!map) return;

    const onDrawCreate = (e: { features: GeoJSON.Feature[] }) => {
      const line = e.features[0];
      if (!line || !line.id || line.geometry.type !== 'LineString') return;
      featureIdRef.current = String(line.id);
      const coords = (line.geometry as GeoJSON.LineString).coordinates.map(
        (c) => [c[0], c[1]] as [number, number]
      );
      historyRef.current = [coords];
      historyIndexRef.current = 0;
      setIsDirty(true);
      // Transition into select mode so the user can adjust vertices
      drawRef.current?.changeMode(
        (snapRef.current
          ? 'snap_direct_select'
          : 'direct_select') as 'direct_select',
        { featureId: String(line.id) }
      );
    };

    map.on('draw.create', onDrawCreate);
    return () => {
      map.off('draw.create', onDrawCreate);
    };
  }, [isCreating, mapRef]);

  // ── Sync history on every user-driven draw.update ────────────────────────

  useEffect(() => {
    if (!isEditing) return;
    const map = mapRef.current;
    if (!map) return;

    const onDrawUpdate = () => {
      const coords = getFeatureCoords();
      if (coords) {
        pushHistory(coords);
        setIsDirty(true);
      }
    };

    map.on('draw.update', onDrawUpdate);
    return () => {
      map.off('draw.update', onDrawUpdate);
    };
  }, [isEditing, mapRef]);

  useEffect(() => {
    if (!isEditing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const draw = drawRef.current;
      const id = featureIdRef.current;
      if (!draw || !id) return;

      // Space → toggle snap mode
      if (e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const next = !snapRef.current;
        snapRef.current = next;
        setSnapEnabled(next);
        (
          draw as unknown as Record<string, Record<string, unknown>>
        ).options.snap = next;
        return;
      }

      // Shift+Delete → remove last vertex (at least 2 remain)
      if (e.key === 'Delete' && e.shiftKey) {
        e.preventDefault();
        const coords = getFeatureCoords();
        if (!coords || coords.length <= 2) return;
        const next = coords.slice(0, -1) as [number, number][];
        applyCoords(next);
        pushHistory(next);
        setIsDirty(true);
        return;
      }

      // Ctrl+Z → undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (historyIndexRef.current > 0) {
          historyIndexRef.current--;
          applyCoords(historyRef.current[historyIndexRef.current]);
          setIsDirty(historyIndexRef.current > 0);
        }
        return;
      }

      // Ctrl+Y / Ctrl+Shift+Z → redo
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'y' || (e.key === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        if (historyIndexRef.current < historyRef.current.length - 1) {
          historyIndexRef.current++;
          applyCoords(historyRef.current[historyIndexRef.current]);
          setIsDirty(true);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    const map = mapRef.current;
    if (!map) return;

    const onMapClick = (e: MapMouseEvent) => {
      const draw = drawRef.current;
      const id = featureIdRef.current;
      if (!draw || !id) return;
      const original = e.originalEvent as MouseEvent;
      if (!original.shiftKey) return;

      const coords = getFeatureCoords();
      if (!coords) return;
      const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];

      if (original.altKey) {
        const next = [pt, ...coords] as [number, number][];
        applyCoords(next);
        pushHistory(next);
      } else {
        const next = [...coords, pt] as [number, number][];
        applyCoords(next);
        pushHistory(next);
      }
      setIsDirty(true);
    };

    map.on('click', onMapClick);
    return () => {
      map.off('click', onMapClick);
    };
  }, [isEditing, mapRef]);

  return {
    isEditing,
    isCreating,
    snapEnabled,
    isDirty,
    activateEdit,
    activateCreate,
    deactivateEdit,
    getCurrentGeometry,
    notifyOtherTrailClick: (trailId: number) => {
      onClickOtherTrailRef.current?.(trailId);
    },
  };
}
