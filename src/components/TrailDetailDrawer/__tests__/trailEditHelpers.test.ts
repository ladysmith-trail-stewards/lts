import { describe, it, expect } from 'vitest';
import {
  trailToForm,
  extractFormErrors,
  formatDistance,
} from '../trailEditHelpers';
import type { Trail } from '@/hooks/useTrails';

// ── Minimal Trail factory ─────────────────────────────────────────────────────

function makeTrail(overrides: Partial<Trail> = {}): Trail {
  return {
    id: 1,
    name: 'Test Trail',
    description: null,
    type: 'trail',
    trail_class: 'INTERMEDIATE',
    activity_types: ['Biking'],
    direction: 'both',
    hidden: false,
    planned: false,
    connector: false,
    bike: true,
    tf_popularity: null,
    visibility: 'public',
    region_id: 1,
    distance_m: null,
    geometry_geojson: { type: 'LineString', coordinates: [] },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Trail;
}

// ── trailToForm ───────────────────────────────────────────────────────────────

describe('trailToForm', () => {
  it('maps all known fields correctly', () => {
    const result = trailToForm(makeTrail());
    expect(result.name).toBe('Test Trail');
    expect(result.trail_class).toBe('INTERMEDIATE');
    expect(result.direction).toBe('both');
    expect(result.activity_types).toEqual(['Biking']);
    expect(result.planned).toBe(false);
    expect(result.connector).toBe(false);
    expect(result.visibility).toBe('public');
  });

  it('converts null description to undefined', () => {
    const result = trailToForm(makeTrail({ description: null }));
    expect(result.description).toBeUndefined();
  });

  it('preserves string description', () => {
    const result = trailToForm(makeTrail({ description: 'Nice trail' }));
    expect(result.description).toBe('Nice trail');
  });

  it('falls back trail_class to EASIEST when unknown', () => {
    const result = trailToForm(makeTrail({ trail_class: 'BOGUS' }));
    expect(result.trail_class).toBe('EASIEST');
  });

  it('falls back trail_class to EASIEST when null', () => {
    const result = trailToForm(
      makeTrail({ trail_class: null as unknown as string })
    );
    expect(result.trail_class).toBe('EASIEST');
  });

  it('falls back direction to both when unknown', () => {
    const result = trailToForm(makeTrail({ direction: 'sideways' }));
    expect(result.direction).toBe('both');
  });

  it('falls back direction to both when null', () => {
    const result = trailToForm(
      makeTrail({ direction: null as unknown as string })
    );
    expect(result.direction).toBe('both');
  });

  it('falls back visibility to public when unknown', () => {
    const result = trailToForm(makeTrail({ visibility: 'secret' }));
    expect(result.visibility).toBe('public');
  });

  it('falls back visibility to public when null', () => {
    const result = trailToForm(
      makeTrail({ visibility: null as unknown as string })
    );
    expect(result.visibility).toBe('public');
  });

  it('defaults null activity_types to empty array', () => {
    const result = trailToForm(
      makeTrail({ activity_types: null as unknown as string[] })
    );
    expect(result.activity_types).toEqual([]);
  });

  it('defaults null planned to false', () => {
    const result = trailToForm(
      makeTrail({ planned: null as unknown as boolean })
    );
    expect(result.planned).toBe(false);
  });

  it('defaults null connector to false', () => {
    const result = trailToForm(
      makeTrail({ connector: null as unknown as boolean })
    );
    expect(result.connector).toBe(false);
  });
});

// ── extractFormErrors ─────────────────────────────────────────────────────────

describe('extractFormErrors', () => {
  it('returns empty object for no issues', () => {
    expect(extractFormErrors([])).toEqual({});
  });

  it('maps a single issue to the correct key', () => {
    const issues = [{ path: [{ key: 'name' }], message: 'Name is required' }];
    expect(extractFormErrors(issues)).toEqual({ name: 'Name is required' });
  });

  it('maps multiple issues', () => {
    const issues = [
      { path: [{ key: 'name' }], message: 'Name is required' },
      { path: [{ key: 'trail_class' }], message: 'Invalid value' },
    ];
    expect(extractFormErrors(issues)).toEqual({
      name: 'Name is required',
      trail_class: 'Invalid value',
    });
  });

  it('last issue wins for duplicate keys', () => {
    const issues = [
      { path: [{ key: 'name' }], message: 'First error' },
      { path: [{ key: 'name' }], message: 'Second error' },
    ];
    expect(extractFormErrors(issues)).toEqual({ name: 'Second error' });
  });

  it('skips issues with no path', () => {
    const issues = [{ path: undefined, message: 'Top-level error' }];
    expect(extractFormErrors(issues)).toEqual({});
  });
});

// ── formatDistance ────────────────────────────────────────────────────────────

describe('formatDistance', () => {
  it('returns — for null', () => {
    expect(formatDistance(null)).toBe('—');
  });

  it('formats 0 m as whole metres', () => {
    expect(formatDistance(0)).toBe('0 m');
  });

  it('formats a sub-2000 m distance as whole metres', () => {
    expect(formatDistance(1234)).toBe('1,234 m');
  });

  it('rounds sub-2000 m to the nearest metre', () => {
    expect(formatDistance(999.7)).toBe('1,000 m');
  });

  it('boundary: 1999 m shows metres', () => {
    expect(formatDistance(1999)).toBe('1,999 m');
  });

  it('boundary: 2000 m shows km', () => {
    expect(formatDistance(2000)).toBe('2.00 km');
  });

  it('formats over-2000 m as km with 2 decimal places', () => {
    expect(formatDistance(5432)).toBe('5.43 km');
  });

  it('formats a large distance in km', () => {
    expect(formatDistance(12345)).toBe('12.35 km');
  });
});
