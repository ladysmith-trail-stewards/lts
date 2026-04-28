/**
 * Shared metadata for general geometry collection types.
 *
 * Used by the uploader dialog, the map control panel, and the feature popup
 * so that icons and labels stay consistent across the UI.
 */
import {
  Location01Icon,
  GeometricShapes02Icon,
  Route01Icon,
} from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react';

export type GeomGroupKey = 'Point' | 'LineString' | 'Polygon' | 'Geometry';

export const GEOM_GROUP_META: Record<
  GeomGroupKey,
  { icon: IconSvgElement; label: string }
> = {
  Point: { icon: Location01Icon, label: 'Points' },
  LineString: { icon: Route01Icon, label: 'Lines' },
  Polygon: { icon: GeometricShapes02Icon, label: 'Polygons' },
  Geometry: { icon: GeometricShapes02Icon, label: 'Geometry' },
};
