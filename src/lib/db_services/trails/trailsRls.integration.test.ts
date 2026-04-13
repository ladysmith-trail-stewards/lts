/**
 * POC — CRUSH RLS tests for the `trails` table.
 *
 * Trails RLS access matrix (public trail, own region):
 *   anon        C=✗  R=✓  U=✗  S=✗  H=✗
 *   pending     C=✗  R=✓  U=✗  S=✗  H=✗
 *   user        C=✗  R=✓  U=✗  S=✗  H=✗
 *   super_user  C=✓  R=✓  U=✓  S=✗  H=✗
 *   admin       C=✓  R=✓  U=✓  S=✗  H=✗
 *   super_admin C=✓  R=✓  U=✓  S=✗  H=✓
 *
 * S=✗ for all roles — the block_deleted_at_update trigger rejects direct
 * writes to deleted_at for every app-level role.
 */

import { beforeAll, afterAll } from 'vitest';
import { TestSuite, type BuiltTestSuite } from '../testSuite';
import { tableRlsSuite } from '../rlsTestUtils';
import { SAMPLE_GEOMETRY } from './testHelpers';

const P = '__trails_rls_test__';
let suite: BuiltTestSuite;

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').createAllUsers().build();
});

afterAll(async () => {
  await suite.teardown();
});

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
    superUser: { c: true, r: true, u: true, s: false, h: false },
    admin: { c: true, r: true, u: true, s: false, h: false },
    superAdmin: { c: true, r: true, u: true, s: false, h: true },
  },
});
