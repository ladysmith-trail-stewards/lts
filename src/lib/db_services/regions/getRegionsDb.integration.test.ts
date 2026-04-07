import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getRegionsDb } from './getRegionsDb';
import { anonClient, serviceClient, signedInClient } from '../supabaseTestClients';
import {
  suiteSetup,
  suiteTeardown,
  type SuiteFixtures,
} from '../profiles/testHelpers';

// Requires local Supabase running (`pnpm db:start`). See README.md for RLS rules.

const P = '__get_regions_test__';

let suite: SuiteFixtures;

beforeAll(async () => {
  suite = await suiteSetup(P);
});

afterAll(async () => {
  await suiteTeardown(suite);
});

describe('getRegionsDb — excludes Default region (id=0)', () => {
  it('anon does not see region id=0', async () => {
    const { data, error } = await getRegionsDb(anonClient);
    expect(error).toBeNull();
    expect(data!.map((r) => r.id)).not.toContain(0);
  });

  it('returns only regions with id > 0', async () => {
    const { data, error } = await getRegionsDb(serviceClient);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    for (const r of data!) {
      expect(r.id).toBeGreaterThan(0);
    }
  });

  it('includes the suite-local region', async () => {
    const { data, error } = await getRegionsDb(serviceClient);
    expect(error).toBeNull();
    expect(data!.map((r) => r.id)).toContain(suite.regionId);
  });

  it('returns results ordered by name', async () => {
    const { data, error } = await getRegionsDb(serviceClient);
    expect(error).toBeNull();
    const names = data!.map((r) => r.name);
    expect(names).toEqual([...names].sort());
  });
});

describe('getRegionsDb — RLS: all authenticated roles can SELECT', () => {
  it('anon can read regions', async () => {
    const { data, error } = await getRegionsDb(anonClient);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('user can read regions', async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    const { data, error } = await getRegionsDb(client);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('admin can read regions', async () => {
    const client = await signedInClient(suite.admin.email, suite.admin.password);
    const { data, error } = await getRegionsDb(client);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('super_user can read regions', async () => {
    const client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
    const { data, error } = await getRegionsDb(client);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('super_admin can read regions', async () => {
    const client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
    const { data, error } = await getRegionsDb(client);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });
});

describe('getRegionsDb — response shape', () => {
  it('each region has id and name', async () => {
    const { data, error } = await getRegionsDb(serviceClient);
    expect(error).toBeNull();
    for (const r of data!) {
      expect(typeof r.id).toBe('number');
      expect(typeof r.name).toBe('string');
      expect(r.name.length).toBeGreaterThan(0);
    }
  });
});
