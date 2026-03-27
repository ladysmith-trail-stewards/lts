import { useCallback, useEffect, useRef, useState } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import {
  SnapDirectSelect,
  SnapLineMode,
  SnapModeDrawStyles,
} from 'mapbox-gl-draw-snap-mode';
import type { Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';

export interface DrawTrailApi {
  /** Whether geometry-edit mode is currently active */
  isEditing: boolean;
  /** Whether snap-to-line/point is enabled (toggle with Space) */
  snapEnabled: boolean;
  /** Whether the drawn geometry differs from the version loaded on activate */
  isDirty: boolean;
  /** Activate geometry editing and load the given LineString into the draw layer */
  activateEdit: (geometry: GeoJSON.LineString) => void;
  /** Remove the draw control and reset all state */
  deactivateEdit: () => void;
  /** Return the current drawn LineString, or null if not editing */
  getCurrentGeometry: () => GeoJSON.LineString | null;
}

export function useDrawTrail(
  mapRef: React.RefObject<MapboxMap | null>
): DrawTrailApi {
  const drawRef = useRef<MapboxDraw | null>(null);
  const featureIdRef = useRef<string | null>(null);
  const snapRef = useRef(true);

  const [isEditing, setIsEditing] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  // Undo/redo history: indexed array of coordinate snapshots
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

  // Replace the draw feature coordinates and re-enter the appropriate select mode.
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
    (geometry: GeoJSON.LineString) => {
      const map = mapRef.current;
      if (!map) return;

      // Remove any stale instance first
      if (drawRef.current) {
        try {
          map.removeControl(drawRef.current);
        } catch {
          /* map may already have removed it */
        }
        drawRef.current = null;
      }

      const draw = new MapboxDraw({
        displayControlsDefault: false,
        userProperties: true,
        // SnapModeDrawStyles includes the default styles plus snap-guide styles
        styles: SnapModeDrawStyles,
        modes: {
          ...MapboxDraw.modes,
          snap_direct_select:
            SnapDirectSelect as unknown as MapboxDraw.DrawCustomMode,
          snap_line: SnapLineMode as unknown as MapboxDraw.DrawCustomMode,
        },
      });

      drawRef.current = draw;
      map.addControl(draw);

      const ids = draw.add({
        type: 'Feature',
        geometry: geometry,
        properties: {},
      });
      featureIdRef.current = ids[0];

      // Seed history with the original coordinates
      const initial = geometry.coordinates.map(
        (c) => [c[0], c[1]] as [number, number]
      );
      historyRef.current = [initial];
      historyIndexRef.current = 0;

      // Enter edit mode immediately
      const mode = snapRef.current ? 'snap_direct_select' : 'direct_select';
      draw.changeMode(mode as 'direct_select', { featureId: ids[0] });

      setIsEditing(true);
      setIsDirty(false);
    },
    [mapRef]
  );

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
    setIsEditing(false);
    setIsDirty(false);
  }, [mapRef]);

  const getCurrentGeometry = useCallback((): GeoJSON.LineString | null => {
    const draw = drawRef.current;
    const id = featureIdRef.current;
    if (!draw || !id) return null;
    const feature = draw.get(id);
    if (!feature || feature.geometry.type !== 'LineString') return null;
    return feature.geometry as GeoJSON.LineString;
  }, []);

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
        const mode = next ? 'snap_direct_select' : 'direct_select';
        draw.changeMode(mode as 'direct_select', { featureId: id });
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

  // ── Shift+Click → append / Shift+Alt+Click → prepend vertex ─────────────

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

      // Prevent switching to simple_select by re-entering direct_select immediately
      const coords = getFeatureCoords();
      if (!coords) return;
      const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];

      if (original.altKey) {
        // Prepend to start
        const next = [pt, ...coords] as [number, number][];
        applyCoords(next);
        pushHistory(next);
      } else {
        // Append to end
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
    snapEnabled,
    isDirty,
    activateEdit,
    deactivateEdit,
    getCurrentGeometry,
  };
}
