import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  signedInClient,
  serviceClient,
  SEED_USER,
  SEED_ADMIN,
  SEED_SUPER_USER,
  SEED_SUPER_ADMIN,
  SEED_PENDING,
} from '../../db_services/supabaseTestClients';
import {
  fixtureCreateTrail,
  fixtureDeleteTrails,
} from '../../db_services/trails/testHelpers';

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

/** Decode the payload of a JWT without verifying the signature. */
function decodeJwtPayload(token: string): Record<string, unknown> {
  // Base64url → base64: replace - with + and _ with /
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(b64));
}

describe('RLS — profiles table', () => {
  describe('regular user (user@test.com)', () => {
    let client: Awaited<ReturnType<typeof signedInClient>>;

    beforeAll(async () => {
      client = await signedInClient('user@test.com', 'password123');
    });

    it('can read their own profile', async () => {
      const { data, error } = await client.from('profiles').select('name');
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].name).toBe('Test User');
    });

    it('cannot see other profiles', async () => {
      const { data, error } = await client.from('profiles').select('name');
      expect(error).toBeNull();
      const names = data!.map((p) => p.name);
      expect(names).not.toContain('Admin User');
    });

    it('cannot insert a new profile', async () => {
      const { error } = await client.from('profiles').insert({
        auth_user_id: '00000000-0000-0000-0000-000000000099',
        name: 'Intruder',
        region_id: 1,
      });
      expect(error).not.toBeNull();
    });

    it('cannot delete profiles', async () => {
      await client.from('profiles').delete().eq('name', 'Test User');

      const { data } = await serviceClient
        .from('profiles')
        .select('name')
        .eq('name', 'Test User');
      expect(data).toHaveLength(1);
    });
  });

  describe('admin user (admin@test.com)', () => {
    let client: Awaited<ReturnType<typeof signedInClient>>;

    beforeAll(async () => {
      client = await signedInClient('admin@test.com', 'password123');
    });

    it('can read all local profiles', async () => {
      const { data, error } = await client
        .from('profiles')
        .select('name')
        .order('name');
      expect(error).toBeNull();
      // Admin sees all profiles in their region (region_id = 1).
      // At minimum the 4 seed profiles; test fixture users may also be present.
      expect(data!.length).toBeGreaterThanOrEqual(4);
      const names = data!.map((p) => p.name);
      expect(names).toContain('Test User');
      expect(names).toContain('Admin User');
    });

    it("can update another user's profile", async () => {
      const { error } = await client
        .from('profiles')
        .update({ bio: 'Updated by admin' })
        .eq('name', 'Test User');
      expect(error).toBeNull();

      // Restore
      await client
        .from('profiles')
        .update({ bio: null })
        .eq('name', 'Test User');
    });
  });
});

describe('RLS — role checks via JWT claims', () => {
  it('regular user JWT has user_role = user', async () => {
    const client = await signedInClient('user@test.com', 'password123');
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    expect(token).toBeTruthy();
    const payload = decodeJwtPayload(token!);
    expect(payload.user_role).toBe('user');
  });

  it('admin user JWT has user_role = admin', async () => {
    const client = await signedInClient('admin@test.com', 'password123');
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    expect(token).toBeTruthy();
    const payload = decodeJwtPayload(token!);
    expect(payload.user_role).toBe('admin');
  });
});

// ---------------------------------------------------------------------------
// JWT claims — full coverage (tests 73–78)
// ---------------------------------------------------------------------------
describe('JWT claims — custom_access_token_hook', () => {
  it('super_user JWT has user_role = super_user', async () => {
    const client = await signedInClient(
      SEED_SUPER_USER.email,
      SEED_SUPER_USER.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.user_role).toBe('super_user');
  });

  it('super_admin JWT has user_role = super_admin', async () => {
    const client = await signedInClient(
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.user_role).toBe('super_admin');
  });

  it('pending JWT has user_role = pending', async () => {
    const client = await signedInClient(
      SEED_PENDING.email,
      SEED_PENDING.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.user_role).toBe('pending');
  });

  it('JWT contains region_id for user', async () => {
    const client = await signedInClient(SEED_USER.email, SEED_USER.password);
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.region_id).toBe(1);
  });

  it('is_admin = true for admin', async () => {
    const client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.is_admin).toBe(true);
  });

  it('is_admin = true for super_admin', async () => {
    const client = await signedInClient(
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.is_admin).toBe(true);
  });

  it('is_admin = false for user', async () => {
    const client = await signedInClient(SEED_USER.email, SEED_USER.password);
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.is_admin).toBe(false);
  });

  it('is_admin = false for super_user', async () => {
    const client = await signedInClient(
      SEED_SUPER_USER.email,
      SEED_SUPER_USER.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.is_admin).toBe(false);
  });

  it('is_admin = false for pending', async () => {
    const client = await signedInClient(
      SEED_PENDING.email,
      SEED_PENDING.password
    );
    const { data } = await client.auth.getSession();
    const payload = decodeJwtPayload(data.session!.access_token);
    expect(payload.is_admin).toBe(false);
  });

  it('token user_role = pending after profile is soft-deleted', async () => {
    // Create a throwaway auth user + profile, soft-delete the profile,
    // then sign in again and verify the hook yields pending.
    const throwawayEmail = '__hook_test_softdelete__@test-fixture.invalid';
    const throwawayPassword = 'password123';

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
// trails — deleted_at column-level protection (tests 35)
// ---------------------------------------------------------------------------
describe('trails RLS — deleted_at cannot be set directly', () => {
  let trailId: number;

  beforeAll(async () => {
    trailId = await fixtureCreateTrail({
      name: '__rls_deleted_at_test__',
      region_id: 1,
    });
  });

  afterAll(async () => {
    await fixtureDeleteTrails(trailId);
  });

  it('user cannot set deleted_at directly via UPDATE', async () => {
    const client = await signedInClient(SEED_USER.email, SEED_USER.password);
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
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
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
// trails — cross-region INSERT/UPDATE blocking (tests 37, 39, 41, 43)
// ---------------------------------------------------------------------------
describe('trails RLS — cross-region write blocking', () => {
  let region1TrailId: number;
  let region2TrailId: number;

  beforeAll(async () => {
    await serviceClient
      .from('regions')
      .upsert({ id: 2, name: 'Region 2' }, { onConflict: 'id' });
    region1TrailId = await fixtureCreateTrail({
      name: '__rls_xregion_r1__',
      region_id: 1,
    });
    region2TrailId = await fixtureCreateTrail({
      name: '__rls_xregion_r2__',
      region_id: 2,
    });
  });

  afterAll(async () => {
    await fixtureDeleteTrails(region1TrailId, region2TrailId);
  });

  it('super_user cannot INSERT a trail in a different region', async () => {
    const client = await signedInClient(
      SEED_SUPER_USER.email,
      SEED_SUPER_USER.password
    );
    const { error } = await client.from('trails').insert({
      name: '__rls_superuser_wrong_region__',
      type: 'trail',
      visibility: 'public',
      region_id: 2,
      geometry: 'SRID=4326;LINESTRING(-123.82 48.98,-123.81 48.97)',
    });
    expect(error).not.toBeNull();
  });

  it('super_user cannot UPDATE a trail in a different region', async () => {
    const client = await signedInClient(
      SEED_SUPER_USER.email,
      SEED_SUPER_USER.password
    );
    const before = await serviceClient
      .from('trails')
      .select('name')
      .eq('id', region2TrailId)
      .single();
    await client
      .from('trails')
      .update({ name: '__rls_superuser_overwrite__' })
      .eq('id', region2TrailId);
    const after = await serviceClient
      .from('trails')
      .select('name')
      .eq('id', region2TrailId)
      .single();
    expect(after.data!.name).toBe(before.data!.name);
  });

  it('admin cannot INSERT a trail in a different region', async () => {
    const client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
    const { error } = await client.from('trails').insert({
      name: '__rls_admin_wrong_region__',
      type: 'trail',
      visibility: 'public',
      region_id: 2,
      geometry: 'SRID=4326;LINESTRING(-123.82 48.98,-123.81 48.97)',
    });
    expect(error).not.toBeNull();
  });

  it('admin cannot UPDATE a trail in a different region', async () => {
    const client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
    const before = await serviceClient
      .from('trails')
      .select('name')
      .eq('id', region2TrailId)
      .single();
    await client
      .from('trails')
      .update({ name: '__rls_admin_overwrite__' })
      .eq('id', region2TrailId);
    const after = await serviceClient
      .from('trails')
      .select('name')
      .eq('id', region2TrailId)
      .single();
    expect(after.data!.name).toBe(before.data!.name);
  });
});
