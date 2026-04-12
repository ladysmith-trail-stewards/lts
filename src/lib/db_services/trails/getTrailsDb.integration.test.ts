import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTrailsDb } from './getTrailsDb';
import {
  anonClient,
  serviceClient,
  signedInClient,
} from '../supabaseTestClients';
import { fixtureCreateTrail, fixtureDeleteTrails } from './testHelpers';
import { TestSuite, type BuiltTestSuite } from '../testSuite';

// Requires local Supabase running (`pnpm db:start`). See README.md for RLS rules.

const P = '__gt_test__';
const NAMES = {
  public: `${P}public`,
  hidden: `${P}hidden`,
  private: `${P}private`,
};

let suite: BuiltTestSuite;
let fixtureIds: number[] = [];

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').createAllUsers().build();
  const [publicId, hiddenId, privateId] = await Promise.all([
    fixtureCreateTrail({
      name: NAMES.public,
      visibility: 'public',
      hidden: false,
      region_id: suite.regionId,
    }),
    fixtureCreateTrail({
      name: NAMES.hidden,
      visibility: 'public',
      hidden: true,
      region_id: suite.regionId,
    }),
    fixtureCreateTrail({
      name: NAMES.private,
      visibility: 'private',
      hidden: false,
      region_id: suite.regionId,
    }),
  ]);
  fixtureIds = [publicId, hiddenId, privateId];
});

afterAll(async () => {
  await fixtureDeleteTrails(...fixtureIds);
  await suite.teardown();
});

function names(data: { name: string }[] | null) {
  return (data ?? []).map((t) => t.name);
}

describe('getTrailsDb — anon', () => {
  it('returns public trails (anon can read public visibility)', async () => {
    const { data, error } = await getTrailsDb(anonClient);
    expect(error).toBeNull();
    expect(names(data)).toContain(NAMES.public);
  });

  it('does NOT return hidden trails by default', async () => {
    const { data } = await getTrailsDb(anonClient);
    expect(names(data)).not.toContain(NAMES.hidden);
  });

  it('does NOT return private trails', async () => {
    const { data } = await getTrailsDb(anonClient);
    expect(names(data)).not.toContain(NAMES.private);
  });

  it('hidden=true exposes public hidden trails for anon; still no private', async () => {
    const { data } = await getTrailsDb(anonClient, { hidden: true });
    const n = names(data);
    expect(n).toContain(NAMES.public);
    expect(n).toContain(NAMES.hidden);
    expect(n).not.toContain(NAMES.private);
  });
});

describe('getTrailsDb — authenticated user (role: user)', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;

  beforeAll(async () => {
    client = await signedInClient(suite.user.email, suite.user.password);
  });

  it('returns public trails', async () => {
    const { data } = await getTrailsDb(client);
    expect(names(data)).toContain(NAMES.public);
  });

  it('returns private trails (user role sees all)', async () => {
    const { data } = await getTrailsDb(client);
    expect(names(data)).toContain(NAMES.private);
  });

  it('does NOT return hidden trails by default', async () => {
    const { data } = await getTrailsDb(client);
    expect(names(data)).not.toContain(NAMES.hidden);
  });

  it('hidden=true exposes hidden trails', async () => {
    const { data } = await getTrailsDb(client, { hidden: true });
    expect(names(data)).toContain(NAMES.hidden);
  });
});

describe('getTrailsDb — admin', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;

  beforeAll(async () => {
    client = await signedInClient(suite.admin.email, suite.admin.password);
  });

  it('returns public trails', async () => {
    const { data } = await getTrailsDb(client);
    expect(names(data)).toContain(NAMES.public);
  });

  it('returns private trails', async () => {
    const { data } = await getTrailsDb(client);
    expect(names(data)).toContain(NAMES.private);
  });

  it('does NOT return hidden trails by default', async () => {
    const { data } = await getTrailsDb(client);
    expect(names(data)).not.toContain(NAMES.hidden);
  });

  it('hidden=true returns hidden trails', async () => {
    const { data } = await getTrailsDb(client, { hidden: true });
    expect(names(data)).toContain(NAMES.hidden);
  });
});

describe('getTrailsDb — super_user', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;

  beforeAll(async () => {
    client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
  });

  it('returns public trails', async () => {
    const { data } = await getTrailsDb(client);
    expect(names(data)).toContain(NAMES.public);
  });

  it('returns private trails', async () => {
    const { data } = await getTrailsDb(client);
    expect(names(data)).toContain(NAMES.private);
  });

  it('does NOT return hidden trails by default', async () => {
    const { data } = await getTrailsDb(client);
    expect(names(data)).not.toContain(NAMES.hidden);
  });

  it('hidden=true returns hidden trails', async () => {
    const { data } = await getTrailsDb(client, { hidden: true });
    expect(names(data)).toContain(NAMES.hidden);
  });
});

describe('getTrailsDb — super_admin', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;

  beforeAll(async () => {
    client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
  });

  it('returns public trails', async () => {
    const { data } = await getTrailsDb(client);
    expect(names(data)).toContain(NAMES.public);
  });

  it('returns private trails', async () => {
    const { data } = await getTrailsDb(client);
    expect(names(data)).toContain(NAMES.private);
  });

  it('does NOT return hidden trails by default', async () => {
    const { data } = await getTrailsDb(client);
    expect(names(data)).not.toContain(NAMES.hidden);
  });

  it('hidden=true returns hidden trails', async () => {
    const { data } = await getTrailsDb(client, { hidden: true });
    expect(names(data)).toContain(NAMES.hidden);
  });
});

describe('getTrailsDb — service role', () => {
  it('returns private trails', async () => {
    const { data } = await getTrailsDb(serviceClient);
    expect(names(data)).toContain(NAMES.private);
  });

  it('hidden=true returns hidden trails', async () => {
    const { data } = await getTrailsDb(serviceClient, { hidden: true });
    expect(names(data)).toContain(NAMES.hidden);
  });
});

describe('getTrailsDb — response shape', () => {
  it('returns geometry_geojson as a GeoJSON LineString object', async () => {
    const { data, error } = await getTrailsDb(serviceClient, { hidden: true });
    expect(error).toBeNull();

    const trail = (data ?? []).find((t) => t.name === NAMES.public);
    expect(trail).toBeDefined();

    const geom = trail!.geometry_geojson as {
      type: string;
      coordinates: number[][];
    };
    expect(geom.type).toBe('LineString');
    expect(Array.isArray(geom.coordinates)).toBe(true);
    expect(geom.coordinates.length).toBeGreaterThanOrEqual(2);
  });

  it('returns distance_m as a positive number', async () => {
    const { data, error } = await getTrailsDb(serviceClient, { hidden: true });
    expect(error).toBeNull();

    const trail = (data ?? []).find((t) => t.name === NAMES.public);
    expect(trail).toBeDefined();
    expect(typeof trail!.distance_m).toBe('number');
    expect(trail!.distance_m).toBeGreaterThan(0);
  });

  it('returns expected trail fields', async () => {
    const { data } = await getTrailsDb(serviceClient, { hidden: true });
    const trail = (data ?? []).find((t) => t.name === NAMES.public);
    expect(trail).toMatchObject({
      name: NAMES.public,
      visibility: 'public',
      hidden: false,
      type: 'trail',
      region_id: suite.regionId,
    });
  });
});

describe('getTrailsDb — pending user', () => {
  it.todo('pending (google SSO) user sees only public trails');
});
