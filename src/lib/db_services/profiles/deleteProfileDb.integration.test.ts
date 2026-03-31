import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { deleteProfileDb } from './deleteProfileDb';
import {
  anonClient,
  serviceClient,
  signedInClient,
  SEED_ADMIN,
  SEED_SUPER_USER,
  SEED_SUPER_ADMIN,
} from '../supabaseTestClients';
import { fixtureCreateProfile, fixtureDeleteProfiles } from './testHelpers';

const P = '__soft_delete_profiles_test__';

// ---------------------------------------------------------------------------
// Fixture user — used for the "own profile" tests so we never touch seed data
// ---------------------------------------------------------------------------
const FIXTURE_OWN_NAME = `${P}own-user`;
const FIXTURE_OWN_EMAIL = `fixture-${FIXTURE_OWN_NAME.replace(/[^a-z0-9]/gi, '-').toLowerCase()}@test-fixture.invalid`;
const FIXTURE_OWN_PASSWORD = 'fixture-password-123';
let fixtureOwnId: number;

// ---------------------------------------------------------------------------
// Anon — denied
// ---------------------------------------------------------------------------
describe('deleteProfileDb — anon (denied)', () => {
  it('returns an error and deleted_at remains null', async () => {
    const id = await fixtureCreateProfile({ name: `${P}anon-target` });

    const { error } = await deleteProfileDb(anonClient, id);
    expect(error).not.toBeNull();

    const { data: row } = await serviceClient
      .from('profiles')
      .select('id, deleted_at')
      .eq('id', id)
      .single();
    expect(row).not.toBeNull();
    expect(row!.deleted_at).toBeNull();

    await fixtureDeleteProfiles(id);
  });
});

// ---------------------------------------------------------------------------
// User — can soft-delete own profile only
// ---------------------------------------------------------------------------
describe('deleteProfileDb — user (own profile only)', () => {
  beforeAll(async () => {
    fixtureOwnId = await fixtureCreateProfile({
      name: FIXTURE_OWN_NAME,
      region_id: 1,
    });
  });
  afterAll(async () => {
    await fixtureDeleteProfiles(fixtureOwnId);
  });

  it('can soft-delete their own profile', async () => {
    const client = await signedInClient(
      FIXTURE_OWN_EMAIL,
      FIXTURE_OWN_PASSWORD
    );
    const { error } = await deleteProfileDb(client, fixtureOwnId);
    expect(error).toBeNull();

    const { data: row } = await serviceClient
      .from('profiles')
      .select('id, deleted_at')
      .eq('id', fixtureOwnId)
      .single();
    expect(row!.deleted_at).not.toBeNull();
    // No restore needed — fixtureDeleteProfiles in afterAll handles cleanup
  });

  it("cannot soft-delete someone else's profile", async () => {
    const id = await fixtureCreateProfile({ name: `${P}user-other-target` });

    const client = await signedInClient(
      FIXTURE_OWN_EMAIL,
      FIXTURE_OWN_PASSWORD
    );
    const { error } = await deleteProfileDb(client, id);
    expect(error).not.toBeNull();

    const { data: row } = await serviceClient
      .from('profiles')
      .select('id, deleted_at')
      .eq('id', id)
      .single();
    expect(row!.deleted_at).toBeNull();

    await fixtureDeleteProfiles(id);
  });
});

// ---------------------------------------------------------------------------
// Super User — can only soft-delete own profile (not a region-wide role here)
// ---------------------------------------------------------------------------
describe('deleteProfileDb — super_user (own profile only)', () => {
  it("cannot soft-delete another user's profile", async () => {
    const id = await fixtureCreateProfile({
      name: `${P}super-user-other-target`,
      region_id: 1,
    });

    const client = await signedInClient(
      SEED_SUPER_USER.email,
      SEED_SUPER_USER.password
    );
    const { error } = await deleteProfileDb(client, id);
    expect(error).not.toBeNull();

    const { data: row } = await serviceClient
      .from('profiles')
      .select('id, deleted_at')
      .eq('id', id)
      .single();
    expect(row!.deleted_at).toBeNull();

    await fixtureDeleteProfiles(id);
  });
});

// ---------------------------------------------------------------------------
// Admin — can soft-delete profiles in own region
// ---------------------------------------------------------------------------
describe('deleteProfileDb — admin (own region)', () => {
  it('can soft-delete a profile in their region', async () => {
    const id = await fixtureCreateProfile({
      name: `${P}admin-target`,
      region_id: 1,
    });

    const client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
    const { error } = await deleteProfileDb(client, id);
    expect(error).toBeNull();

    const { data: row } = await serviceClient
      .from('profiles')
      .select('id, deleted_at')
      .eq('id', id)
      .single();
    expect(row!.deleted_at).not.toBeNull();

    await fixtureDeleteProfiles(id);
  });
});

// ---------------------------------------------------------------------------
// Super Admin — can soft-delete any profile
// ---------------------------------------------------------------------------
describe('deleteProfileDb — super_admin (any profile)', () => {
  it('can soft-delete any profile', async () => {
    const id = await fixtureCreateProfile({ name: `${P}super-admin-target` });

    const client = await signedInClient(
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
    );
    const { error } = await deleteProfileDb(client, id);
    expect(error).toBeNull();

    const { data: row } = await serviceClient
      .from('profiles')
      .select('id, deleted_at')
      .eq('id', id)
      .single();
    expect(row!.deleted_at).not.toBeNull();

    await fixtureDeleteProfiles(id);
  });

  it('bulk soft-deletes multiple profiles', async () => {
    const id1 = await fixtureCreateProfile({ name: `${P}bulk-1` });
    const id2 = await fixtureCreateProfile({ name: `${P}bulk-2` });

    const client = await signedInClient(
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
    );
    const { error } = await deleteProfileDb(client, [id1, id2]);
    expect(error).toBeNull();

    const { data: rows } = await serviceClient
      .from('profiles')
      .select('id, deleted_at')
      .in('id', [id1, id2]);
    expect(rows).toHaveLength(2);
    for (const row of rows!) {
      expect(row.deleted_at).not.toBeNull();
    }

    await fixtureDeleteProfiles(id1, id2);
  });

  it('non-existent id is a silent no-op', async () => {
    const client = await signedInClient(
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
    );
    const { error } = await deleteProfileDb(client, 9999999);
    expect(error).toBeNull();
  });
});
