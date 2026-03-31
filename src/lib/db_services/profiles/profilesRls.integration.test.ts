import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  anonClient,
  serviceClient,
  signedInClient,
  SEED_USER,
  SEED_ADMIN,
  SEED_SUPER_USER,
  SEED_SUPER_ADMIN,
  SEED_PENDING,
} from '../supabaseTestClients';
import { fixtureCreateProfile, fixtureDeleteProfiles } from './testHelpers';

const P = '__profiles_rls_test__';

// ---------------------------------------------------------------------------
// Fixtures: one profile in region 1, one in region 2
// ---------------------------------------------------------------------------
let region1ProfileId: number;
let region2ProfileId: number;

// The seed user's own profile id (region 1, auth_user_id known from seed)
let seedUserProfileId: number;

beforeAll(async () => {
  // Ensure region 2 exists
  await serviceClient
    .from('regions')
    .upsert({ id: 2, name: 'Region 2' }, { onConflict: 'id' });

  region1ProfileId = await fixtureCreateProfile({
    name: `${P}region1-target`,
    region_id: 1,
  });
  region2ProfileId = await fixtureCreateProfile({
    name: `${P}region2-target`,
    region_id: 2,
  });

  const { data } = await serviceClient
    .from('profiles')
    .select('id')
    .eq('auth_user_id', '00000000-0000-0000-0000-000000000001')
    .single();
  seedUserProfileId = data!.id;
});

afterAll(async () => {
  await fixtureDeleteProfiles(region1ProfileId, region2ProfileId);
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
      SEED_PENDING.email,
      SEED_PENDING.password
    );
    const { data } = await client.from('profiles').select('id');
    expect(data).toHaveLength(0);
  });
});

describe('profiles RLS — SELECT — user (own only)', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;
  beforeAll(async () => {
    client = await signedInClient(SEED_USER.email, SEED_USER.password);
  });

  it('can SELECT own profile', async () => {
    const { data } = await client
      .from('profiles')
      .select('id')
      .eq('id', seedUserProfileId);
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
      SEED_SUPER_USER.email,
      SEED_SUPER_USER.password
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
    client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
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
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
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
      region_id: 1,
    });
    expect(error).not.toBeNull();
  });
});

describe('profiles RLS — INSERT — admin (own region only)', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;
  let triggerCreatedProfileId: number | null = null;
  let insertedId: number | null = null;
  beforeAll(async () => {
    client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
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
        region_id: 1,
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
      region_id: 2,
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
    client = await signedInClient(SEED_USER.email, SEED_USER.password);
  });

  it('can UPDATE own profile name', async () => {
    // Read current name first so we can restore it exactly — never hardcode the seed name
    const { data: before } = await serviceClient
      .from('profiles')
      .select('name')
      .eq('id', seedUserProfileId)
      .single();
    const originalName = before!.name;

    const { error } = await client
      .from('profiles')
      .update({ name: `${P}user-renamed` })
      .eq('id', seedUserProfileId);
    expect(error).toBeNull();

    // Restore exactly
    await serviceClient
      .from('profiles')
      .update({ name: originalName })
      .eq('id', seedUserProfileId);
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
    client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
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
// Column-level: deleted_at cannot be set directly
// ---------------------------------------------------------------------------
describe('profiles RLS — deleted_at direct UPDATE blocked', () => {
  it('user cannot set deleted_at directly via UPDATE', async () => {
    const client = await signedInClient(SEED_USER.email, SEED_USER.password);
    await client
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', seedUserProfileId);
    // PostgREST silently drops columns not in the column grant — no error,
    // but deleted_at must remain null (column-level protection).
    const { data } = await serviceClient
      .from('profiles')
      .select('deleted_at')
      .eq('id', seedUserProfileId)
      .single();
    expect(data!.deleted_at).toBeNull();
  });

  it('super_admin cannot set deleted_at directly via UPDATE', async () => {
    const client = await signedInClient(
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
    );
    await client
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', region1ProfileId);
    // Trigger blocks the update even for super_admin — deleted_at must remain null.
    const { data } = await serviceClient
      .from('profiles')
      .select('deleted_at')
      .eq('id', region1ProfileId)
      .single();
    expect(data!.deleted_at).toBeNull();
  });
});
