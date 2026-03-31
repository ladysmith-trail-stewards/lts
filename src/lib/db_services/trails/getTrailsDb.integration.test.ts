import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTrailsDb } from './getTrailsDb';
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

const P = '__gt_test__';
const NAMES = {
  public: `${P}public`,
  hidden: `${P}hidden`,
  private: `${P}private`,
};

let fixtureIds: number[] = [];

beforeAll(async () => {
  const [publicId, hiddenId, privateId] = await Promise.all([
    fixtureCreateTrail({
      name: NAMES.public,
      visibility: 'public',
      hidden: false,
    }),
    fixtureCreateTrail({
      name: NAMES.hidden,
      visibility: 'public',
      hidden: true,
    }),
    fixtureCreateTrail({
      name: NAMES.private,
      visibility: 'private',
      hidden: false,
    }),
  ]);
  fixtureIds = [publicId, hiddenId, privateId];
});

afterAll(() => fixtureDeleteTrails(...fixtureIds));

function names(data: { name: string }[] | null) {
  return (data ?? []).map((t) => t.name);
}

describe('getTrailsDb — anon', () => {
  it('returns public trails (anon can read public visibility)', async () => {
    const { data, error } = await getTrailsDb(anonClient);
    expect(error).toBeNull();
    // Anon RLS: visibility='public' AND deleted_at IS NULL.
    // Default call also filters hidden=false, so public non-hidden trail is visible.
    expect(names(data)).toContain(NAMES.public);
  });

  it('does NOT return hidden trails by default', async () => {
    const { data } = await getTrailsDb(anonClient);
    // Default hidden=false filter excludes hidden trails regardless of anon RLS
    expect(names(data)).not.toContain(NAMES.hidden);
  });

  it('does NOT return private trails', async () => {
    const { data } = await getTrailsDb(anonClient);
    // Anon RLS blocks visibility!='public' rows entirely
    expect(names(data)).not.toContain(NAMES.private);
  });

  it('hidden=true exposes public hidden trails for anon; still no private', async () => {
    const { data } = await getTrailsDb(anonClient, { hidden: true });
    const n = names(data);
    // Anon can see public trails regardless of hidden flag (when filter is off)
    expect(n).toContain(NAMES.public);
    expect(n).toContain(NAMES.hidden); // visibility='public', passes anon RLS
    expect(n).not.toContain(NAMES.private); // visibility='private', blocked by RLS
  });
});

describe('getTrailsDb — authenticated user (role: user)', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;

  beforeAll(async () => {
    client = await signedInClient(SEED_USER.email, SEED_USER.password);
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
    client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
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
      SEED_SUPER_USER.email,
      SEED_SUPER_USER.password
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
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
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
      region_id: 1,
    });
  });
});
