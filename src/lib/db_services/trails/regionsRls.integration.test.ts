import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  anonClient,
  serviceClient,
  signedInClient,
  SEED_USER,
  SEED_ADMIN,
  SEED_SUPER_USER,
  SEED_SUPER_ADMIN,
} from '../supabaseTestClients';

const P = '__regions_rls_test__';
const TEST_REGION_ID = 999;

beforeAll(async () => {
  await serviceClient.from('regions').delete().eq('id', TEST_REGION_ID);
});

afterAll(async () => {
  await serviceClient.from('regions').delete().eq('id', TEST_REGION_ID);
});

describe('regions RLS — SELECT', () => {
  it('anon can SELECT regions', async () => {
    const { data, error } = await anonClient.from('regions').select('id');
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('user can SELECT regions', async () => {
    const client = await signedInClient(SEED_USER.email, SEED_USER.password);
    const { data, error } = await client.from('regions').select('id');
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });
});

describe('regions RLS — INSERT/UPDATE/DELETE — non-super_admin (denied)', () => {
  it('anon cannot INSERT a region', async () => {
    const { error } = await anonClient
      .from('regions')
      .insert({ id: TEST_REGION_ID, name: `${P}anon` });
    expect(error).not.toBeNull();
  });

  it('user cannot INSERT a region', async () => {
    const client = await signedInClient(SEED_USER.email, SEED_USER.password);
    const { error } = await client
      .from('regions')
      .insert({ id: TEST_REGION_ID, name: `${P}user` });
    expect(error).not.toBeNull();
  });

  it('super_user cannot INSERT a region', async () => {
    const client = await signedInClient(
      SEED_SUPER_USER.email,
      SEED_SUPER_USER.password
    );
    const { error } = await client
      .from('regions')
      .insert({ id: TEST_REGION_ID, name: `${P}super-user` });
    expect(error).not.toBeNull();
  });

  it('admin cannot INSERT a region', async () => {
    const client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
    const { error } = await client
      .from('regions')
      .insert({ id: TEST_REGION_ID, name: `${P}admin` });
    expect(error).not.toBeNull();
  });
});

describe('regions RLS — INSERT/UPDATE/DELETE — super_admin (permitted)', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;
  beforeAll(async () => {
    client = await signedInClient(
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
    );
  });

  it('can INSERT a region', async () => {
    const { error } = await client
      .from('regions')
      .insert({ id: TEST_REGION_ID, name: `${P}super-admin` });
    expect(error).toBeNull();
  });

  it('can UPDATE a region', async () => {
    const { error } = await client
      .from('regions')
      .update({ name: `${P}super-admin-updated` })
      .eq('id', TEST_REGION_ID);
    expect(error).toBeNull();
  });

  it('can DELETE a region', async () => {
    const { error } = await client
      .from('regions')
      .delete()
      .eq('id', TEST_REGION_ID);
    expect(error).toBeNull();
    const { data } = await serviceClient
      .from('regions')
      .select('id')
      .eq('id', TEST_REGION_ID)
      .maybeSingle();
    expect(data).toBeNull();
  });
});
