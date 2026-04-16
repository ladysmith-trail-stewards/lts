import type {
  LineLayerSpecification,
  SymbolLayerSpecification,
  CircleLayerSpecification,
  FillLayerSpecification,
  ExpressionSpecification,
  FilterSpecification,
} from 'mapbox-gl';
import {
  TRAILS_SOURCE,
  TRAILS_LAYER,
  TRAILS_SELECTED,
  TRAILS_LABELS,
  TRAILS_ENDPOINTS,
  TRAILS_START,
  TRAILS_END,
  GENERAL_GEOM_SOURCE,
  GENERAL_GEOM_POINTS,
  GENERAL_GEOM_LINES,
  GENERAL_GEOM_POLYGONS,
} from '@/lib/map/config';

// ── Trail expressions ─────────────────────────────────────────────────────────

const BASE_WIDTH = 2.3;

export const TRAIL_COLOR_EXPR: ExpressionSpecification = [
  'case',
  ['all', ['==', ['get', 'planned'], true], ['==', ['get', 'bike'], true]],
  '#f0abfc', // planned + bike → magenta
  ['==', ['get', 'planned'], true],
  '#c084fc', // planned → purple
  ['==', ['get', 'trail_class'], 'ACCESS'],
  '#8b5aa6',
  ['==', ['get', 'trail_class'], 'EASIEST'],
  '#6fbf4b',
  ['==', ['get', 'trail_class'], 'EASY'],
  '#6fbf4b',
  ['==', ['get', 'trail_class'], 'INTERMEDIATE'],
  '#2f80ed',
  ['==', ['get', 'trail_class'], 'BLACK'],
  '#1e293b',
  ['==', ['get', 'trail_class'], 'DOUBLE_BLACK'],
  '#ef4444',
  ['==', ['get', 'trail_class'], 'PATH'],
  '#f1efe8',
  ['==', ['get', 'trail_class'], 'SECONDARY'],
  '#f1efe8',
  ['==', ['get', 'trail_class'], 'PRO'],
  '#fb923c',
  ['==', ['get', 'trail_class'], 'ADVANCED'],
  '#818cf8',
  ['==', ['get', 'trail_class'], 'LIFT'],
  '#fde68a',
  '#cbd5e1',
] as const;

export const TRAIL_WIDTH_EXPR: ExpressionSpecification = [
  'case',
  ['==', ['get', 'hidden'], true],
  BASE_WIDTH * 0.25,
  ['==', ['get', 'connector'], true],
  BASE_WIDTH * 0.75,
  BASE_WIDTH,
] as const;

export const TRAIL_HALO_WIDTH: ExpressionSpecification = [
  'case',
  ['==', ['get', 'hidden'], true],
  BASE_WIDTH * 0.25 + 1,
  ['==', ['get', 'connector'], true],
  BASE_WIDTH * 0.75 + 1,
  BASE_WIDTH + 1,
] as const;

export const TRAIL_LABEL_FILTER: FilterSpecification = [
  'all',
  ['!=', ['get', 'hidden'], true],
  ['!=', ['get', 'connector'], true],
  ['has', 'name'],
  ['!=', ['get', 'name'], ''],
] as const;

// ── Selected trail highlight (rendered below the trail line) ─────────────────

export const SELECTED_LAYER_CONFIG: Omit<LineLayerSpecification, 'id'> & {
  id: string;
} = {
  id: TRAILS_SELECTED,
  type: 'line',
  source: TRAILS_SOURCE,
  slot: 'middle',
  layout: {
    'line-join': 'round',
    'line-cap': 'round',
  },
  paint: {
    'line-color': '#facc15', // yellow-400
    'line-width': [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      8,
      0,
    ],
    'line-opacity': 0.8,
    'line-blur': 2,
  },
};

// ── Trail lines ───────────────────────────────────────────────────────────────

export const TRAILS_LAYER_CONFIG: Omit<LineLayerSpecification, 'id'> & {
  id: string;
} = {
  id: TRAILS_LAYER,
  type: 'line',
  source: TRAILS_SOURCE,
  slot: 'middle',
  layout: {
    'line-join': 'round',
    'line-cap': 'round',
  },
  paint: {
    'line-color': TRAIL_COLOR_EXPR,
    'line-width': TRAIL_WIDTH_EXPR,
    'line-opacity': [
      'case',
      ['boolean', ['feature-state', 'editing'], false],
      0,
      1,
    ],
  },
};

// ── Trail name labels ─────────────────────────────────────────────────────────

export const TRAILS_LABELS_CONFIG: Omit<SymbolLayerSpecification, 'id'> & {
  id: string;
} = {
  id: TRAILS_LABELS,
  type: 'symbol',
  source: TRAILS_SOURCE,
  slot: 'top',
  filter: TRAIL_LABEL_FILTER,
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
};

// ── Trail endpoints ───────────────────────────────────────────────────────────

export const TRAILS_START_CONFIG: Omit<CircleLayerSpecification, 'id'> & {
  id: string;
} = {
  id: TRAILS_START,
  type: 'circle',
  source: TRAILS_ENDPOINTS,
  slot: 'top',
  filter: ['==', ['get', 'role'], 'start'],
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 16, 7],
    'circle-color': '#22c55e',
    'circle-stroke-color': '#fff',
    'circle-stroke-width': 1.5,
    'circle-opacity': 0.9,
  },
};

export const TRAILS_END_CONFIG: Omit<CircleLayerSpecification, 'id'> & {
  id: string;
} = {
  id: TRAILS_END,
  type: 'circle',
  source: TRAILS_ENDPOINTS,
  slot: 'top',
  filter: ['==', ['get', 'role'], 'end'],
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 16, 7],
    'circle-color': '#ef4444',
    'circle-stroke-color': '#fff',
    'circle-stroke-width': 1.5,
    'circle-opacity': 0.9,
  },
};

export const GENERAL_GEOM_POINTS_CONFIG: Omit<
  CircleLayerSpecification,
  'id'
> & {
  id: string;
} = {
  id: GENERAL_GEOM_POINTS,
  type: 'circle',
  source: GENERAL_GEOM_SOURCE,
  slot: 'top',
  filter: ['==', ['get', 'geometry_group'], 'Point'],
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 7],
    'circle-color': '#2563eb',
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 1.25,
    'circle-opacity': 0.9,
  },
};

export const GENERAL_GEOM_LINES_CONFIG: Omit<LineLayerSpecification, 'id'> & {
  id: string;
} = {
  id: GENERAL_GEOM_LINES,
  type: 'line',
  source: GENERAL_GEOM_SOURCE,
  slot: 'middle',
  filter: ['==', ['get', 'geometry_group'], 'LineString'],
  layout: {
    'line-join': 'round',
    'line-cap': 'round',
  },
  paint: {
    'line-color': '#1d4ed8',
    'line-width': 2.5,
    'line-opacity': 0.9,
  },
};

export const GENERAL_GEOM_POLYGONS_CONFIG: Omit<
  FillLayerSpecification,
  'id'
> & {
  id: string;
} = {
  id: GENERAL_GEOM_POLYGONS,
  type: 'fill',
  source: GENERAL_GEOM_SOURCE,
  slot: 'middle',
  filter: ['==', ['get', 'geometry_group'], 'Polygon'],
  paint: {
    'fill-color': '#16a34a',
    'fill-opacity': 0.25,
    'fill-outline-color': '#15803d',
  },
};
