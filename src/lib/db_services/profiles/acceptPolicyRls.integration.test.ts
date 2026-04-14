/**
 * POC — RLS tests for the `accept_policy` RPC.
 *
 * Uses `rpcRlsSuite` from rlsTestUtils to verify call-success behaviour
 * across all six security levels.
 *
 * `accept_policy(p_region_id)` is a SECURITY DEFINER profile-update function:
 *   - Sets `policy_accepted_at = now()` and `region_id = p_region_id` for the
 *     calling user's profile.
 *   - Requires `authenticated` role to execute (anon is denied).
 *   - Internally enforces `user_role = 'pending'` — all other roles receive a
 *     permission-denied error.
 *
 * Expected per-role outcomes (success = no error returned):
 *   anon        = ✗  (EXECUTE not granted to anon)
 *   pending     = ✓  (only role permitted to accept the policy)
 *   user        = ✗  (only pending role may call this)
 *   super_user  = ✗
 *   admin       = ✗
 *   super_admin = ✗
 */

import { beforeAll, afterAll } from 'vitest';
import { TestSuite, type BuiltTestSuite } from '../testSuite';
import { rpcRlsSuite } from '../rlsTestUtils';

const P = '__accept_policy_rls_test__';
let suite: BuiltTestSuite;

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').createAllUsers().build();
});

afterAll(async () => {
  await suite.teardown();
});

rpcRlsSuite({
  suite: () => suite,
  rpc: 'accept_policy',
  // Pass the suite region so accept_policy can update the pending user's region.
  params: () => ({ p_region_id: suite.regionId }),
  expected: {
    anon: false, // EXECUTE not granted to anon
    pending: true, // only role that may accept the policy
    user: false, // permission denied: only pending users may accept
    superUser: false,
    admin: false,
    superAdmin: false,
  },
});
