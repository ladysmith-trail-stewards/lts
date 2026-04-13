import { beforeAll, afterAll, describe } from 'vitest';
import { TestSuite, type BuiltTestSuite } from '../testSuite';
import { rpcRlsSuite } from '../rlsTestUtils';
import { SAMPLE_GEOMETRY } from './testHelpers';

const P = '__upsert_trails_rls_test__';
let suite: BuiltTestSuite;

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').createAllUsers().build();
});

afterAll(async () => {
  await suite.teardown();
});

describe('upsert_trails RPC — RLS', () => {
  rpcRlsSuite({
    suite: () => suite,
    rpc: 'upsert_trails',
    params: () => ({
      features: JSON.parse(
        JSON.stringify([
          {
            type: 'Feature',
            geometry: SAMPLE_GEOMETRY,
            properties: {
              name: `${P}trail`,
              type: 'trail',
              visibility: 'public',
              region_id: suite.regionId,
            },
          },
        ])
      ),
    }),
    expected: {
      anon: false,
      pending: false,
      user: false,
      superUser: true,
      admin: true,
      superAdmin: true,
    },
  });
});
