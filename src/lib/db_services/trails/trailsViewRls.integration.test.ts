/**
 * POC — read-visibility RLS tests for the `trails_view` view.
 *
 * Uses `viewRlsSuite` from rlsTestUtils to check whether each security level
 * can see a public, non-deleted trail row in the view.
 *
 * trails_view uses security_invoker and excludes soft-deleted rows.
 * Public trails are visible to anon; all authenticated roles see them too.
 *
 *   anon        R=✓  (public trail is visible)
 *   pending     R=✓
 *   user        R=✓
 *   super_user  R=✓
 *   admin       R=✓
 *   super_admin R=✓
 */

import { beforeAll, afterAll } from 'vitest';
import { serviceClient } from '../supabaseTestClients';
import { TestSuite, type BuiltTestSuite } from '../testSuite';
import { viewRlsSuite } from '../rlsTestUtils';
import { fixtureCreateTrail } from './testHelpers';

const P = '__trails_view_rls_test__';
let suite: BuiltTestSuite;
let publicTrailId: number;
let softDeletedTrailId: number;

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').createAllUsers().build();

  [publicTrailId, softDeletedTrailId] = await Promise.all([
    fixtureCreateTrail({
      name: `${P}public`,
      visibility: 'public',
      region_id: suite.regionId,
    }),
    fixtureCreateTrail({
      name: `${P}soft-deleted`,
      visibility: 'public',
      region_id: suite.regionId,
    }),
  ]);

  // Soft-delete the second trail via service_role (service_role bypasses
  // the block_deleted_at_update trigger).
  await serviceClient
    .from('trails')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', softDeletedTrailId);
});

afterAll(async () => {
  await suite.teardown();
});

// ── Public trail: all roles should see it ──────────────────────────────────
viewRlsSuite({
  suite: () => suite,
  view: 'trails_view',
  rowId: () => publicTrailId,
  expected: {
    anon: true,
    pending: true,
    user: true,
    superUser: true,
    admin: true,
    superAdmin: true,
  },
});

// ── Soft-deleted trail: no role should see it in the view ──────────────────
viewRlsSuite({
  suite: () => suite,
  view: 'trails_view',
  label: 'trails_view (soft-deleted row)',
  rowId: () => softDeletedTrailId,
  expected: {
    anon: false,
    pending: false,
    user: false,
    superUser: false,
    admin: false,
    superAdmin: false,
  },
});
