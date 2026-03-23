import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { updateTrailDb } from './updateTrailDb';
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

const P = '__ut_test__';

let publicTrailId: number;
let privateTrailId: number;

beforeAll(async () => {
  [publicTrailId, privateTrailId] = await Promise.all([
    fixtureCreateTrail({ name: `${P}public`, visibility: 'public' }),
    fixtureCreateTrail({ name: `${P}private`, visibility: 'private' }),
  ]);
});

afterAll(() => fixtureDeleteTrails(publicTrailId, privateTrailId));

describe('updateTrailDb — anon (denied)', () => {
  it('returns an error and does not mutate the row', async () => {
    const { data, error } = await updateTrailDb(anonClient, {
      id: publicTrailId,
      changes: { name: `${P}anon-mutated` },
    });

    expect(error).not.toBeNull();
    expect(data).toBeNull();

    const { data: row } = await serviceClient
      .from('trails')
      .select('name')
      .eq('id', publicTrailId)
      .single();
    expect(row!.name).toBe(`${P}public`);
  });
});

describe('updateTrailDb — user role (denied)', () => {
  it('returns an error and does not mutate the row', async () => {
    const client = await signedInClient(SEED_USER.email, SEED_USER.password);
    const { data, error } = await updateTrailDb(client, {
      id: publicTrailId,
      changes: { name: `${P}user-mutated` },
    });

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

describe('updateTrailDb — admin (permitted for own region)', () => {
  it('updates a public trail name and returns the id', async () => {
    const client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
    const newName = `${P}admin-updated`;

    const { data, error } = await updateTrailDb(client, {
      id: publicTrailId,
      changes: { name: newName },
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.id).toBe(publicTrailId);

    // Confirm persisted
    const { data: row } = await serviceClient
      .from('trails')
      .select('name')
      .eq('id', publicTrailId)
      .single();
    expect(row!.name).toBe(newName);

    // Restore
    await updateTrailDb(serviceClient, {
      id: publicTrailId,
      changes: { name: `${P}public` },
    });
  });

  it('can update a boolean field (hidden)', async () => {
    const client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);

    const { error } = await updateTrailDb(client, {
      id: publicTrailId,
      changes: { hidden: true },
    });

    expect(error).toBeNull();

    const { data: row } = await serviceClient
      .from('trails')
      .select('hidden')
      .eq('id', publicTrailId)
      .single();
    expect(row!.hidden).toBe(true);

    // Restore
    await updateTrailDb(serviceClient, {
      id: publicTrailId,
      changes: { hidden: false },
    });
  });
});

describe('updateTrailDb — super_user (permitted for own region)', () => {
  it('updates a public trail name and returns the id', async () => {
    const client = await signedInClient(
      SEED_SUPER_USER.email,
      SEED_SUPER_USER.password
    );
    const newName = `${P}super-user-updated`;

    const { data, error } = await updateTrailDb(client, {
      id: publicTrailId,
      changes: { name: newName },
    });

    expect(error).toBeNull();
    expect(data!.id).toBe(publicTrailId);

    // Restore
    await updateTrailDb(serviceClient, {
      id: publicTrailId,
      changes: { name: `${P}public` },
    });
  });
});

describe('updateTrailDb — super_admin (permitted for any trail)', () => {
  it('updates a private trail and returns the id', async () => {
    const client = await signedInClient(
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
    );
    const newName = `${P}super-admin-updated`;

    const { data, error } = await updateTrailDb(client, {
      id: privateTrailId,
      changes: { name: newName },
    });

    expect(error).toBeNull();
    expect(data!.id).toBe(privateTrailId);

    // Restore
    await updateTrailDb(serviceClient, {
      id: privateTrailId,
      changes: { name: `${P}private` },
    });
  });
});

describe('updateTrailDb — service role (bypasses RLS)', () => {
  it('updates a private trail', async () => {
    const { data, error } = await updateTrailDb(serviceClient, {
      id: privateTrailId,
      changes: { name: `${P}private-updated` },
    });

    expect(error).toBeNull();
    expect(data!.id).toBe(privateTrailId);

    // Restore
    await updateTrailDb(serviceClient, {
      id: privateTrailId,
      changes: { name: `${P}private` },
    });
  });

  it('can toggle planned flag', async () => {
    const { error } = await updateTrailDb(serviceClient, {
      id: publicTrailId,
      changes: { planned: true },
    });
    expect(error).toBeNull();

    const { data: row } = await serviceClient
      .from('trails')
      .select('planned')
      .eq('id', publicTrailId)
      .single();
    expect(row!.planned).toBe(true);

    // Restore
    await updateTrailDb(serviceClient, {
      id: publicTrailId,
      changes: { planned: false },
    });
  });
});

describe('updateTrailDb — non-existent id', () => {
  it('returns an error (no rows matched)', async () => {
    const { data, error } = await updateTrailDb(serviceClient, {
      id: 999_999_999,
      changes: { name: `${P}ghost` },
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
