/**
 * CRUSH RLS tests for the `trails` table.
 *
 * Trails RLS access matrix (public trail, own region):
 *   anon        C=✗  R=✓  U=✗  S=✗  H=✗
 *   pending     C=✗  R=✓  U=✗  S=✗  H=✗
 *   user        C=✗  R=✓  U=✗  S=✗  H=✗
 *   super_user  C=✓  R=✓  U=✓  S=✓  H=✗
 *   admin       C=✓  R=✓  U=✓  S=✓  H=✗
 *   super_admin C=✓  R=✓  U=✓  S=✓  H=✓
 *
 * Cross-region matrix (trail belongs to region2, caller is in region1):
 *   super_user  C=✗  R=✓  U=✗
 *   admin       C=✗  R=✓  U=✗
 *   super_admin C=✓  R=✓  U=✓  (not region-scoped)
 */

import { beforeAll, afterAll, describe } from 'vitest';
import { TestSuite, type BuiltTestSuite } from '../testSuite';
import { tableRlsSuite } from '../rlsTestUtils';
import { SAMPLE_GEOMETRY, fixtureCreateTrail } from './testHelpers';

const P = '__trails_rls_test__';
let suite: BuiltTestSuite;
let region2TrailId: number;

beforeAll(async () => {
  suite = await new TestSuite(P)
    .createRegion('main')
    .createRegion('region_2')
    .createAllUsers()
    .build();

  region2TrailId = await fixtureCreateTrail({
    name: `${P}xregion_r2`,
    region_id: suite.get().regions[1].id,
  });
});

afterAll(async () => {
  await suite.teardown();
});

describe('trails RLS — own region', () => {
  tableRlsSuite({
    suite: () => suite,
    table: 'trails',
    insertData: () => ({
      name: `${P}trail`,
      type: 'trail',
      visibility: 'public',
      region_id: suite.regionId,
      geometry: SAMPLE_GEOMETRY as unknown as string,
    }),
    updateData: { description: `${P}updated` },
    expected: {
      anon: { c: false, r: true, u: false, s: false, h: false },
      pending: { c: false, r: true, u: false, s: false, h: false },
      user: { c: false, r: true, u: false, s: false, h: false },
      superUser: { c: true, r: true, u: true, s: true, h: false },
      admin: { c: true, r: true, u: true, s: true, h: false },
      superAdmin: { c: true, r: true, u: true, s: true, h: true },
    },
  });
});

describe('trails RLS — cross-region', () => {
  tableRlsSuite({
    suite: () => suite,
    table: 'trails',
    insertData: () => ({
      name: `${P}xregion_insert`,
      type: 'trail',
      visibility: 'public',
      region_id: suite.get().regions[1].id,
      geometry: SAMPLE_GEOMETRY as unknown as string,
    }),
    updateData: { description: `${P}xregion_updated` },
    rowId: () => region2TrailId,
    expected: {
      superUser: { c: false, r: true, u: false },
      admin: { c: false, r: true, u: false },
      superAdmin: { c: true, r: true, u: true },
    },
  });
});
