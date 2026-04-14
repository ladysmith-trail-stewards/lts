import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import {
  anonClient,
  signedInClient,
} from '../../db_services/supabaseTestClients';
import { TestSuite, type BuiltTestSuite } from '../testSuite';

const P = '__get_admin_users_rls_test__';
let suite: BuiltTestSuite;

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').createAllUsers().build();
});

afterAll(async () => {
  await suite.teardown();
});

describe('get_admin_users RPC — anon (denied, no EXECUTE grant)', () => {
  it('returns an error', async () => {
    const { error } = await anonClient.rpc('get_admin_users');
    expect(error).not.toBeNull();
  });
});

describe('get_admin_users RPC — pending/user/super_user (empty, WHERE filters)', () => {
  it('pending receives no error but empty results', async () => {
    const client = await signedInClient(
      suite.pending.email,
      suite.pending.password
    );
    const { data, error } = await client.rpc('get_admin_users');
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('user receives no error but empty results', async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    const { data, error } = await client.rpc('get_admin_users');
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('super_user receives no error but empty results', async () => {
    const client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
    const { data, error } = await client.rpc('get_admin_users');
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

describe('get_admin_users RPC — admin/super_admin (permitted)', () => {
  it('admin receives results', async () => {
    const client = await signedInClient(
      suite.admin.email,
      suite.admin.password
    );
    const { data, error } = await client.rpc('get_admin_users');
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('super_admin receives results', async () => {
    const client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
    const { data, error } = await client.rpc('get_admin_users');
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });
});
