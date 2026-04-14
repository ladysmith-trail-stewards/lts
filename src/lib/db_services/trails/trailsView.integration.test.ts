import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient } from '../../db_services/supabaseTestClients';
import { fixtureCreateTrail } from '../../db_services/trails/testHelpers';
import { TestSuite, type BuiltTestSuite } from '../../db_services/testSuite';

const P = '__trails_view_test__';
let suite: BuiltTestSuite;

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').build();
  await fixtureCreateTrail({
    name: `${P}public`,
    visibility: 'public',
    region_id: suite.regionId,
  });
});

afterAll(async () => {
  await suite.teardown();
});

describe('trails_view — response shape', () => {
  it('returns distance_m and geometry_geojson columns', async () => {
    const { data, error } = await serviceClient
      .from('trails_view')
      .select('distance_m, geometry_geojson')
      .eq('name', `${P}public`)
      .single();
    expect(error).toBeNull();
    expect(data).toHaveProperty('distance_m');
    expect(data).toHaveProperty('geometry_geojson');
    expect(typeof data!.distance_m).toBe('number');
    expect(data!.geometry_geojson).not.toBeNull();
  });
});
