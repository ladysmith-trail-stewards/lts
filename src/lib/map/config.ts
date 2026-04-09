// ── Styles ────────────────────────────────────────────────────────────────────

export const MAP_STYLES = {
  standard: 'mapbox://styles/keeganshaw/cmnrurxw3002z01su1oalgan4',
  satellite: 'mapbox://styles/keeganshaw/cmnrwqczf003c01re5e2g6dhf',
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

// ── Initial camera ────────────────────────────────────────────────────────────

export const INITIAL_CENTER: [number, number] = [-123.8154, 48.9994];
export const INITIAL_ZOOM = 12;
export const INITIAL_PITCH = 60;
export const INITIAL_BEARING = -20;

export const CONTOUR_STRENGTH_DEFAULT = 25;
