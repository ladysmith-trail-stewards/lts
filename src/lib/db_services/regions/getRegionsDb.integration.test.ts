import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getRegionsDb } from './getRegionsDb';
import {
  anonClient,
  serviceClient,
  signedInClient,
} from '../supabaseTestClients';
import { TestSuite, type BuiltTestSuite } from '../testSuite';

// Requires local Supabase running (`pnpm db:start`). See README.md for RLS rules.

const P = '__get_regions_test__';

let suite: BuiltTestSuite;

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').createAllUsers().build();
});

afterAll(async () => {
  await suite.teardown();
});

describe('getRegionsDb({ metaOnly: true }) — excludes Default region (id=0)', () => {
  it('anon does not see region id=0', async () => {
    const { data, error } = await getRegionsDb(anonClient, { metaOnly: true });
    expect(error).toBeNull();
    expect(data!.map((r) => r.id)).not.toContain(0);
  });

  it('returns only regions with id > 0', async () => {
    const { data, error } = await getRegionsDb(serviceClient, {
      metaOnly: true,
    });
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    for (const r of data!) {
      expect(r.id).toBeGreaterThan(0);
    }
  });

  it('includes the suite-local region', async () => {
    const { data, error } = await getRegionsDb(serviceClient, {
      metaOnly: true,
    });
    expect(error).toBeNull();
    expect(data!.map((r) => r.id)).toContain(suite.regionId);
  });

  it('returns results ordered by name', async () => {
    const { data, error } = await getRegionsDb(serviceClient, {
      metaOnly: true,
    });
    expect(error).toBeNull();
    // Only check ordering among the fixture regions this suite added.
    // Avoids depending on how seed data (e.g. "Ladysmith") sorts relative
    // to "i_test_*" names under different DB collations.
    const fixtureNames = data!
      .filter((r) => r.name.startsWith('i_test_'))
      .map((r) => r.name);
    expect(fixtureNames).toEqual([...fixtureNames].sort());
  });
});

describe('getRegionsDb({ metaOnly: true }) — RLS: all authenticated roles can SELECT', () => {
  it('anon can read regions', async () => {
    const { data, error } = await getRegionsDb(anonClient, { metaOnly: true });
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('user can read regions', async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    const { data, error } = await getRegionsDb(client, { metaOnly: true });
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('admin can read regions', async () => {
    const client = await signedInClient(
      suite.admin.email,
      suite.admin.password
    );
    const { data, error } = await getRegionsDb(client, { metaOnly: true });
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('super_user can read regions', async () => {
    const client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
    const { data, error } = await getRegionsDb(client, { metaOnly: true });
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('super_admin can read regions', async () => {
    const client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
    const { data, error } = await getRegionsDb(client, { metaOnly: true });
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it.todo('pending (google SSO) user can read regions');
});

describe('getRegionsDb({ metaOnly: true }) — response shape', () => {
  it('each region has id and name, no bbox', async () => {
    const { data, error } = await getRegionsDb(serviceClient, {
      metaOnly: true,
    });
    expect(error).toBeNull();
    for (const r of data!) {
      expect(typeof r.id).toBe('number');
      expect(typeof r.name).toBe('string');
      expect(r.name.length).toBeGreaterThan(0);
      expect((r as unknown as Record<string, unknown>)['bbox']).toBeUndefined();
    }
  });
});

describe('getRegionsDb() — full record with bbox', () => {
  it('returns id, name and bbox', async () => {
    const { data, error } = await getRegionsDb(serviceClient);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    for (const r of data!) {
      expect(typeof r.id).toBe('number');
      expect(typeof r.name).toBe('string');
      // bbox is null or a 4-element numeric tuple
      if (r.bbox !== null) {
        expect(Array.isArray(r.bbox)).toBe(true);
        expect(r.bbox).toHaveLength(4);
        for (const coord of r.bbox) {
          expect(typeof coord).toBe('number');
        }
      }
    }
  });
});

describe('getRegionsDb — pending user', () => {
  it.todo('pending (google SSO) user can read regions (metaOnly)');
  it.todo('pending (google SSO) user can read regions with bbox');
});
