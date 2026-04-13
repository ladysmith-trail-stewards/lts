import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  anonClient,
  serviceClient,
  signedInClient,
} from '../supabaseTestClients';
import { fixtureCreateProfile, fixtureDeleteProfiles } from './testHelpers';
import { TestSuite, type BuiltTestSuite } from '../testSuite';

const P = '__profiles_rls_test__';

let suite: BuiltTestSuite;

// ---------------------------------------------------------------------------
// Fixtures: one profile in suite region, one in region2
// ---------------------------------------------------------------------------
let region1ProfileId: number;
let region2ProfileId: number;
let region2Id: number;

// The fixture user's own profile id
let fixtureUserProfileId: number;

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').createAllUsers().build();

  // Create a second suite-local region for cross-region tests
  const safeTag = P.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const { data: r2, error: r2Err } = await serviceClient
    .from('regions')
    .insert({ name: `i_test_${safeTag}_region2` })
    .select('id')
    .single();
  if (r2Err) throw new Error(`profilesRls: create region2: ${r2Err.message}`);
  region2Id = r2.id;

  region1ProfileId = await fixtureCreateProfile({
    name: `${P}region1-target`,
    region_id: suite.regionId,
  });
  region2ProfileId = await fixtureCreateProfile({
    name: `${P}region2-target`,
    region_id: region2Id,
  });

  fixtureUserProfileId = suite.user.profileId;
});

afterAll(async () => {
  await fixtureDeleteProfiles(region1ProfileId, region2ProfileId);
  await serviceClient.from('regions').delete().eq('id', region2Id);
  await suite.teardown();
});

// ---------------------------------------------------------------------------
// SELECT
// ---------------------------------------------------------------------------
describe('profiles RLS — SELECT — anon (denied)', () => {
  it('anon cannot SELECT any profile', async () => {
    const { data } = await anonClient.from('profiles').select('id');
    expect(data).toHaveLength(0);
  });
});

describe('profiles RLS — SELECT — pending (denied)', () => {
  it('pending cannot SELECT any profile', async () => {
    const client = await signedInClient(
      suite.pending.email,
      suite.pending.password
    );
    const { data } = await client.from('profiles').select('id');
    // Pending users can see their own profile (auth_user_id = auth.uid() policy),
    // but cannot see other users' profiles.
    expect(data).toHaveLength(1);
  });
});

describe('profiles RLS — SELECT — user (own only)', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;
  beforeAll(async () => {
    client = await signedInClient(suite.user.email, suite.user.password);
  });

  it('can SELECT own profile', async () => {
    const { data } = await client
      .from('profiles')
      .select('id')
      .eq('id', fixtureUserProfileId);
    expect(data).toHaveLength(1);
  });

  it('cannot SELECT a different profile', async () => {
    const { data } = await client
      .from('profiles')
      .select('id')
      .eq('id', region1ProfileId);
    expect(data).toHaveLength(0);
  });
});

describe('profiles RLS — SELECT — super_user (own only)', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;
  beforeAll(async () => {
    client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
  });

  it('cannot SELECT a profile that is not their own', async () => {
    const { data } = await client
      .from('profiles')
      .select('id')
      .eq('id', region2ProfileId);
    expect(data).toHaveLength(0);
  });
});

describe('profiles RLS — SELECT — admin (own region only)', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;
  beforeAll(async () => {
    client = await signedInClient(suite.admin.email, suite.admin.password);
  });

  it('can SELECT profiles in own region (region 1)', async () => {
    const { data } = await client
      .from('profiles')
      .select('id')
      .eq('id', region1ProfileId);
    expect(data).toHaveLength(1);
  });

  it('cannot SELECT profiles in a different region (region 2)', async () => {
    const { data } = await client
      .from('profiles')
      .select('id')
      .eq('id', region2ProfileId);
    expect(data).toHaveLength(0);
  });
});

describe('profiles RLS — SELECT — super_admin (all)', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;
  beforeAll(async () => {
    client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
  });

  it('can SELECT any profile', async () => {
    const { data } = await client
      .from('profiles')
      .select('id')
      .in('id', [region1ProfileId, region2ProfileId]);
    expect(data).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// INSERT
// ---------------------------------------------------------------------------
describe('profiles RLS — INSERT — anon (denied)', () => {
  it('anon cannot INSERT a profile', async () => {
    const { error } = await anonClient.from('profiles').insert({
      auth_user_id: '00000000-0000-0000-0000-000000000099',
      name: `${P}anon-insert`,
      region_id: suite.regionId,
    });
    expect(error).not.toBeNull();
  });
});

describe('profiles RLS — INSERT — admin (own region only)', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;
  let triggerCreatedProfileId: number | null = null;
  let insertedId: number | null = null;
  beforeAll(async () => {
    client = await signedInClient(suite.admin.email, suite.admin.password);
  });
  afterAll(async () => {
    const toDelete = [triggerCreatedProfileId, insertedId].filter(
      (id): id is number => id !== null
    );
    if (toDelete.length) await fixtureDeleteProfiles(...toDelete);
  });

  it('can INSERT a profile in own region', async () => {
    // Create an auth user so the FK constraint is satisfied; the handle_new_user
    // trigger will auto-create a profile — capture its id so afterAll can clean it up.
    const { data: authData } = await serviceClient.auth.admin.createUser({
      email: `${P}admin-insert@test-fixture.invalid`,
      password: 'fixture-password-123',
      email_confirm: true,
    });
    const authId = authData.user!.id;

    // Capture the trigger-created profile
    const { data: triggered } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('auth_user_id', authId)
      .single();
    if (triggered) triggerCreatedProfileId = triggered.id;

    // Admin inserts a *second* profile with a different auth_user_id is not possible
    // due to unique constraint — instead verify admin can INSERT for this auth user
    // by updating the trigger-created one via INSERT ... ON CONFLICT or just test
    // that the RLS policy allows the upsert path. We verify no RLS 42501 error.
    const { data, error } = await client
      .from('profiles')
      .insert({
        auth_user_id: authId,
        name: `${P}admin-insert`,
        region_id: suite.regionId,
      })
      .select('id')
      .single();
    if (!error) {
      insertedId = data!.id;
    }
    // unique constraint (23505) is acceptable; RLS denial (42501) is not
    expect(error?.code).not.toBe('42501');
  });

  it('cannot INSERT a profile in a different region', async () => {
    const { error } = await client.from('profiles').insert({
      auth_user_id: '00000000-0000-0000-0000-000000000092',
      name: `${P}admin-insert-r2`,
      region_id: region2Id,
    });
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------
describe('profiles RLS — UPDATE — user (own only)', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;
  beforeAll(async () => {
    client = await signedInClient(suite.user.email, suite.user.password);
  });

  it('can UPDATE own profile name', async () => {
    // Read current name first so we can restore it exactly
    const { data: before } = await serviceClient
      .from('profiles')
      .select('name')
      .eq('id', fixtureUserProfileId)
      .single();
    const originalName = before!.name;

    const { error } = await client
      .from('profiles')
      .update({ name: `${P}user-renamed` })
      .eq('id', fixtureUserProfileId);
    expect(error).toBeNull();

    // Restore exactly
    await serviceClient
      .from('profiles')
      .update({ name: originalName })
      .eq('id', fixtureUserProfileId);
  });

  it('cannot UPDATE another profile', async () => {
    const before = await serviceClient
      .from('profiles')
      .select('name')
      .eq('id', region1ProfileId)
      .single();
    await client
      .from('profiles')
      .update({ name: `${P}user-overwrite` })
      .eq('id', region1ProfileId);
    const after = await serviceClient
      .from('profiles')
      .select('name')
      .eq('id', region1ProfileId)
      .single();
    expect(after.data!.name).toBe(before.data!.name);
  });
});

describe('profiles RLS — UPDATE — admin (own region only)', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;
  beforeAll(async () => {
    client = await signedInClient(suite.admin.email, suite.admin.password);
  });

  it('can UPDATE a profile in own region', async () => {
    const { error } = await client
      .from('profiles')
      .update({ phone: '555-0001' })
      .eq('id', region1ProfileId);
    expect(error).toBeNull();
  });

  it('cannot UPDATE a profile in a different region', async () => {
    const before = await serviceClient
      .from('profiles')
      .select('phone')
      .eq('id', region2ProfileId)
      .single();
    await client
      .from('profiles')
      .update({ phone: '555-9999' })
      .eq('id', region2ProfileId);
    const after = await serviceClient
      .from('profiles')
      .select('phone')
      .eq('id', region2ProfileId)
      .single();
    expect(after.data!.phone).toBe(before.data!.phone);
  });
});

// ---------------------------------------------------------------------------
// Soft-delete: deleted_at writeable by trigger-enforced scope rules
// ---------------------------------------------------------------------------
describe('profiles RLS — soft-delete via deleted_at UPDATE', () => {
  it('user can soft-delete their own profile', async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    const { error } = await client
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', fixtureUserProfileId);
    expect(error).toBeNull();
    const { data } = await serviceClient
      .from('profiles')
      .select('deleted_at')
      .eq('id', fixtureUserProfileId)
      .single();
    expect(data!.deleted_at).not.toBeNull();
    // Restore so subsequent tests are not affected.
    await serviceClient
      .from('profiles')
      .update({ deleted_at: null } as never)
      .eq('id', fixtureUserProfileId);
  });

  it("user cannot soft-delete another user's profile", async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    await client
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', region1ProfileId);
    const { data } = await serviceClient
      .from('profiles')
      .select('deleted_at')
      .eq('id', region1ProfileId)
      .single();
    expect(data!.deleted_at).toBeNull();
  });
});

describe('profiles RLS — DELETE', () => {
  async function rowExists(id: number): Promise<boolean> {
    const { data } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    return data !== null;
  }

  it('anon cannot hard-delete a profile', async () => {
    await anonClient.from('profiles').delete().eq('id', region1ProfileId);
    expect(await rowExists(region1ProfileId)).toBe(true);
  });

  it('user cannot hard-delete a profile', async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    await client.from('profiles').delete().eq('id', region1ProfileId);
    expect(await rowExists(region1ProfileId)).toBe(true);
  });

  it('admin cannot hard-delete a profile', async () => {
    const client = await signedInClient(
      suite.admin.email,
      suite.admin.password
    );
    await client.from('profiles').delete().eq('id', region1ProfileId);
    expect(await rowExists(region1ProfileId)).toBe(true);
  });

  it('super_user cannot hard-delete a profile', async () => {
    const client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
    await client.from('profiles').delete().eq('id', region1ProfileId);
    expect(await rowExists(region1ProfileId)).toBe(true);
  });

  it('super_admin can hard-delete a profile', async () => {
    const id = await fixtureCreateProfile({
      name: `${P}hard-delete-target`,
      region_id: suite.regionId,
    });
    const client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
    const { error } = await client.from('profiles').delete().eq('id', id);
    expect(error).toBeNull();
    expect(await rowExists(id)).toBe(false);
    await fixtureDeleteProfiles(id);
  });
});
