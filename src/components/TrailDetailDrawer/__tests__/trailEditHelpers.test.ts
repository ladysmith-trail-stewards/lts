import { describe, it, expect } from 'vitest';
import { trailToForm, extractFormErrors } from '../trailEditHelpers';
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
    geometry: { type: 'LineString', coordinates: [] },
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
