import { type ExpressionSpecification } from 'mapbox-gl';

// ── Styles ────────────────────────────────────────────────────────────────────

export const MAP_STYLES = {
  standard: 'mapbox://styles/mapbox/standard',
  satellite: 'mapbox://styles/mapbox/standard-satellite',
} as const;

export type StyleKey = keyof typeof MAP_STYLES;

// ── Layer / source IDs ────────────────────────────────────────────────────────

export const TRAILS_SOURCE = 'trails';
export const TRAILS_LAYER = 'trails-line';
export const TRAILS_SELECTED = 'trails-selected';
export const TRAILS_LABELS = 'trails-labels';
export const TRAILS_ENDPOINTS = 'trails-endpoints';
export const TRAILS_START = 'trails-start';
export const TRAILS_END = 'trails-end';
export const TRAILS_HALO = 'trails-halo';
export const TRAIL_PREVIEW_SOURCE = 'trail-preview';
export const TRAIL_PREVIEW_LAYER = 'trail-preview-line';
export const CONTOUR_SOURCE = 'mapbox-terrain';
export const CONTOUR_LAYER = 'contour-lines';
export const CONTOUR_LABEL = 'contour-labels';
export const DEM_SOURCE = 'mapbox-dem';
export const HILLSHADE_LAYER = 'terrain-hillshade';

// ── Initial camera ────────────────────────────────────────────────────────────

export const INITIAL_CENTER: [number, number] = [-123.8154, 48.9994];
export const INITIAL_ZOOM = 12;
export const INITIAL_PITCH = 60;
export const INITIAL_BEARING = -20;

// ── Terrain ───────────────────────────────────────────────────────────────────

export const TERRAIN_EXAGGERATION = 1.5;

// ── Basemap theme overrides ───────────────────────────────────────────────────

export const BASEMAP_CONFIG = {
  lightPreset: 'day',
  theme: 'faded',
  colorLand: '#e8ede3',
  colorGreenspace: '#dce6d4',
  colorWater: '#c5d9f5',
  colorRoads: '#f3f4f6',
} as const;

// ── Trail expressions ─────────────────────────────────────────────────────────

const BASE_WIDTH = 2.3;

export const TRAIL_COLOR_EXPR: ExpressionSpecification = [
  'case',
  // planned overrides
  ['all', ['==', ['get', 'planned'], true], ['==', ['get', 'bike'], true]],
  '#f0abfc', // planned + bike → magenta
  ['==', ['get', 'planned'], true],
  '#c084fc', // planned → purple
  // difficulty palette
  ['==', ['get', 'trail_class'], 'ACCESS'],
  '#8b5aa6',
  ['==', ['get', 'trail_class'], 'PATH'],
  '#f1efe8',
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
  ['==', ['get', 'trail_class'], 'SECONDARY'],
  '#f1efe8',
  ['==', ['get', 'trail_class'], 'PRO'],
  '#fb923c',
  ['==', ['get', 'trail_class'], 'ADVANCED'],
  '#818cf8',
  ['==', ['get', 'trail_class'], 'LIFT'],
  '#fde68a',
  '#cbd5e1',
];

export const TRAIL_WIDTH_EXPR: ExpressionSpecification = [
  'case',
  ['==', ['get', 'hidden'], true],
  BASE_WIDTH * 0.25,
  ['==', ['get', 'connector'], true],
  BASE_WIDTH * 0.75,
  BASE_WIDTH,
];

// Halo width expression derived from trail width (slightly larger)
export const TRAIL_HALO_WIDTH: ExpressionSpecification = [
  'case',
  ['==', ['get', 'hidden'], true],
  BASE_WIDTH * 0.25 + 1,
  ['==', ['get', 'connector'], true],
  BASE_WIDTH * 0.75 + 1,
  BASE_WIDTH + 1,
];

// ── Contour color schemes ─────────────────────────────────────────────────────

export const CONTOUR_COLORS = {
  dark: {
    major: '#4a3828',
    semi: '#6b5240',
    minor: '#8a6e58',
    label: '#4a3828',
  },
  light: {
    major: '#c4b8ac',
    semi: '#d4cbc3',
    minor: '#e2dbd5',
    label: '#a89888',
  },
} as const;

export type ContourScheme = keyof typeof CONTOUR_COLORS;

export const CONTOUR_STRENGTH_DEFAULT = 50;
