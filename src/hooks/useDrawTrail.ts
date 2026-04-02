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
  /**
   * Current sub-mode when editing:
   *   'draw'    — snap_line, placing new waypoints
   *   'move'    — snap_direct_select, dragging individual vertices
   *   'preview' — simple_select, trail visible with no handles; awaiting Save/Cancel
   *   null      — not editing
   */
  drawMode: 'draw' | 'move' | 'preview' | null;
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
      /** Called after Enter/right-click finishes the edit (geometry kept) */
      onFinishEdit?: () => void;
      /** Called after Escape cancels the edit (geometry discarded) */
      onCancelEdit?: () => void;
    }
  ) => void;
  /**
   * Activate create mode — opens a blank snap_line draw session.
   * If draw is already active and geometry exists, switches to snap_direct_select instead.
   */
  activateCreate: (callbacks?: {
    /** Called after Enter/right-click finishes the edit (geometry kept) */
    onFinishEdit?: () => void;
    /** Called after Escape cancels the edit (geometry discarded) */
    onCancelEdit?: () => void;
  }) => void;
  /**
   * "Draw" button handler — smart toggle:
   *   • No geometry yet → snap_line (place waypoints)
   *   • In snap_line    → snap_direct_select (finish drawing, start moving)
   *   • In snap_direct_select → deactivateEdit (done)
   */
  toggleDraw: () => void;
  /** Remove the draw control and reset all state */
  deactivateEdit: () => void;
  /**
   * Finish editing — switch to preview mode (simple_select).
   * The Draw control stays on the map so the trail remains visible.
   * From preview, the user can Re-edit or Save/Cancel.
   * Triggered by Enter key or Done button.
   */
  finishEdit: () => void;
  /**
   * Cancel editing — discard geometry changes and return to preview mode
   * (showing the original geometry). If no changes were made, just previews.
   * Triggered by Escape key or Cancel button.
   * Call deactivateEdit() to fully exit (e.g. after saving or closing).
   */
  cancelEdit: () => void;
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
  map: MapboxMap,
  drawRef: React.RefObject<MapboxDraw | null>
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
      snapGetFeatures: () => [
        ...map.queryRenderedFeatures({ layers: [TRAILS_LAYER] }),
        ...(drawRef.current?.getAll().features ?? []),
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
  const [drawMode, setDrawMode] = useState<'draw' | 'move' | 'preview' | null>(
    null
  );
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  // Callbacks supplied at activateEdit time
  const onClickNoTargetRef = useRef<(() => void) | undefined>(undefined);
  const onClickOtherTrailRef = useRef<((id: number) => void) | undefined>(
    undefined
  );

  // Original geometry snapshot for cancel (restore on Escape)
  const originalGeometryRef = useRef<GeoJSON.LineString | null>(null);

  // Callbacks for finish/cancel (set by the panel so it can sync its own state)
  const onFinishEditRef = useRef<(() => void) | undefined>(undefined);
  const onCancelEditRef = useRef<(() => void) | undefined>(undefined);

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
        onFinishEdit?: () => void;
        onCancelEdit?: () => void;
      }
    ) => {
      const map = mapRef.current;
      if (!map) return;

      onClickNoTargetRef.current = callbacks?.onClickNoTarget;
      onClickOtherTrailRef.current = callbacks?.onClickOtherTrail;
      onFinishEditRef.current = callbacks?.onFinishEdit;
      onCancelEditRef.current = callbacks?.onCancelEdit;

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
        buildDrawOptions(LockedSnapDirectSelect, map, drawRef)
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

      // Snapshot for Escape/cancel
      originalGeometryRef.current = geometry;

      // Start in move/vertex mode — directly interactive, avoids the
      // double-click-broken state that simple_select can cause on first mount.
      const moveMode = snapRef.current ? 'snap_direct_select' : 'direct_select';
      draw.changeMode(moveMode as 'direct_select', { featureId: ids[0] });

      setIsCreating(false);
      setIsEditing(true);
      setIsDirty(false);
      setDrawMode('move');
    },
    [mapRef]
  );

  const activateCreate = useCallback(
    (callbacks?: { onFinishEdit?: () => void; onCancelEdit?: () => void }) => {
      const map = mapRef.current;
      if (!map) return;

      onClickNoTargetRef.current = undefined;
      onClickOtherTrailRef.current = undefined;
      onFinishEditRef.current = callbacks?.onFinishEdit;
      onCancelEditRef.current = callbacks?.onCancelEdit;

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
          map,
          drawRef
        )
      );
      drawRef.current = draw;
      map.addControl(draw);

      // snap_line gives a crosshair cursor dedicated to placing waypoints
      draw.changeMode('snap_line' as 'draw_line_string');

      historyRef.current = [];
      historyIndexRef.current = -1;
      featureIdRef.current = null;
      originalGeometryRef.current = null; // no original to restore for a new trail

      setIsCreating(true);
      setIsEditing(true);
      setIsDirty(false);
      setDrawMode('draw');
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
    originalGeometryRef.current = null;
    setIsCreating(false);
    setIsEditing(false);
    setIsDirty(false);
    setDrawMode(null);
  }, [mapRef]);

  /**
   * Finish editing → enter preview mode.
   * The Draw control stays on the map (trail remains visible, no vertex handles).
   * Switches the draw library to simple_select so handles disappear.
   * From preview, the user can Re-edit (toggleDraw) or Save (deactivateEdit).
   * Triggered by Enter key or Done button.
   */
  const finishEdit = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;

    const enterPreview = () => {
      const id = featureIdRef.current;
      // simple_select with the feature selected keeps it rendered but handle-free
      if (id) {
        draw.changeMode('simple_select' as const, { featureIds: [id] });
      } else {
        draw.changeMode('simple_select' as const);
      }
      setIsCreating(false);
      setDrawMode('preview');
      onFinishEditRef.current?.();
    };

    // If still in snap_line, commit the line first then enter preview
    if (isCreating) {
      draw.changeMode('simple_select' as const);
      setTimeout(() => {
        // After draw.create fires, featureIdRef will be set
        enterPreview();
      }, 0);
      return;
    }
    enterPreview();
  }, [isCreating]);

  /**
   * Cancel editing:
   *  - If dirty: restore the original geometry, enter preview showing original.
   *  - If clean (no changes): just enter preview.
   * Does NOT deactivate — the draw control stays up.
   * Triggered by Escape key or Cancel button.
   * To fully exit (e.g. close the panel), call deactivateEdit() instead.
   */
  const cancelEdit = useCallback(() => {
    const draw = drawRef.current;

    if (isDirty && originalGeometryRef.current && draw) {
      const orig = originalGeometryRef.current;
      const id = featureIdRef.current;
      // Restore original coordinates in the draw layer
      draw.set({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: id ?? undefined,
            geometry: orig,
            properties: {},
          },
        ],
      });
      // Re-capture feature id in case it changed after set()
      const all = draw.getAll().features;
      if (all[0]?.id) featureIdRef.current = String(all[0].id);
      setIsDirty(false);
    }

    // Enter preview mode (showing whatever geometry is now in draw)
    const id = featureIdRef.current;
    if (draw) {
      if (id) {
        draw.changeMode('simple_select' as const, { featureIds: [id] });
      } else {
        draw.changeMode('simple_select' as const);
      }
    }
    setIsCreating(false);
    setDrawMode('preview');
    onCancelEditRef.current?.();
  }, [isDirty]);

  /**
   * Draw-button sub-mode toggle:
   *   • In snap_line (draw)          → snap_direct_select (move)
   *   • In snap_direct_select (move) → snap_line (draw)
   *   • In simple_select (preview)   → snap_direct_select (re-edit / move)
   *
   * Finishing/cancelling the edit session is handled by finishEdit/cancelEdit.
   */
  const toggleDraw = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;

    const id = featureIdRef.current;
    const moveMode = snapRef.current ? 'snap_direct_select' : 'direct_select';

    if (isCreating) {
      // snap_line → move
      if (id) {
        draw.changeMode(moveMode as 'direct_select', { featureId: id });
      } else {
        draw.changeMode('simple_select' as const);
      }
      setIsCreating(false);
      setDrawMode('move');
    } else if (drawMode === 'preview') {
      // preview → re-enter move (re-edit)
      if (id) {
        draw.changeMode(moveMode as 'direct_select', { featureId: id });
        setDrawMode('move');
      }
    } else {
      // move → draw (new line segment)
      draw.changeMode('snap_line' as 'draw_line_string');
      setIsCreating(true);
      setDrawMode('draw');
    }
  }, [isCreating, drawMode]);

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

  // ── Sync drawMode when Draw auto-transitions between modes ───────────────
  // e.g. clicking outside a feature in direct_select → simple_select

  useEffect(() => {
    if (!isEditing) return;
    const map = mapRef.current;
    if (!map) return;

    const onModeChange = (e: { mode: string }) => {
      if (e.mode === 'simple_select') {
        // Draw auto-transitions here (e.g. click outside in direct_select).
        // Treat it as preview — trail stays visible, no vertex handles.
        setIsCreating(false);
        setDrawMode('preview');
      } else if (
        e.mode === 'direct_select' ||
        e.mode === 'snap_direct_select'
      ) {
        setIsCreating(false);
        setDrawMode('move');
      } else if (e.mode === 'draw_line_string' || e.mode === 'snap_line') {
        setIsCreating(true);
        setDrawMode('draw');
      }
    };

    map.on('draw.modechange', onModeChange);
    return () => {
      map.off('draw.modechange', onModeChange);
    };
  }, [isEditing, mapRef]);

  // ── Shift-held cursor: crosshair while Shift is down in move mode ─────────
  // Shift+click appends (or prepends with Alt) a vertex, so show crosshair
  // as a visual cue that the next click will add a point.

  const drawModeRef = useRef(drawMode);
  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);

  useEffect(() => {
    if (!isEditing) return;
    const map = mapRef.current;
    if (!map) return;

    const canvas = map.getCanvas();

    const onShiftDown = (e: KeyboardEvent) => {
      if (e.key !== 'Shift') return;
      if (drawModeRef.current === 'move') {
        canvas.style.cursor = 'crosshair';
      }
    };
    const onShiftUp = (e: KeyboardEvent) => {
      if (e.key !== 'Shift') return;
      canvas.style.cursor = '';
    };

    window.addEventListener('keydown', onShiftDown);
    window.addEventListener('keyup', onShiftUp);
    return () => {
      window.removeEventListener('keydown', onShiftDown);
      window.removeEventListener('keyup', onShiftUp);
      canvas.style.cursor = '';
    };
  }, [isEditing, mapRef]);

  // ── Keyboard & right-click shortcuts ─────────────────────────────────────
  //
  // Enter  → finishEdit (keep geometry, exit to view)
  // Escape → cancelEdit (discard changes, exit to view)
  //
  // Uses refs so the handler is registered once and always reads current state.
  const isEditingRef = useRef(isEditing);
  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  // Keep stable references to finishEdit/cancelEdit
  const finishEditRef = useRef(finishEdit);
  const cancelEditRef = useRef(cancelEdit);
  useEffect(() => {
    finishEditRef.current = finishEdit;
  }, [finishEdit]);
  useEffect(() => {
    cancelEditRef.current = cancelEdit;
  }, [cancelEdit]);

  useEffect(() => {
    const onKeyUp = (e: KeyboardEvent) => {
      if (!isEditingRef.current) return;
      if (e.key === 'Enter') {
        finishEditRef.current();
      } else if (e.key === 'Escape') {
        cancelEditRef.current();
      }
    };
    window.addEventListener('keyup', onKeyUp);
    return () => window.removeEventListener('keyup', onKeyUp);
  }, []); // stable — reads latest via refs

  // ── Capture featureId + seed history when a new line is finished ──────────

  const handlingDrawCreateRef = useRef(false);

  useEffect(() => {
    if (!isCreating) return;
    const map = mapRef.current;
    if (!map) return;

    const onDrawCreate = (e: { features: GeoJSON.Feature[] }) => {
      // Guard against re-entrant calls (changeMode below can re-fire draw.create)
      if (handlingDrawCreateRef.current) return;
      handlingDrawCreateRef.current = true;

      const line = e.features[0];
      if (!line || !line.id || line.geometry.type !== 'LineString') {
        handlingDrawCreateRef.current = false;
        return;
      }
      featureIdRef.current = String(line.id);
      const coords = (line.geometry as GeoJSON.LineString).coordinates.map(
        (c) => [c[0], c[1]] as [number, number]
      );
      historyRef.current = [coords];
      historyIndexRef.current = 0;
      setIsDirty(true);
      // Transition into move/vertex mode so the user can adjust vertices
      drawRef.current?.changeMode(
        (snapRef.current
          ? 'snap_direct_select'
          : 'direct_select') as 'direct_select',
        { featureId: String(line.id) }
      );
      // Signal that we're no longer in line-draw mode — now in move mode
      setIsCreating(false);
      setDrawMode('move');

      handlingDrawCreateRef.current = false;
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
    drawMode,
    snapEnabled,
    isDirty,
    activateEdit,
    activateCreate,
    toggleDraw,
    deactivateEdit,
    finishEdit,
    cancelEdit,
    getCurrentGeometry,
    notifyOtherTrailClick: (trailId: number) => {
      onClickOtherTrailRef.current?.(trailId);
    },
  };
}
