import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl, { type ExpressionSpecification } from 'mapbox-gl';
import { useTrails } from '@/hooks/useTrails';
import {
  MAP_STYLES,
  type StyleKey,
  TRAILS_SOURCE,
  TRAILS_LAYER,
  TRAILS_LABELS,
  CONTOUR_SOURCE,
  CONTOUR_LAYER,
  CONTOUR_LABEL,
  DEM_SOURCE,
  HILLSHADE_LAYER,
  INITIAL_CENTER,
  INITIAL_ZOOM,
  INITIAL_PITCH,
  INITIAL_BEARING,
  TERRAIN_EXAGGERATION,
  BASEMAP_CONFIG,
  TRAIL_COLOR_EXPR,
  TRAIL_WIDTH_EXPR,
  CONTOUR_COLORS,
  type ContourScheme,
  CONTOUR_STRENGTH_DEFAULT,
} from '@/lib/map/config';

export interface UseMapboxOptions {
  onTrailClick?: (trailId: number) => void;
}

export interface UseMapboxReturn {
  mapContainerRef: React.RefObject<HTMLDivElement | null>;
  currentStyle: StyleKey;
  contourStrength: number;
  contourScheme: ContourScheme;
  mapReady: boolean;
  trails: ReturnType<typeof useTrails>['trails'];
  loading: boolean;
  trailsError: string | null;
  handleStyleChange: (style: StyleKey) => void;
  handleContourStrength: (value: number) => void;
  handleContourScheme: (scheme: ContourScheme) => void;
  handleTrailUpdated: (
    updated: ReturnType<typeof useTrails>['trails'][number]
  ) => void;
}

export function useMapbox({
  onTrailClick,
}: UseMapboxOptions = {}): UseMapboxReturn {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [currentStyle, setCurrentStyle] = useState<StyleKey>('standard');
  const [contourStrength, setContourStrength] = useState(
    CONTOUR_STRENGTH_DEFAULT
  );
  const contourStrengthRef = useRef(CONTOUR_STRENGTH_DEFAULT);
  const [contourScheme, setContourScheme] = useState<ContourScheme>('dark');
  const contourSchemeRef = useRef<ContourScheme>('dark');
  const [mapReady, setMapReady] = useState(false);

  // Local copy of trails so we can patch individual rows after an edit.
  // useTrails fetches once; handleTrailUpdated patches locally to avoid refetch.
  const { trails: fetchedTrails, loading, error: trailsError } = useTrails();
  const [trails, setTrails] = useState(fetchedTrails);
  // Sync when the initial fetch lands (or if re-fetched)
  if (trails !== fetchedTrails && !loading) {
    setTrails(fetchedTrails);
  }

  // ── GeoJSON ──────────────────────────────────────────────────────────────────

  const buildGeoJSON = useCallback(
    (): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: trails.map((t) => ({
        type: 'Feature',
        id: t.id,
        geometry: t.geometry,
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
      })),
    }),
    [trails]
  );

  function handleTrailUpdated(
    updated: ReturnType<typeof useTrails>['trails'][number]
  ) {
    setTrails((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    // Refresh the Mapbox GeoJSON source after React flushes the state update.
    // buildGeoJSON is captured in a stable closure via useCallback([trails]),
    // so we schedule the setData call after the state has been applied.
    setTimeout(() => {
      if (mapRef.current?.getSource(TRAILS_SOURCE)) {
        (
          mapRef.current.getSource(TRAILS_SOURCE) as mapboxgl.GeoJSONSource
        ).setData(buildGeoJSON());
      }
    }, 0);
  }

  const addTrailsLayer = useCallback(
    (map: mapboxgl.Map) => {
      const geojson = buildGeoJSON();
      if (map.getSource(TRAILS_SOURCE)) {
        (map.getSource(TRAILS_SOURCE) as mapboxgl.GeoJSONSource).setData(
          geojson
        );
        return;
      }
      map.addSource(TRAILS_SOURCE, { type: 'geojson', data: geojson });
      map.addLayer({
        id: TRAILS_LAYER,
        type: 'line',
        source: TRAILS_SOURCE,
        slot: 'middle',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': TRAIL_COLOR_EXPR,
          'line-width': TRAIL_WIDTH_EXPR,
          'line-opacity': 1,
        },
      });
      // Trail name labels — only on named, non-hidden, non-connector trails
      map.addLayer({
        id: TRAILS_LABELS,
        type: 'symbol',
        source: TRAILS_SOURCE,
        slot: 'top',
        filter: [
          'all',
          ['!=', ['get', 'hidden'], true],
          ['!=', ['get', 'connector'], true],
          ['has', 'name'],
          ['!=', ['get', 'name'], ''],
        ],
        minzoom: 12,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 13],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-offset': [0, -0.8],
          'symbol-spacing': 300,
          'text-max-angle': 35,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#1e293b',
          'text-halo-color': 'rgba(255,255,255,0.9)',
          'text-halo-width': 1.5,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 12.5, 1],
        },
      });
    },
    [buildGeoJSON]
  );

  // ── Contour paint helpers ─────────────────────────────────────────────────────

  const applyContourColors = useCallback(
    (map: mapboxgl.Map, scheme: ContourScheme) => {
      const c = CONTOUR_COLORS[scheme];
      if (map.getLayer(CONTOUR_LAYER)) {
        map.setPaintProperty(CONTOUR_LAYER, 'line-color', [
          'case',
          [
            'all',
            ['in', ['get', 'index'], ['literal', [1, 2]]],
            ['==', ['%', ['get', 'ele'], 50], 0],
          ],
          c.major,
          ['in', ['get', 'index'], ['literal', [1, 2]]],
          c.semi,
          c.minor,
        ]);
      }
      if (map.getLayer(CONTOUR_LABEL)) {
        map.setPaintProperty(CONTOUR_LABEL, 'text-color', c.label);
      }
    },
    []
  );

  const applyContourStrength = useCallback(
    (map: mapboxgl.Map, strength: number) => {
      if (!map.getLayer(CONTOUR_LAYER)) return;
      const t = strength / 100;
      const isMajor50: ExpressionSpecification = [
        'all',
        ['in', ['get', 'index'], ['literal', [1, 2]]],
        ['==', ['%', ['get', 'ele'], 50], 0],
      ];
      const isSemi: ExpressionSpecification = [
        'in',
        ['get', 'index'],
        ['literal', [1, 2]],
      ];
      map.setPaintProperty(CONTOUR_LAYER, 'line-width', [
        'interpolate',
        ['linear'],
        ['zoom'],
        11,
        ['case', isMajor50, 0.5 * t, isSemi, 0.3 * t, 0.15 * t],
        15,
        ['case', isMajor50, 1.2 * t, isSemi, 0.8 * t, 0.4 * t],
      ]);
      map.setPaintProperty(CONTOUR_LAYER, 'line-opacity', [
        'interpolate',
        ['linear'],
        ['zoom'],
        11,
        ['case', isMajor50, 0.4 * t, isSemi, 0.25 * t, 0.12 * t],
        15,
        ['case', isMajor50, 0.85 * t, isSemi, 0.65 * t, 0.35 * t],
      ]);
      if (map.getLayer(CONTOUR_LABEL)) {
        map.setPaintProperty(CONTOUR_LABEL, 'text-opacity', t);
      }
    },
    []
  );

  // ── Map initialisation ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainerRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLES.standard,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: INITIAL_PITCH,
      bearing: INITIAL_BEARING,
      maxPitch: 85,
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapRef.current.on('load', () => setMapReady(true));

    mapRef.current.on('style.load', () => {
      const map = mapRef.current;
      if (!map) return;

      // Basemap theme
      map.setConfig('basemap', {
        lightPreset: BASEMAP_CONFIG.lightPreset,
        theme: 'monochrome',
      });
      map.setConfigProperty('basemap', 'theme', BASEMAP_CONFIG.theme);
      map.setConfigProperty('basemap', 'colorLand', BASEMAP_CONFIG.colorLand);
      map.setConfigProperty(
        'basemap',
        'colorGreenspace',
        BASEMAP_CONFIG.colorGreenspace
      );
      map.setConfigProperty('basemap', 'colorWater', BASEMAP_CONFIG.colorWater);
      map.setConfigProperty('basemap', 'colorRoads', BASEMAP_CONFIG.colorRoads);

      // DEM + terrain
      if (!map.getSource(DEM_SOURCE)) {
        map.addSource(DEM_SOURCE, {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 16,
        });
      }
      map.setTerrain({
        source: DEM_SOURCE,
        exaggeration: TERRAIN_EXAGGERATION,
      });

      // Hillshade
      if (!map.getLayer(HILLSHADE_LAYER)) {
        map.addLayer({
          id: HILLSHADE_LAYER,
          type: 'hillshade',
          source: DEM_SOURCE,
          slot: 'bottom',
          paint: {
            'hillshade-exaggeration': 0.7,
            'hillshade-illumination-anchor': 'map',
            'hillshade-illumination-direction': 315,
            'hillshade-highlight-color': 'rgba(255,252,245,0.4)',
            'hillshade-shadow-color': 'rgba(45,30,15,0.55)',
            'hillshade-accent-color': 'rgba(80,55,30,0.2)',
          },
        });
      }

      // Contour source
      if (!map.getSource(CONTOUR_SOURCE)) {
        map.addSource(CONTOUR_SOURCE, {
          type: 'vector',
          url: 'mapbox://mapbox.mapbox-terrain-v2',
        });
      }

      // Contour lines
      if (!map.getLayer(CONTOUR_LAYER)) {
        const c = CONTOUR_COLORS[contourSchemeRef.current];
        map.addLayer({
          id: CONTOUR_LAYER,
          type: 'line',
          source: CONTOUR_SOURCE,
          'source-layer': 'contour',
          slot: 'bottom',
          minzoom: 11,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': [
              'case',
              [
                'all',
                ['in', ['get', 'index'], ['literal', [1, 2]]],
                ['==', ['%', ['get', 'ele'], 50], 0],
              ],
              c.major,
              ['in', ['get', 'index'], ['literal', [1, 2]]],
              c.semi,
              c.minor,
            ],
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              11,
              [
                'case',
                [
                  'all',
                  ['in', ['get', 'index'], ['literal', [1, 2]]],
                  ['==', ['%', ['get', 'ele'], 50], 0],
                ],
                0.5,
                ['in', ['get', 'index'], ['literal', [1, 2]]],
                0.3,
                0.15,
              ],
              15,
              [
                'case',
                [
                  'all',
                  ['in', ['get', 'index'], ['literal', [1, 2]]],
                  ['==', ['%', ['get', 'ele'], 50], 0],
                ],
                1.2,
                ['in', ['get', 'index'], ['literal', [1, 2]]],
                0.8,
                0.4,
              ],
            ],
            'line-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              11,
              [
                'case',
                [
                  'all',
                  ['in', ['get', 'index'], ['literal', [1, 2]]],
                  ['==', ['%', ['get', 'ele'], 50], 0],
                ],
                0.4,
                ['in', ['get', 'index'], ['literal', [1, 2]]],
                0.25,
                0.12,
              ],
              15,
              [
                'case',
                [
                  'all',
                  ['in', ['get', 'index'], ['literal', [1, 2]]],
                  ['==', ['%', ['get', 'ele'], 50], 0],
                ],
                0.85,
                ['in', ['get', 'index'], ['literal', [1, 2]]],
                0.65,
                0.35,
              ],
            ],
          },
        });
      }

      // Contour elevation labels (50m multiples only)
      if (!map.getLayer(CONTOUR_LABEL)) {
        map.addLayer({
          id: CONTOUR_LABEL,
          type: 'symbol',
          source: CONTOUR_SOURCE,
          'source-layer': 'contour',
          slot: 'top',
          filter: ['==', ['%', ['to-number', ['get', 'ele']], 50], 0],
          minzoom: 12,
          layout: {
            'symbol-placement': 'line',
            'text-field': ['concat', ['to-string', ['get', 'ele']], 'm'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 16, 14],
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
            'text-offset': [0, 0.2],
            'symbol-spacing': [
              'interpolate',
              ['linear'],
              ['zoom'],
              12,
              300,
              16,
              150,
            ],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': CONTOUR_COLORS[contourSchemeRef.current].label,
            'text-halo-color': 'rgba(255,255,255,0.95)',
            'text-halo-width': 2,
            'text-opacity': 1,
          },
        });
      }

      applyContourStrength(map, contourStrengthRef.current);
      applyContourColors(map, contourSchemeRef.current);
      setMapReady(true);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [applyContourStrength, applyContourColors]);

  // ── Sync trails layer when data / style changes ───────────────────────────────

  useEffect(() => {
    if (!mapReady || !mapRef.current || loading) return;
    addTrailsLayer(mapRef.current);
  }, [mapReady, loading, addTrailsLayer]);

  // ── Trail hover cursor + click → URL param ───────────────────────────────────

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
      map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : '';
    };
    const onClick = (e: mapboxgl.MapMouseEvent) => {
      if (!map.getLayer(TRAILS_LAYER)) return;
      const features = map.queryRenderedFeatures(hitBox(e), {
        layers: [TRAILS_LAYER],
      });
      const id = features[0]?.properties?.id;
      if (id != null && onTrailClick) onTrailClick(Number(id));
    };

    map.on('mousemove', onMouseMove);
    map.on('click', onClick);

    return () => {
      map.off('mousemove', onMouseMove);
      map.off('click', onClick);
      map.getCanvas().style.cursor = '';
    };
  }, [mapReady, onTrailClick]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleStyleChange = (style: StyleKey) => {
    if (!mapRef.current) return;
    setMapReady(false);
    mapRef.current.setStyle(MAP_STYLES[style]);
    setCurrentStyle(style);
  };

  const handleContourStrength = (value: number) => {
    contourStrengthRef.current = value;
    setContourStrength(value);
    if (mapRef.current && mapReady) applyContourStrength(mapRef.current, value);
  };

  const handleContourScheme = (scheme: ContourScheme) => {
    contourSchemeRef.current = scheme;
    setContourScheme(scheme);
    if (mapRef.current && mapReady) applyContourColors(mapRef.current, scheme);
  };

  return {
    mapContainerRef,
    currentStyle,
    contourStrength,
    contourScheme,
    mapReady,
    trails,
    loading,
    trailsError,
    handleStyleChange,
    handleContourStrength,
    handleContourScheme,
    handleTrailUpdated,
  };
}
