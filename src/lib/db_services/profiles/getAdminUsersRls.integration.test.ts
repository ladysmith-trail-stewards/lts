/**
 * POC — RLS tests for the `get_admin_users` RPC.
 *
 * Uses `rpcRlsSuite` from rlsTestUtils to verify call-success behaviour
 * across all six security levels.
 *
 * `get_admin_users` is a SECURITY DEFINER function that:
 *   - Requires `authenticated` role to execute (anon is denied).
 *   - Internally filters by `user_role IN ('admin', 'super_admin')`, so
 *     non-admin callers receive an empty result set without an error.
 *
 * Expected per-role outcomes (success = no error returned):
 *   anon        = ✗  (EXECUTE not granted to anon)
 *   pending     = ✓  (callable; returns empty set)
 *   user        = ✓  (callable; returns empty set)
 *   super_user  = ✓  (callable; returns empty set)
 *   admin       = ✓  (callable; returns rows)
 *   super_admin = ✓  (callable; returns rows)
 */

import { beforeAll, afterAll } from 'vitest';
import { TestSuite, type BuiltTestSuite } from '../testSuite';
import { rpcRlsSuite } from '../rlsTestUtils';

const P = '__get_admin_users_rls_test__';
let suite: BuiltTestSuite;

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').createAllUsers().build();
});

afterAll(async () => {
  await suite.teardown();
});

rpcRlsSuite({
  suite: () => suite,
  rpc: 'get_admin_users',
  // No parameters — get_admin_users() takes none.
  expected: {
    anon: false, // EXECUTE not granted to anon → permission denied
    pending: true, // callable; internal filter returns empty set
    user: true, // callable; internal filter returns empty set
    superUser: true, // callable; internal filter returns empty set
    admin: true, // callable; returns rows for own region
    superAdmin: true, // callable; returns all rows
  },
});
