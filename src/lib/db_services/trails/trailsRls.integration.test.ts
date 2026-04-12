/**
 * POC — CRUSH RLS tests for the `trails` table.
 *
 * Uses `tableRlsSuite` from rlsTestUtils to exercise all six security levels
 * (anon, pending, user, super_user, admin, super_admin) against the full
 * Create / Read / Update / Soft-delete / Hard-delete operation matrix.
 *
 * Soft-delete on `trails` is gated behind the `soft_delete_trails` RPC
 * (SECURITY DEFINER). The RPC sets `app.soft_delete_rpc = 'on'` so that the
 * `block_deleted_at_update` trigger allows the UPDATE; a direct UPDATE of
 * `deleted_at` is blocked for all app-level roles.
 *
 * Trails RLS access matrix (public trail, own region):
 *   anon        C=✗  R=✓  U=✗  S=✗  H=✗
 *   pending     C=✗  R=✓  U=✗  S=✗  H=✗
 *   user        C=✗  R=✓  U=✗  S=✗  H=✗
 *   super_user  C=✓  R=✓  U=✓  S=✓  H=✗   (own region only)
 *   admin       C=✓  R=✓  U=✓  S=✓  H=✗   (own region only)
 *   super_admin C=✓  R=✓  U=✓  S=✓  H=✓
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
  // Soft-delete must go through the RPC — direct deleted_at UPDATE is blocked
  // by the block_deleted_at_update trigger for all app-level roles.
  softDeleteFn: async (client, id) => {
    const { error } = await client.rpc('soft_delete_trails', { ids: [id] });
    return { error: error ? new Error(error.message) : null };
  },
  expected: {
    //                    C      R      U      S      H
    anon: [false, true, false, false, false],
    pending: [false, true, false, false, false],
    user: [false, true, false, false, false],
    superUser: [true, true, true, true, false],
    admin: [true, true, true, true, false],
    superAdmin: [true, true, true, true, true],
  },
});
