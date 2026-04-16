import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GENERAL_GEOM_MAPPER,
  listMapperFields,
  mapFeatureLabel,
  type GeneralGeomRawFeature,
} from './generalGeomMapper';

const pointFeature = (
  properties: Record<string, unknown>
): GeneralGeomRawFeature => ({
  geometry: { type: 'Point', coordinates: [-123.8, 49] },
  properties,
});

describe('generalGeomMapper', () => {
  it('lists unique mapper fields sorted', () => {
    const fields = listMapperFields([
      pointFeature({ subtype: 'bench', name: 'A' }),
      pointFeature({ visibility: 'public', name: 'B' }),
    ]);

    expect(fields).toEqual(['name', 'subtype', 'visibility']);
  });

  it('uses mapper label field when present', () => {
    const label = mapFeatureLabel(
      pointFeature({ name: 'Creek Crossing' }),
      DEFAULT_GENERAL_GEOM_MAPPER,
      0
    );

    expect(label).toBe('Creek Crossing');
  });

  it('falls back to auto increment suffix when no label value exists', () => {
    const label = mapFeatureLabel(
      pointFeature({}),
      {
        ...DEFAULT_GENERAL_GEOM_MAPPER,
        label: {
          field: 'label',
          fallback: '',
          auto_increment_suffix: 'Imported Feature ',
        },
      },
      2
    );

    expect(label).toBe('Imported Feature 3');
  });
});
