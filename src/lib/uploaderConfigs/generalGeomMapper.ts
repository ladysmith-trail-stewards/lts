import type { GeneralGeomFeatureImportMapper } from '@/lib/db_services/general_geom/importGeneralGeomCollectionDb';

export interface GeneralGeomRawFeature {
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown>;
}

export const DEFAULT_GENERAL_GEOM_MAPPER: GeneralGeomFeatureImportMapper = {
  type: { field: '', fallback: 'feature' },
  subtype: { field: '', fallback: '' },
  visibility: { field: '', fallback: 'public' },
  description: {
    field: '',
    fallback: '',
    include_props_json: false,
  },
  label: {
    field: '',
    fallback: '',
    auto_increment_suffix: 'feat',
  },
};

export function listMapperFields(features: GeneralGeomRawFeature[]): string[] {
  const keys = new Set<string>();
  for (const feature of features) {
    for (const key of Object.keys(feature.properties)) {
      keys.add(key);
    }
  }
  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

export function mapFeatureLabel(
  feature: GeneralGeomRawFeature,
  mapper: GeneralGeomFeatureImportMapper,
  index: number
): string {
  const fieldValue = readAsString(feature.properties[mapper.label.field]);
  if (fieldValue) return fieldValue;

  if (mapper.label.fallback.trim()) return mapper.label.fallback.trim();

  return `${(mapper.label.auto_increment_suffix || 'Feature').trim()}-${index + 1}`;
}

function readAsString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return '';
}
