import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
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
  await serviceClient
    .from('profiles')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', softDeletedProfileId);
});

afterAll(async () => {
  await fixtureDeleteProfiles(softDeletedProfileId);
  await suite.teardown();
});

describe('get_admin_users RPC — response shape', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;

  beforeAll(async () => {
    client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
  });

  it('returns results', async () => {
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

describe('get_admin_users RPC — pending user', () => {
  it.todo('pending (google SSO) user cannot call get_admin_users');
});
