import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getRegionsDb } from './getRegionsDb';
import { serviceClient } from '../supabaseTestClients';
import { TestSuite, type BuiltTestSuite } from '../testSuite';

const P = '__get_regions_test__';

let suite: BuiltTestSuite;

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').build();
});

afterAll(async () => {
  await suite.teardown();
});

describe('getRegionsDb({ metaOnly: true }) — excludes Default region (id=0)', () => {
  it('returns only regions with id > 0', async () => {
    const { data, error } = await getRegionsDb(serviceClient, {
      metaOnly: true,
    });
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    for (const r of data!) {
      expect(r.id).toBeGreaterThan(0);
    }
  });

  it('includes the suite-local region', async () => {
    const { data, error } = await getRegionsDb(serviceClient, {
      metaOnly: true,
    });
    expect(error).toBeNull();
    expect(data!.map((r) => r.id)).toContain(suite.regionId);
  });

  it('returns results ordered by name', async () => {
    const { data, error } = await getRegionsDb(serviceClient, {
      metaOnly: true,
    });
    expect(error).toBeNull();
    const fixtureNames = data!
      .filter((r) => r.name.startsWith('i_test_'))
      .map((r) => r.name);
    expect(fixtureNames).toEqual([...fixtureNames].sort());
  });
});

describe('getRegionsDb({ metaOnly: true }) — response shape', () => {
  it('each region has id and name, no bbox', async () => {
    const { data, error } = await getRegionsDb(serviceClient, {
      metaOnly: true,
    });
    expect(error).toBeNull();
    for (const r of data!) {
      expect(typeof r.id).toBe('number');
      expect(typeof r.name).toBe('string');
      expect(r.name.length).toBeGreaterThan(0);
      expect((r as unknown as Record<string, unknown>)['bbox']).toBeUndefined();
    }
  });
});

describe('getRegionsDb() — full record with bbox', () => {
  it('returns id, name and bbox', async () => {
    const { data, error } = await getRegionsDb(serviceClient);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    for (const r of data!) {
      expect(typeof r.id).toBe('number');
      expect(typeof r.name).toBe('string');
      if (r.bbox !== null) {
        expect(Array.isArray(r.bbox)).toBe(true);
        expect(r.bbox).toHaveLength(4);
        for (const coord of r.bbox) {
          expect(typeof coord).toBe('number');
        }
      }
    }
  });
});

describe('getRegionsDb — pending user', () => {
  it.todo('pending (google SSO) user can read regions (metaOnly)');
  it.todo('pending (google SSO) user can read regions with bbox');
});
