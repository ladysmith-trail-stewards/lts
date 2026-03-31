import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  anonClient,
  serviceClient,
  signedInClient,
  SEED_USER,
  SEED_ADMIN,
  SEED_SUPER_USER,
  SEED_SUPER_ADMIN,
} from '../../db_services/supabaseTestClients';
import { fixtureCreateProfile, fixtureDeleteProfiles } from './testHelpers';

const P = '__get_admin_users_test__';
let softDeletedProfileId: number;

beforeAll(async () => {
  softDeletedProfileId = await fixtureCreateProfile({
    name: `${P}soft-deleted`,
    region_id: 1,
  });
  // Soft-delete via service role
  await serviceClient
    .from('profiles')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', softDeletedProfileId);
});

afterAll(async () => {
  await fixtureDeleteProfiles(softDeletedProfileId);
});

describe('get_admin_users RPC — denied roles', () => {
  it('anon cannot call get_admin_users', async () => {
    const { error } = await anonClient.rpc('get_admin_users');
    expect(error).not.toBeNull();
  });

  it('user cannot call get_admin_users', async () => {
    const client = await signedInClient(SEED_USER.email, SEED_USER.password);
    const { data, error } = await client.rpc('get_admin_users');
    // RLS WHERE clause returns empty, not an error
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('super_user cannot call get_admin_users', async () => {
    const client = await signedInClient(
      SEED_SUPER_USER.email,
      SEED_SUPER_USER.password
    );
    const { data, error } = await client.rpc('get_admin_users');
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

describe('get_admin_users RPC — admin', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;
  beforeAll(async () => {
    client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
  });

  it('admin can call get_admin_users and receives results', async () => {
    const { data, error } = await client.rpc('get_admin_users');
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('does not return soft-deleted profiles', async () => {
    const { data } = await client.rpc('get_admin_users');
    const ids = (data ?? []).map((r: { profile_id: number }) => r.profile_id);
    expect(ids).not.toContain(softDeletedProfileId);
  });
});

describe('get_admin_users RPC — super_admin', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;
  beforeAll(async () => {
    client = await signedInClient(
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
    );
  });

  it('super_admin can call get_admin_users and receives results', async () => {
    const { data, error } = await client.rpc('get_admin_users');
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('result includes email field', async () => {
    const { data } = await client.rpc('get_admin_users');
    expect(data![0]).toHaveProperty('email');
  });

  it('does not return soft-deleted profiles', async () => {
    const { data } = await client.rpc('get_admin_users');
    const ids = (data ?? []).map((r: { profile_id: number }) => r.profile_id);
    expect(ids).not.toContain(softDeletedProfileId);
  });
});
