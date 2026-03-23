import { describe, it, expect, beforeEach } from 'vitest';
import { deleteTrailDb } from './deleteTrailDb';
import {
  anonClient,
  serviceClient,
  signedInClient,
  SEED_USER,
  SEED_ADMIN,
  SEED_SUPER_USER,
  SEED_SUPER_ADMIN,
} from '../supabaseTestClients';
import { fixtureCreateTrail, fixtureDeleteTrails } from './testHelpers';

// Requires local Supabase running (`pnpm db:start`). See README.md for RLS rules.

const P = '__dt_test__';

describe('deleteTrailDb — anon (denied)', () => {
  let trailId: number;

  beforeEach(async () => {
    trailId = await fixtureCreateTrail({ name: `${P}anon-target` });
  });

  it('trail still exists after anon attempts delete (PostgREST returns 204, 0 rows deleted)', async () => {
    const { error } = await deleteTrailDb(anonClient, { id: trailId });

    const { data: row } = await serviceClient
      .from('trails')
      .select('id')
      .eq('id', trailId)
      .single();

    expect(row).not.toBeNull();

    await fixtureDeleteTrails(trailId);
    void error;
  });
});

describe('deleteTrailDb — user role (denied)', () => {
  let trailId: number;

  beforeEach(async () => {
    trailId = await fixtureCreateTrail({ name: `${P}user-target` });
  });

  it('trail still exists after user attempts delete', async () => {
    const client = await signedInClient(SEED_USER.email, SEED_USER.password);
    await deleteTrailDb(client, { id: trailId });

    const { data: row } = await serviceClient
      .from('trails')
      .select('id')
      .eq('id', trailId)
      .single();

    expect(row).not.toBeNull();

    await fixtureDeleteTrails(trailId);
  });
});

describe('deleteTrailDb — admin (permitted for own region)', () => {
  it('deletes a public trail and row no longer exists', async () => {
    const trailId = await fixtureCreateTrail({
      name: `${P}admin-target`,
      visibility: 'public',
      region_id: 1,
    });

    const client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
    const { error } = await deleteTrailDb(client, { id: trailId });

    expect(error).toBeNull();

    const { data: row } = await serviceClient
      .from('trails')
      .select('id')
      .eq('id', trailId)
      .maybeSingle();

    expect(row).toBeNull();
  });
});

describe('deleteTrailDb — super_user (permitted for own region)', () => {
  it('deletes a trail and row no longer exists', async () => {
    const trailId = await fixtureCreateTrail({
      name: `${P}super-user-target`,
      visibility: 'public',
      region_id: 1,
    });

    const client = await signedInClient(
      SEED_SUPER_USER.email,
      SEED_SUPER_USER.password
    );
    const { error } = await deleteTrailDb(client, { id: trailId });

    expect(error).toBeNull();

    const { data: row } = await serviceClient
      .from('trails')
      .select('id')
      .eq('id', trailId)
      .maybeSingle();

    expect(row).toBeNull();
  });
});

describe('deleteTrailDb — super_admin (permitted for any trail)', () => {
  it('deletes a trail and row no longer exists', async () => {
    const trailId = await fixtureCreateTrail({
      name: `${P}super-admin-target`,
      visibility: 'public',
      region_id: 1,
    });

    const client = await signedInClient(
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
    );
    const { error } = await deleteTrailDb(client, { id: trailId });

    expect(error).toBeNull();

    const { data: row } = await serviceClient
      .from('trails')
      .select('id')
      .eq('id', trailId)
      .maybeSingle();

    expect(row).toBeNull();
  });
});

describe('deleteTrailDb — service role (bypasses RLS)', () => {
  it('deletes any trail including private', async () => {
    const trailId = await fixtureCreateTrail({
      name: `${P}service-private`,
      visibility: 'private',
    });

    const { error } = await deleteTrailDb(serviceClient, { id: trailId });
    expect(error).toBeNull();

    const { data: row } = await serviceClient
      .from('trails')
      .select('id')
      .eq('id', trailId)
      .maybeSingle();

    expect(row).toBeNull();
  });

  it('deletes a hidden trail', async () => {
    const trailId = await fixtureCreateTrail({
      name: `${P}service-hidden`,
      visibility: 'public',
      hidden: true,
    });

    const { error } = await deleteTrailDb(serviceClient, { id: trailId });
    expect(error).toBeNull();

    const { data: row } = await serviceClient
      .from('trails')
      .select('id')
      .eq('id', trailId)
      .maybeSingle();

    expect(row).toBeNull();
  });

  it('is idempotent on a non-existent id (no error)', async () => {
    const { error } = await deleteTrailDb(serviceClient, { id: 999_999_999 });
    expect(error).toBeNull();
  });
});
