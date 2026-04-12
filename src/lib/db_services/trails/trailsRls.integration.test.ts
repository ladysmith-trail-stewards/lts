/**
 * POC — CRUSH RLS tests for the `trails` table.
 *
 * Uses `tableRlsSuite` from rlsTestUtils to exercise all six security levels
 * (anon, pending, user, super_user, admin, super_admin) against the full
 * Create / Read / Update / Soft-delete / Hard-delete operation matrix.
 *
 * The S (soft-delete) step attempts a direct UPDATE of deleted_at. The
 * block_deleted_at_update trigger rejects this for every app-level role, so
 * S=false for all roles. Soft-delete via the SECURITY DEFINER RPCs is a
 * separate concern tested implicitly by the trigger itself.
 *
 * Trails RLS access matrix (public trail, own region):
 *   anon        C=✗  R=✓  U=✗  S=✗  H=✗   (public non-deleted trails are readable)
 *   pending     C=✗  R=✓  U=✗  S=✗  H=✗
 *   user        C=✗  R=✓  U=✗  S=✗  H=✗
 *   super_user  C=✓  R=✓  U=✓  S=✗  H=✗   (own region; trigger blocks deleted_at)
 *   admin       C=✓  R=✓  U=✓  S=✗  H=✗   (own region; trigger blocks deleted_at)
 *   super_admin C=✓  R=✓  U=✓  S=✗  H=✓   (trigger blocks deleted_at direct write)
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
    //                    C      R      U      S      H
    anon: [false, true, false, false, false],
    pending: [false, true, false, false, false],
    user: [false, true, false, false, false],
    superUser: [true, true, true, false, false],
    admin: [true, true, true, false, false],
    superAdmin: [true, true, true, false, true],
  },
});
