import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  anonClient,
  serviceClient,
  signedInClient,
} from '../supabaseTestClients';
import {
  suiteSetup,
  suiteTeardown,
  type SuiteFixtures,
} from '../profiles/testHelpers';

const P = '__regions_rls_test__';

let suite: SuiteFixtures;

beforeAll(async () => {
  suite = await suiteSetup(P);
});

afterAll(async () => {
  await suiteTeardown(suite);
});

describe('regions RLS — SELECT', () => {
  it('anon can SELECT regions', async () => {
    const { data, error } = await anonClient.from('regions').select('id');
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('user can SELECT regions', async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    const { data, error } = await client.from('regions').select('id');
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });
});

describe('regions RLS — INSERT/UPDATE/DELETE — non-super_admin (denied)', () => {
  it('anon cannot INSERT a region', async () => {
    const { error } = await anonClient
      .from('regions')
      .insert({ name: `i_test_${P}anon` });
    expect(error).not.toBeNull();
  });

  it('user cannot INSERT a region', async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    const { error } = await client
      .from('regions')
      .insert({ name: `i_test_${P}user` });
    expect(error).not.toBeNull();
  });

  it('super_user cannot INSERT a region', async () => {
    const client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
    const { error } = await client
      .from('regions')
      .insert({ name: `i_test_${P}super-user` });
    expect(error).not.toBeNull();
  });

  it('admin cannot INSERT a region', async () => {
    const client = await signedInClient(
      suite.admin.email,
      suite.admin.password
    );
    const { error } = await client
      .from('regions')
      .insert({ name: `i_test_${P}admin` });
    expect(error).not.toBeNull();
  });
});

describe('regions RLS — INSERT/UPDATE/DELETE — super_admin (permitted)', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;
  let insertedRegionId: number;

  beforeAll(async () => {
    client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
  });

  afterAll(async () => {
    if (insertedRegionId) {
      await serviceClient.from('regions').delete().eq('id', insertedRegionId);
    }
  });

  it('can INSERT a region', async () => {
    const { data, error } = await client
      .from('regions')
      .insert({ name: `i_test_${P}super-admin` })
      .select('id')
      .single();
    expect(error).toBeNull();
    insertedRegionId = data!.id;
  });

  it('can UPDATE a region', async () => {
    const { error } = await client
      .from('regions')
      .update({ name: `i_test_${P}super-admin-updated` })
      .eq('id', insertedRegionId);
    expect(error).toBeNull();
  });

  it('can DELETE a region', async () => {
    const { error } = await client
      .from('regions')
      .delete()
      .eq('id', insertedRegionId);
    expect(error).toBeNull();
    const { data } = await serviceClient
      .from('regions')
      .select('id')
      .eq('id', insertedRegionId)
      .maybeSingle();
    expect(data).toBeNull();
    insertedRegionId = 0; // mark as already deleted so afterAll skip
  });
});
