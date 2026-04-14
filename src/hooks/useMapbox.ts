import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import mapboxgl from 'mapbox-gl';
import { useSearchParams } from 'react-router-dom';
import { useDrawTrail, type DrawTrailApi } from '@/hooks/useDrawTrail';
import { type Trail } from '@/hooks/useTrails';
import {
  MAP_STYLES,
  type StyleKey,
  TRAILS_SOURCE,
  TRAILS_ENDPOINTS,
  INITIAL_CENTER,
  INITIAL_ZOOM,
  INITIAL_PITCH,
  INITIAL_BEARING,
  CONTOUR_STRENGTH_DEFAULT,
  ELEV_HOVER_SOURCE,
  ELEV_HOVER_LAYER,
} from '@/lib/map/config';
import {
  SELECTED_LAYER_CONFIG,
  TRAILS_LAYER_CONFIG,
  TRAILS_LABELS_CONFIG,
  TRAILS_START_CONFIG,
  TRAILS_END_CONFIG,
} from '@/lib/map/layers';

// Layer ID shorthand for hover/click handlers
const TRAILS_LAYER = TRAILS_LAYER_CONFIG.id;

// ── Helpers ───────────────────────────────────────────────────────────────────

function trailToFeature(t: Trail): GeoJSON.Feature {
  return {
    type: 'Feature',
    id: t.id,
    geometry: t.geometry_geojson,
    properties: {
      id: t.id,
      name: t.name,
      trail_class: t.trail_class,
      visibility: t.visibility,
      hidden: t.hidden,
      planned: t.planned,
      connector: t.connector,
      bike: t.bike,
      tf_popularity: t.tf_popularity,
    },
  };
}

export interface UseMapboxOptions {
  trails: Trail[];
  onTrailClick?: (trailId: number) => void;
  selectedTrailId?: number | null;
  searchParams?: URLSearchParams;
  setSearchParams?: ReturnType<typeof useSearchParams>[1];
}

export interface UseMapboxReturn {
  mapContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Direct access to the map instance — used for terrain elevation sampling. */
  mapRef: React.RefObject<mapboxgl.Map | null>;
  currentStyle: StyleKey;
  contourStrength: number;
  mapReady: boolean;
  drawApi: DrawTrailApi;
  handleStyleChange: (style: StyleKey) => void;
  handleContourStrength: (value: number) => void;
  pushTrailUpdate: (updated: Trail) => void;
  pushTrailDelete: (id: number) => void;
  setEditingTrailId: (id: number | null) => void;
  /**
   * Show or clear a highlighted point on the map — syncs the chart hover
   * position with the corresponding location on the trail.
   * Pass `null` to clear the marker.
   */
  setElevationHoverPoint: (point: { lng: number; lat: number } | null) => void;
}

export function useMapbox({
  trails,
  onTrailClick,
  selectedTrailId = null,
  searchParams,
  setSearchParams,
}: UseMapboxOptions): UseMapboxReturn {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [currentStyle, setCurrentStyle] = useState<StyleKey>('standard');
  const [contourStrength, setContourStrength] = useState(
    CONTOUR_STRENGTH_DEFAULT
  );
  const contourStrengthRef = useRef(CONTOUR_STRENGTH_DEFAULT);
  const [mapReady, setMapReady] = useState(false);

  // ── Initial camera from search params (read once on mount) ───────────────────
  // Capture values into a ref so the map-creation effect never re-runs when
  // search params change after mount. Format: ?lat=&lon=&z=&p=&b=
  const initialCameraRef = useRef(
    (() => {
      const g = (k: string) =>
        searchParams ? Number(searchParams.get(k) ?? NaN) : NaN;
      return {
        lat: g('lat'),
        lng: g('lon'),
        zoom: g('z'),
        pitch: g('p'),
        bearing: g('b'),
      };
    })()
  );
  // Keep a stable ref to setSearchParams so the moveend handler can always
  // call the latest version without re-registering the listener.
  const setSearchParamsRef = useRef(setSearchParams);
  useEffect(() => {
    setSearchParamsRef.current = setSearchParams;
  }, [setSearchParams]);

  const drawApi = useDrawTrail(mapRef);

  // Selected trail highlight (view mode only)
  const selectedTrailIdRef = useRef<number | null>(null);
  // Trail currently being edited in Draw — hidden from the source layer
  const editingTrailIdRef = useRef<number | null>(null);

  function setEditingTrailId(id: number | null) {
    const map = mapRef.current;
    // Clear previous
    if (editingTrailIdRef.current != null && map?.getSource(TRAILS_SOURCE)) {
      map.setFeatureState(
        { source: TRAILS_SOURCE, id: editingTrailIdRef.current },
        { editing: false }
      );
    }
    editingTrailIdRef.current = id;
    if (id != null && map?.getSource(TRAILS_SOURCE)) {
      map.setFeatureState({ source: TRAILS_SOURCE, id }, { editing: true });
    }
  }

  function setSelectedTrail(id: number | null) {
    const map = mapRef.current;
    if (!map || !map.getSource(TRAILS_SOURCE)) return;
    // Clear previous selection
    if (selectedTrailIdRef.current != null) {
      map.setFeatureState(
        { source: TRAILS_SOURCE, id: selectedTrailIdRef.current },
        { selected: false }
      );
    }
    selectedTrailIdRef.current = id;
    if (id != null) {
      map.setFeatureState({ source: TRAILS_SOURCE, id }, { selected: true });
    }
  }

  // Mirror trails prop in a ref so map callbacks can read the current list
  // synchronously without closing over a stale value.
  const trailsRef = useRef<Trail[]>(trails);
  useLayoutEffect(() => {
    trailsRef.current = trails;
  });

  // ── GeoJSON ──────────────────────────────────────────────────────────────────

  const buildGeoJSON = useCallback(
    (): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: trails.map(trailToFeature),
    }),
    [trails]
  );

  const buildEndpointsGeoJSON = useCallback(
    (forTrailId: number | null): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: trails.flatMap((t) => {
        if (t.id !== forTrailId) return [];
        const coords = t.geometry_geojson?.coordinates;
        if (!coords || coords.length < 2) return [];
        const start = coords[0];
        const end = coords[coords.length - 1];
        return [
          {
            type: 'Feature' as const,
            id: t.id * 2,
            geometry: { type: 'Point' as const, coordinates: start },
            properties: { trail_id: t.id, role: 'start' },
          },
          {
            type: 'Feature' as const,
            id: t.id * 2 + 1,
            geometry: { type: 'Point' as const, coordinates: end },
            properties: { trail_id: t.id, role: 'end' },
          },
        ];
      }),
    }),
    [trails]
  );

  function pushTrailUpdate(updated: Trail) {
    // Build the next list from the ref so this is always synchronous,
    // avoiding a stale-geometry flash when draw control is removed.
    const snapshot = trailsRef.current;
    const exists = snapshot.some((t) => t.id === updated.id);
    const next = exists
      ? snapshot.map((t) => (t.id === updated.id ? updated : t))
      : [...snapshot, updated];

    const map = mapRef.current;
    if (!map) return;

    if (map.getSource(TRAILS_SOURCE)) {
      (map.getSource(TRAILS_SOURCE) as mapboxgl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: next.map(trailToFeature),
      });
    }
    if (map.getSource(TRAILS_ENDPOINTS)) {
      const forId = selectedTrailIdRef.current;
      (map.getSource(TRAILS_ENDPOINTS) as mapboxgl.GeoJSONSource).setData(
        buildEndpointsGeoJSON(forId)
      );
    }
  }

  function pushTrailDelete(id: number) {
    const next = trailsRef.current.filter((t) => t.id !== id);

    const map = mapRef.current;
    if (!map) return;

    if (map.getSource(TRAILS_SOURCE)) {
      (map.getSource(TRAILS_SOURCE) as mapboxgl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: next.map(trailToFeature),
      });
    }
    if (map.getSource(TRAILS_ENDPOINTS)) {
      (map.getSource(TRAILS_ENDPOINTS) as mapboxgl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: [],
      });
    }
  }

  const addTrailsLayer = useCallback(
    (map: mapboxgl.Map) => {
      const geojson = buildGeoJSON();
      if (map.getSource(TRAILS_SOURCE)) {
        (map.getSource(TRAILS_SOURCE) as mapboxgl.GeoJSONSource).setData(
          geojson
        );
        (map.getSource(TRAILS_ENDPOINTS) as mapboxgl.GeoJSONSource)?.setData(
          buildEndpointsGeoJSON(selectedTrailIdRef.current)
        );
        return;
      }
      // Add sources for trails and endpoints On first Load
      map.addSource(TRAILS_SOURCE, { type: 'geojson', data: geojson });
      map.addSource(TRAILS_ENDPOINTS, {
        type: 'geojson',
        data: buildEndpointsGeoJSON(selectedTrailIdRef.current),
      });
      map.addLayer(SELECTED_LAYER_CONFIG);
      map.addLayer(TRAILS_LAYER_CONFIG);
      map.addLayer(TRAILS_LABELS_CONFIG);
      map.addLayer(TRAILS_START_CONFIG);
      map.addLayer(TRAILS_END_CONFIG);

      // Elevation profile hover marker
      if (!map.getSource(ELEV_HOVER_SOURCE)) {
        map.addSource(ELEV_HOVER_SOURCE, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: ELEV_HOVER_LAYER,
          type: 'circle',
          source: ELEV_HOVER_SOURCE,
          slot: 'top',
          paint: {
            'circle-radius': 7,
            'circle-color': '#facc15',
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2,
            'circle-opacity': 0.95,
          },
        });
      }
    },
    [buildGeoJSON, buildEndpointsGeoJSON]
  );

  // ── Contour layer IDs (discovered from the loaded style) ─────────────────────

  const contourLineIdsRef = useRef<string[]>([]);
  const contourLabelIdsRef = useRef<string[]>([]);

  // ── Contour paint helper ──────────────────────────────────────────────────────

  const applyContourStrength = useCallback(
    (map: mapboxgl.Map, strength: number) => {
      const t = strength / 100;
      for (const id of contourLineIdsRef.current) {
        if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', t);
      }
      for (const id of contourLabelIdsRef.current) {
        if (map.getLayer(id)) map.setPaintProperty(id, 'text-opacity', t);
      }
    },
    []
  );

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Use URL search params for the initial camera if present, else fall back
    // to the config defaults.
    const cam = initialCameraRef.current;
    const initLng = Number.isFinite(cam.lng) ? cam.lng : INITIAL_CENTER[0];
    const initLat = Number.isFinite(cam.lat) ? cam.lat : INITIAL_CENTER[1];
    const initZoom = Number.isFinite(cam.zoom) ? cam.zoom : INITIAL_ZOOM;
    const initPitch = Number.isFinite(cam.pitch) ? cam.pitch : INITIAL_PITCH;
    const initBearing = Number.isFinite(cam.bearing)
      ? cam.bearing
      : INITIAL_BEARING;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLES.standard,
      center: [initLng, initLat],
      zoom: initZoom,
      pitch: initPitch,
      bearing: initBearing,
      maxPitch: 85,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.on('load', () => setMapReady(true));

    map.on('style.load', () => {
      // Discover contour layer IDs from the Studio style
      const layers = map.getStyle().layers ?? [];
      contourLineIdsRef.current = layers
        .filter(
          (l) => l.type === 'line' && l.id.toLowerCase().includes('contour')
        )
        .map((l) => l.id);
      contourLabelIdsRef.current = layers
        .filter(
          (l) => l.type === 'symbol' && l.id.toLowerCase().includes('contour')
        )
        .map((l) => l.id);

      applyContourStrength(map, contourStrengthRef.current);
      setMapReady(true);
    });

    // ── Sync camera position → search params (debounced 2 s) ─────────────────
    let moveDebounce: ReturnType<typeof setTimeout> | null = null;
    const onMoveEnd = () => {
      if (moveDebounce) clearTimeout(moveDebounce);
      moveDebounce = setTimeout(() => {
        const { lat, lng } = map.getCenter();
        const zoom = map.getZoom();
        const pitch = map.getPitch();
        const bearing = map.getBearing();
        setSearchParamsRef.current?.((prev) => {
          const next = new URLSearchParams(prev);
          next.set('lat', lat.toFixed(4));
          next.set('lon', lng.toFixed(4));
          next.set('z', zoom.toFixed(1));
          next.set('p', pitch.toFixed(1));
          next.set('b', bearing.toFixed(1));
          return next;
        });
      }, 500);
    };
    map.on('moveend', onMoveEnd);

    return () => {
      if (moveDebounce) clearTimeout(moveDebounce);
      map.off('moveend', onMoveEnd);
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [applyContourStrength]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    addTrailsLayer(map);
  }, [mapReady, addTrailsLayer]);

  const isEditingRef = useRef(false);
  useEffect(() => {
    isEditingRef.current = drawApi.isEditing;
    if (!drawApi.isEditing) return;
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = '';
    setSelectedTrail(null);
    if (map.getSource(TRAILS_ENDPOINTS)) {
      (map.getSource(TRAILS_ENDPOINTS) as mapboxgl.GeoJSONSource).setData(
        buildEndpointsGeoJSON(null)
      );
    }
  }, [drawApi.isEditing, buildEndpointsGeoJSON]);

  // Keep stable refs so the map event handlers don't need to re-register
  const onTrailClickRef = useRef(onTrailClick);
  useEffect(() => {
    onTrailClickRef.current = onTrailClick;
  }, [onTrailClick]);
  const drawApiRef = useRef(drawApi);
  useEffect(() => {
    drawApiRef.current = drawApi;
  }, [drawApi]);

  // Drive the selection highlight + endpoints from the URL param.
  // Depends on addTrailsLayer (stable after trails load) to ensure the source
  // exists before calling setFeatureState / setData.
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    setSelectedTrail(selectedTrailId);
    if (map.getSource(TRAILS_ENDPOINTS)) {
      (map.getSource(TRAILS_ENDPOINTS) as mapboxgl.GeoJSONSource).setData(
        buildEndpointsGeoJSON(selectedTrailId)
      );
    }
  }, [selectedTrailId, mapReady, addTrailsLayer, buildEndpointsGeoJSON]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    const HIT_RADIUS = 5; // px — hit tolerance around trail lines
    const hitBox = (
      e: mapboxgl.MapMouseEvent
    ): [mapboxgl.PointLike, mapboxgl.PointLike] => [
      [e.point.x - HIT_RADIUS, e.point.y - HIT_RADIUS],
      [e.point.x + HIT_RADIUS, e.point.y + HIT_RADIUS],
    ];

    const onMouseMove = (e: mapboxgl.MapMouseEvent) => {
      if (!map.getLayer(TRAILS_LAYER)) return;
      const features = map.queryRenderedFeatures(hitBox(e), {
        layers: [TRAILS_LAYER],
      });
      if (features.length > 0 && !isEditingRef.current) {
        map.getCanvas().style.cursor = 'pointer';
      } else {
        map.getCanvas().style.cursor = '';
      }
    };

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      if (!map.getLayer(TRAILS_LAYER)) return;
      const features = map.queryRenderedFeatures(hitBox(e), {
        layers: [TRAILS_LAYER],
      });
      if (features.length > 0) {
        const id = features[0]?.properties?.id;
        if (id != null) {
          if (isEditingRef.current) {
            drawApiRef.current.notifyOtherTrailClick(Number(id));
          } else {
            onTrailClickRef.current?.(Number(id));
          }
        }
      }
    };

    map.on('mousemove', onMouseMove);
    map.on('click', onClick);

    return () => {
      map.off('mousemove', onMouseMove);
      map.off('click', onClick);
      try {
        map.getCanvas().style.cursor = '';
      } catch {
        /* map already removed */
      }
    };
  }, [mapReady]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleStyleChange = (style: StyleKey) => {
    const map = mapRef.current;
    if (!map) return;
    setMapReady(false);
    map.setStyle(MAP_STYLES[style]);
    setCurrentStyle(style);
  };

  const handleContourStrength = (value: number) => {
    contourStrengthRef.current = value;
    setContourStrength(value);
    const map = mapRef.current;
    if (map && mapReady) applyContourStrength(map, value);
  };

  function setElevationHoverPoint(point: { lng: number; lat: number } | null) {
    const map = mapRef.current;
    if (!map || !map.getSource(ELEV_HOVER_SOURCE)) return;
    const source = map.getSource(ELEV_HOVER_SOURCE) as mapboxgl.GeoJSONSource;
    if (!point) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
          properties: {},
        },
      ],
    });
  }

  return {
    mapContainerRef,
    mapRef,
    currentStyle,
    contourStrength,
    mapReady,
    drawApi,
    handleStyleChange,
    handleContourStrength,
    pushTrailUpdate,
    pushTrailDelete,
    setEditingTrailId,
    setElevationHoverPoint,
  };
}
