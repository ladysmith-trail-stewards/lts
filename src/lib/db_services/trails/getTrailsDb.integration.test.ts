import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTrailsDb } from './getTrailsDb';
import { serviceClient } from '../supabaseTestClients';
import { fixtureCreateTrail } from './testHelpers';
import { TestSuite, type BuiltTestSuite } from '../testSuite';

const P = '__gt_test__';
const NAME = `${P}public`;

let suite: BuiltTestSuite;

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').build();
  await fixtureCreateTrail({
    name: NAME,
    visibility: 'public',
    hidden: false,
    region_id: suite.regionId,
  });
});

afterAll(async () => {
  await suite.teardown();
});

describe('getTrailsDb — response shape', () => {
  it('returns geometry_geojson as a GeoJSON LineString object', async () => {
    const { data, error } = await getTrailsDb(serviceClient);
    expect(error).toBeNull();

    const trail = (data ?? []).find((t) => t.name === NAME);
    expect(trail).toBeDefined();

    const geom = trail!.geometry_geojson as {
      type: string;
      coordinates: number[][];
    };
    expect(geom.type).toBe('LineString');
    expect(Array.isArray(geom.coordinates)).toBe(true);
    expect(geom.coordinates.length).toBeGreaterThanOrEqual(2);
  });

  it('returns distance_m as a positive number', async () => {
    const { data, error } = await getTrailsDb(serviceClient);
    expect(error).toBeNull();

    const trail = (data ?? []).find((t) => t.name === NAME);
    expect(trail).toBeDefined();
    expect(typeof trail!.distance_m).toBe('number');
    expect(trail!.distance_m).toBeGreaterThan(0);
  });

  it('returns expected trail fields', async () => {
    const { data } = await getTrailsDb(serviceClient);
    const trail = (data ?? []).find((t) => t.name === NAME);
    expect(trail).toMatchObject({
      name: NAME,
      visibility: 'public',
      hidden: false,
      type: 'trail',
      region_id: suite.regionId,
    });
  });
});

describe('getTrailsDb — pending user', () => {
  it.todo('pending (google SSO) user sees only public trails');
});
