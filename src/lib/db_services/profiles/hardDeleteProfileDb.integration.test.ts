import { describe, it, expect } from 'vitest';
import {
  anonClient,
  serviceClient,
  signedInClient,
  SEED_USER,
  SEED_ADMIN,
  SEED_SUPER_USER,
  SEED_SUPER_ADMIN,
} from '../supabaseTestClients';
import { fixtureCreateProfile, fixtureDeleteProfiles } from './testHelpers';

/**
 * Hard-delete via PostgREST DELETE (table-level RLS policy).
 *
 * Only super_admin has the "profiles: super_admin delete" RLS policy.
 * For all other roles PostgREST returns no error but deletes zero rows
 * (RLS silently filters the row out rather than raising an error).
 * We assert the row still exists as the definitive proof of denial.
 */

const P = '__hard_delete_profiles_test__';

async function rowExists(id: number): Promise<boolean> {
  const { data } = await serviceClient
    .from('profiles')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  return data !== null;
}

// ---------------------------------------------------------------------------
// Anon — denied (row survives)
// ---------------------------------------------------------------------------
describe('hard delete profiles (RLS) — anon (denied)', () => {
  it('row survives after anon DELETE attempt', async () => {
    const id = await fixtureCreateProfile({ name: `${P}anon-target` });

    await anonClient.from('profiles').delete().eq('id', id);

    expect(await rowExists(id)).toBe(true);
    await fixtureDeleteProfiles(id);
  });
});

// ---------------------------------------------------------------------------
// User — denied (row survives)
// ---------------------------------------------------------------------------
describe('hard delete profiles (RLS) — user (denied)', () => {
  it('row survives after user DELETE attempt', async () => {
    const id = await fixtureCreateProfile({ name: `${P}user-target` });

    const client = await signedInClient(SEED_USER.email, SEED_USER.password);
    await client.from('profiles').delete().eq('id', id);

    expect(await rowExists(id)).toBe(true);
    await fixtureDeleteProfiles(id);
  });
});

// ---------------------------------------------------------------------------
// Admin — denied (row survives)
// ---------------------------------------------------------------------------
describe('hard delete profiles (RLS) — admin (denied)', () => {
  it('row survives after admin DELETE attempt', async () => {
    const id = await fixtureCreateProfile({
      name: `${P}admin-target`,
      region_id: 1,
    });

    const client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
    await client.from('profiles').delete().eq('id', id);

    expect(await rowExists(id)).toBe(true);
    await fixtureDeleteProfiles(id);
  });
});

// ---------------------------------------------------------------------------
// Super User — denied (row survives)
// ---------------------------------------------------------------------------
describe('hard delete profiles (RLS) — super_user (denied)', () => {
  it('row survives after super_user DELETE attempt', async () => {
    const id = await fixtureCreateProfile({
      name: `${P}super-user-target`,
      region_id: 1,
    });

    const client = await signedInClient(
      SEED_SUPER_USER.email,
      SEED_SUPER_USER.password
    );
    await client.from('profiles').delete().eq('id', id);

    expect(await rowExists(id)).toBe(true);
    await fixtureDeleteProfiles(id);
  });
});

// ---------------------------------------------------------------------------
// Super Admin — permitted via RLS DELETE policy
// ---------------------------------------------------------------------------
describe('hard delete profiles (RLS) — super_admin (permitted)', () => {
  it('permanently deletes the row', async () => {
    const id = await fixtureCreateProfile({ name: `${P}super-admin-target` });

    const client = await signedInClient(
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
    );
    const { error } = await client.from('profiles').delete().eq('id', id);
    expect(error).toBeNull();

    expect(await rowExists(id)).toBe(false);
    await fixtureDeleteProfiles(id); // cleans up auth user via registry
  });

  it('bulk deletes multiple profiles', async () => {
    const id1 = await fixtureCreateProfile({ name: `${P}bulk-1` });
    const id2 = await fixtureCreateProfile({ name: `${P}bulk-2` });

    const client = await signedInClient(
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
    );
    const { error } = await client
      .from('profiles')
      .delete()
      .in('id', [id1, id2]);
    expect(error).toBeNull();

    expect(await rowExists(id1)).toBe(false);
    expect(await rowExists(id2)).toBe(false);
    await fixtureDeleteProfiles(id1, id2);
  });

  it('delete on non-existent id is a silent no-op', async () => {
    const client = await signedInClient(
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
    );
    const { error } = await client.from('profiles').delete().eq('id', 9999999);
    expect(error).toBeNull();
  });
});
