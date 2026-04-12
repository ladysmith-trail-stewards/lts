import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  anonClient,
  serviceClient,
  signedInClient,
} from '../../db_services/supabaseTestClients';
import { fixtureCreateProfile, fixtureDeleteProfiles } from './testHelpers';
import { TestSuite, type BuiltTestSuite } from '../testSuite';

const P = '__get_admin_users_test__';
let suite: BuiltTestSuite;
let softDeletedProfileId: number;

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').createAllUsers().build();
  softDeletedProfileId = await fixtureCreateProfile({
    name: `${P}soft-deleted`,
    region_id: suite.regionId,
  });
  // Soft-delete via service role
  await serviceClient
    .from('profiles')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', softDeletedProfileId);
});

afterAll(async () => {
  await fixtureDeleteProfiles(softDeletedProfileId);
  await suite.teardown();
});

describe('get_admin_users RPC — denied roles', () => {
  it('anon cannot call get_admin_users', async () => {
    const { error } = await anonClient.rpc('get_admin_users');
    expect(error).not.toBeNull();
  });

  it('user cannot call get_admin_users', async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    const { data, error } = await client.rpc('get_admin_users');
    // RLS WHERE clause returns empty, not an error
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('super_user cannot call get_admin_users', async () => {
    const client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
    const { data, error } = await client.rpc('get_admin_users');
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

describe('get_admin_users RPC — admin', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;
  beforeAll(async () => {
    client = await signedInClient(suite.admin.email, suite.admin.password);
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

describe('get_admin_users RPC — pending user', () => {
  it.todo('pending (google SSO) user cannot call get_admin_users');
});
describe('get_admin_users RPC — super_admin', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;
  beforeAll(async () => {
    client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
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
