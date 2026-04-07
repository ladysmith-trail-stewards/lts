import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  signedInClient,
  serviceClient,
} from '../../db_services/supabaseTestClients';
import {
  fixtureCreateTrail,
  fixtureDeleteTrails,
} from '../../db_services/trails/testHelpers';
import {
  suiteSetup,
  suiteTeardown,
  type SuiteFixtures,
} from '../../db_services/profiles/testHelpers';

/**
 * RLS integration tests — requires:
 *   1. `supabase start` (Docker running)
 *   2. `supabase db reset` (migrations + seed applied)
 *
 * Strategy: sign in as each seed user, then query using their
 * session JWT so Postgres evaluates RLS as that user.
 *
 * Role checks now use JWT claims (user_role, region_id) injected by the
 * custom access token hook — no RPC round-trips needed.
 */

const P = '__rls_test__';
const safeTag = P.replace(/[^a-z0-9]/gi, '_').toLowerCase();
const RLS_USER_NAME = `i_test_${safeTag}_user`;
const RLS_ADMIN_NAME = `i_test_${safeTag}_admin`;

let suite: SuiteFixtures;

/** Decode the payload of a JWT without verifying the signature. */
function decodeJwtPayload(token: string): Record<string, unknown> {
  // Base64url → base64: replace - with + and _ with /
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(b64));
}

beforeAll(async () => {
  suite = await suiteSetup(P);
});

afterAll(async () => {
  await suiteTeardown(suite);
});

describe('RLS — profiles table', () => {
  describe('regular user', () => {
    let client: Awaited<ReturnType<typeof signedInClient>>;

    beforeAll(async () => {
      client = await signedInClient(suite.user.email, suite.user.password);
    });

    it('can read their own profile', async () => {
      const { data, error } = await client.from('profiles').select('name');
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].name).toBe(RLS_USER_NAME);
    });

    it('cannot see other profiles', async () => {
      const { data, error } = await client.from('profiles').select('name');
      expect(error).toBeNull();
      const names = data!.map((p) => p.name);
      expect(names).not.toContain(RLS_ADMIN_NAME);
    });

    it('cannot insert a new profile', async () => {
      const { error } = await client.from('profiles').insert({
        auth_user_id: '00000000-0000-0000-0000-000000000099',
        name: 'Intruder',
        region_id: suite.regionId,
      });
      expect(error).not.toBeNull();
    });

    it('cannot delete profiles', async () => {
      await client.from('profiles').delete().eq('name', RLS_USER_NAME);

      const { data } = await serviceClient
        .from('profiles')
        .select('name')
        .eq('name', RLS_USER_NAME);
      expect(data).toHaveLength(1);
    });
  });

  describe('admin user', () => {
    let client: Awaited<ReturnType<typeof signedInClient>>;

    beforeAll(async () => {
      client = await signedInClient(suite.admin.email, suite.admin.password);
    });

    it('can read all local profiles', async () => {
      const { data, error } = await client
        .from('profiles')
        .select('name')
        .order('name');
      expect(error).toBeNull();
      // Admin sees all profiles in their region.
      expect(data!.length).toBeGreaterThanOrEqual(1);
      const names = data!.map((p) => p.name);
      expect(names).toContain(RLS_USER_NAME);
      expect(names).toContain(RLS_ADMIN_NAME);
    });

    it("can update another user's profile", async () => {
      const { error } = await client
        .from('profiles')
        .update({ bio: 'Updated by admin' })
        .eq('id', suite.user.profileId);
      expect(error).toBeNull();

      // Restore
      await client
        .from('profiles')
        .update({ bio: null })
        .eq('id', suite.user.profileId);
    });
  });
});

describe('RLS — role checks via JWT claims', () => {
  it('regular user JWT has user_role = user', async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    expect(token).toBeTruthy();
    const payload = decodeJwtPayload(token!);
    expect(payload.user_role).toBe('user');
  });

  it('admin user JWT has user_role = admin', async () => {
    const client = await signedInClient(
      suite.admin.email,
      suite.admin.password
    );
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    expect(token).toBeTruthy();
    const payload = decodeJwtPayload(token!);
    expect(payload.user_role).toBe('admin');
  });
});

// ---------------------------------------------------------------------------
// JWT claims — full coverage
// ---------------------------------------------------------------------------
describe('JWT claims — custom_access_token_hook', () => {
  it('super_user JWT has user_role = super_user', async () => {
    const client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.user_role).toBe('super_user');
  });

  it('super_admin JWT has user_role = super_admin', async () => {
    const client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.user_role).toBe('super_admin');
  });

  it('pending JWT has user_role = pending', async () => {
    const client = await signedInClient(
      suite.pending.email,
      suite.pending.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.user_role).toBe('pending');
  });

  it('JWT contains region_id for user', async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.region_id).toBe(suite.regionId);
  });

  it('is_admin = true for admin', async () => {
    const client = await signedInClient(
      suite.admin.email,
      suite.admin.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.is_admin).toBe(true);
  });

  it('is_admin = true for super_admin', async () => {
    const client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.is_admin).toBe(true);
  });

  it('is_admin = false for user', async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.is_admin).toBe(false);
  });

  it('is_admin = false for super_user', async () => {
    const client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.is_admin).toBe(false);
  });

  it('is_admin = false for pending', async () => {
    const client = await signedInClient(
      suite.pending.email,
      suite.pending.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.is_admin).toBe(false);
  });

  it('token user_role = pending after profile is soft-deleted', async () => {
    // Create a throwaway auth user + profile, soft-delete the profile,
    // then sign in again and verify the hook yields pending.
    const throwawayEmail =
      'i_test___rls_hook_softdelete__@test-fixture.invalid';
    const throwawayPassword = 'fixture-password-123';

    // Create auth user
    const { data: created } = await serviceClient.auth.admin.createUser({
      email: throwawayEmail,
      password: throwawayPassword,
      email_confirm: true,
    });
    const authUserId = created.user!.id;

    // handle_new_user trigger creates the profile; fetch it
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('auth_user_id', authUserId)
      .single();

    // Soft-delete via service role (bypasses column-level restriction)
    await serviceClient
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', profile!.id);

    // Sign in — hook should see deleted_at is not null and fall back to pending
    const client = await signedInClient(throwawayEmail, throwawayPassword);
    const { data: session } = await client.auth.getSession();
    const payload = decodeJwtPayload(session.session!.access_token);

    // Cleanup
    await serviceClient.auth.admin.deleteUser(authUserId);

    expect(payload.user_role).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// trails — deleted_at column-level protection
// ---------------------------------------------------------------------------
describe('trails RLS — deleted_at cannot be set directly', () => {
  let trailId: number;

  beforeAll(async () => {
    trailId = await fixtureCreateTrail({
      name: `${P}rls_deleted_at_test`,
      region_id: suite.regionId,
    });
  });

  afterAll(async () => {
    await fixtureDeleteTrails(trailId);
  });

  it('user cannot set deleted_at directly via UPDATE', async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    // Cast through unknown to sidestep the generated types which correctly exclude deleted_at
    await client
      .from('trails')
      .update({ deleted_at: new Date().toISOString() } as unknown as {
        name: string;
      })
      .eq('id', trailId);
    // PostgREST silently drops columns not in the column grant — deleted_at must remain null.
    const { data } = await serviceClient
      .from('trails')
      .select('deleted_at')
      .eq('id', trailId)
      .single();
    expect(data!.deleted_at).toBeNull();
  });

  it('super_admin cannot set deleted_at directly via UPDATE', async () => {
    const client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
    await client
      .from('trails')
      .update({ deleted_at: new Date().toISOString() } as unknown as {
        name: string;
      })
      .eq('id', trailId);
    // Trigger blocks the update even for super_admin — deleted_at must remain null.
    const { data } = await serviceClient
      .from('trails')
      .select('deleted_at')
      .eq('id', trailId)
      .single();
    expect(data!.deleted_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// trails — cross-region INSERT/UPDATE blocking
// ---------------------------------------------------------------------------
describe('trails RLS — cross-region write blocking', () => {
  let region2Id: number;
  let region1TrailId: number;
  let region2TrailId: number;

  beforeAll(async () => {
    // Create a second suite-local region for cross-region tests
    const safeTag = P.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const { data: r2, error: r2Err } = await serviceClient
      .from('regions')
      .insert({ name: `i_test_${safeTag}_region2` })
      .select('id')
      .single();
    if (r2Err) throw new Error(`rls: create region2: ${r2Err.message}`);
    region2Id = r2.id;

    region1TrailId = await fixtureCreateTrail({
      name: `${P}xregion_r1`,
      region_id: suite.regionId,
    });
    region2TrailId = await fixtureCreateTrail({
      name: `${P}xregion_r2`,
      region_id: region2Id,
    });
  });

  afterAll(async () => {
    await fixtureDeleteTrails(region1TrailId, region2TrailId);
    await serviceClient.from('regions').delete().eq('id', region2Id);
  });

  it('super_user cannot INSERT a trail in a different region', async () => {
    const client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
    const { error } = await client.from('trails').insert({
      name: `${P}superuser_wrong_region`,
      type: 'trail',
      visibility: 'public',
      region_id: region2Id,
      geometry: 'SRID=4326;LINESTRING(-123.82 48.98,-123.81 48.97)',
    });
    expect(error).not.toBeNull();
  });

  it('super_user cannot UPDATE a trail in a different region', async () => {
    const client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
    const before = await serviceClient
      .from('trails')
      .select('name')
      .eq('id', region2TrailId)
      .single();
    await client
      .from('trails')
      .update({ name: `${P}superuser_overwrite` })
      .eq('id', region2TrailId);
    const after = await serviceClient
      .from('trails')
      .select('name')
      .eq('id', region2TrailId)
      .single();
    expect(after.data!.name).toBe(before.data!.name);
  });

  it('admin cannot INSERT a trail in a different region', async () => {
    const client = await signedInClient(
      suite.admin.email,
      suite.admin.password
    );
    const { error } = await client.from('trails').insert({
      name: `${P}admin_wrong_region`,
      type: 'trail',
      visibility: 'public',
      region_id: region2Id,
      geometry: 'SRID=4326;LINESTRING(-123.82 48.98,-123.81 48.97)',
    });
    expect(error).not.toBeNull();
  });

  it('admin cannot UPDATE a trail in a different region', async () => {
    const client = await signedInClient(
      suite.admin.email,
      suite.admin.password
    );
    const before = await serviceClient
      .from('trails')
      .select('name')
      .eq('id', region2TrailId)
      .single();
    await client
      .from('trails')
      .update({ name: `${P}admin_overwrite` })
      .eq('id', region2TrailId);
    const after = await serviceClient
      .from('trails')
      .select('name')
      .eq('id', region2TrailId)
      .single();
    expect(after.data!.name).toBe(before.data!.name);
  });
});
