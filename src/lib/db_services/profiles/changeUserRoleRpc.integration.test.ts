/**
 * Integration tests for the `change_user_role` RPC.
 *
 * Covers permission checks, role updates, and error cases.
 * The pg_net sign-out call is fire-and-forget; we only assert that
 * profiles.role is updated after a successful call.
 *
 * Two suites are created:
 *   - `suite`       — region A, all five standard roles.
 *   - `suiteB`      — region B, one user (for cross-region tests).
 */

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import {
  serviceClient,
  signedInClient,
} from '../../db_services/supabaseTestClients';
import { TestSuite, type BuiltTestSuite } from '../testSuite';

const P = '__change_user_role_rpc__';
let suite: BuiltTestSuite;
let suiteB: BuiltTestSuite;

beforeAll(async () => {
  [suite, suiteB] = await Promise.all([
    new TestSuite(P).createRegion('main').createAllUsers().build(),
    new TestSuite(`${P}b`).createRegion('other').createAllUsers().build(),
  ]);
});

afterAll(async () => {
  await Promise.all([suite.teardown(), suiteB.teardown()]);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callRpc(client: any, profileId: number, newRole: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client.rpc as any)('change_user_role', {
    target_profile_id: profileId,
    new_role: newRole,
  });
}

async function getRole(profileId: number): Promise<string | null> {
  const { data } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', profileId)
    .single();
  return data?.role ?? null;
}

// ---------------------------------------------------------------------------
// Non-admin callers — should be denied
// ---------------------------------------------------------------------------

describe('change_user_role — non-admin callers receive insufficient_privilege', () => {
  const targets = ['pending', 'user', 'superUser'] as const;

  for (const roleKey of targets) {
    it(`${roleKey} is denied`, async () => {
      const actor = suite[roleKey];
      const client = await signedInClient(actor.email, actor.password);
      const { error } = await callRpc(client, suite.user.profileId, 'pending');
      expect(error).not.toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// super_admin — can change any profile to any role
// ---------------------------------------------------------------------------

describe('change_user_role — super_admin', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;

  beforeAll(async () => {
    client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
  });

  it('can change a user in own region to pending', async () => {
    const target = suite.user;
    const { error } = await callRpc(client, target.profileId, 'pending');
    expect(error).toBeNull();
    expect(await getRole(target.profileId)).toBe('pending');
    // restore
    await serviceClient
      .from('profiles')
      .update({ role: 'user' })
      .eq('id', target.profileId);
  });

  it('can change a user in a different region', async () => {
    const target = suiteB.user;
    const { error } = await callRpc(client, target.profileId, 'super_user');
    expect(error).toBeNull();
    expect(await getRole(target.profileId)).toBe('super_user');
    // restore
    await serviceClient
      .from('profiles')
      .update({ role: 'user' })
      .eq('id', target.profileId);
  });

  it('can promote to admin', async () => {
    const target = suite.superUser;
    const { error } = await callRpc(client, target.profileId, 'admin');
    expect(error).toBeNull();
    expect(await getRole(target.profileId)).toBe('admin');
    // restore
    await serviceClient
      .from('profiles')
      .update({ role: 'super_user' })
      .eq('id', target.profileId);
  });

  it('same-role change is idempotent (succeeds)', async () => {
    const target = suite.pending;
    const { error } = await callRpc(client, target.profileId, 'pending');
    expect(error).toBeNull();
    expect(await getRole(target.profileId)).toBe('pending');
  });

  it('non-existent profile raises an error', async () => {
    const { error } = await callRpc(client, 999999999, 'user');
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// admin — region-scoped, cannot promote to super_admin
// ---------------------------------------------------------------------------

describe('change_user_role — admin', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;

  beforeAll(async () => {
    client = await signedInClient(suite.admin.email, suite.admin.password);
  });

  it('can change a pending user in own region to user', async () => {
    const target = suite.pending;
    const { error } = await callRpc(client, target.profileId, 'user');
    expect(error).toBeNull();
    expect(await getRole(target.profileId)).toBe('user');
    // restore
    await serviceClient
      .from('profiles')
      .update({ role: 'pending' })
      .eq('id', target.profileId);
  });

  it('can promote to admin in own region', async () => {
    const target = suite.superUser;
    const { error } = await callRpc(client, target.profileId, 'admin');
    expect(error).toBeNull();
    expect(await getRole(target.profileId)).toBe('admin');
    // restore
    await serviceClient
      .from('profiles')
      .update({ role: 'super_user' })
      .eq('id', target.profileId);
  });

  it('cannot change a profile in a different region', async () => {
    const { error } = await callRpc(client, suiteB.user.profileId, 'pending');
    expect(error).not.toBeNull();
  });

  it('cannot promote to super_admin', async () => {
    const { error } = await callRpc(
      client,
      suite.user.profileId,
      'super_admin'
    );
    expect(error).not.toBeNull();
  });
});
