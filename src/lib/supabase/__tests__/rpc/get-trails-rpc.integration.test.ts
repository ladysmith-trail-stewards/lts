import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../database.types';

/**
 * get_trails() RPC integration tests — requires:
 *   1. `supabase start` (Docker running)
 *   2. `supabase db reset` (migrations + seed applied)
 *
 * Access-control cases covered:
 *   - anon can see public trails, not hidden, not private
 *   - regular user can see all public trails, not hidden by default
 *   - admin can see everything including hidden
 *   - hidden=true arg includes hidden trails for those who have access
 */

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string;
const secretKey = import.meta.env.VITE_SUPABASE_SECRET_KEY as string;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const serviceClient = createClient<Database>(url, secretKey);

/** Minimal valid geometry — a two-point LineString in Ladysmith, BC. */
const SAMPLE_GEOMETRY = {
  type: 'LineString' as const,
  coordinates: [
    [-123.82, 48.98],
    [-123.81, 48.97],
  ],
};

type TrailInsert = Database['public']['Tables']['trails']['Insert'];

/** Insert a trail via service role and return its id. */
async function createTrail(
  overrides: Partial<TrailInsert> & { name: string }
): Promise<number> {
  const { data, error } = await serviceClient
    .from('trails')
    .insert({
      type: 'trail',
      geometry: SAMPLE_GEOMETRY as unknown as string,
      visibility: 'public',
      region_id: 1,
      ...overrides,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createTrail failed: ${error.message}`);
  return data.id;
}

/** Delete trails by id via service role. */
async function deleteTrails(...ids: number[]) {
  if (ids.length === 0) return;
  await serviceClient.from('trails').delete().in('id', ids);
}

/** Sign in and return an authenticated client. */
async function signedInClient(email: string, password: string) {
  const client = createClient<Database>(url, anonKey);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

/** Call get_trails() and return the names of the results. */
async function trailNames(
  client: ReturnType<typeof createClient<Database>>,
  opts: { hidden?: boolean } = {}
) {
  const { data, error } = await client.rpc('get_trails', {
    hidden: opts.hidden ?? false,
  });
  if (error) throw new Error(`get_trails failed: ${error.message}`);
  return (data ?? []).map((t) => t.name);
}

// ---------------------------------------------------------------------------
// Fixture trail names — unique prefix avoids collisions with other test runs
// ---------------------------------------------------------------------------
const PREFIX = '__rpc_test__';
const T = {
  public: `${PREFIX}public`,
  hidden: `${PREFIX}hidden`,
  private: `${PREFIX}private`,
};

// ---------------------------------------------------------------------------
// Suite setup: create fixture trails once, tear them down after all suites
// ---------------------------------------------------------------------------
let trailIds: number[] = [];

beforeAll(async () => {
  const [publicId, hiddenId, privateId] = await Promise.all([
    createTrail({ name: T.public, visibility: 'public', hidden: false }),
    createTrail({ name: T.hidden, visibility: 'public', hidden: true }),
    createTrail({ name: T.private, visibility: 'private', hidden: false }),
  ]);
  trailIds = [publicId, hiddenId, privateId];
});

afterAll(async () => {
  await deleteTrails(...trailIds);
});

// ---------------------------------------------------------------------------
// Anon caller
// ---------------------------------------------------------------------------
describe('get_trails() — anon caller', () => {
  const anonClient = createClient<Database>(url, anonKey);

  it('returns public trails', async () => {
    const names = await trailNames(anonClient);
    expect(names).toContain(T.public);
  });

  it('does NOT return hidden trails by default', async () => {
    const names = await trailNames(anonClient);
    expect(names).not.toContain(T.hidden);
  });

  it('does NOT return private trails', async () => {
    const names = await trailNames(anonClient);
    expect(names).not.toContain(T.private);
  });

  it('hidden=true arg exposes hidden public trails to anon', async () => {
    const names = await trailNames(anonClient, { hidden: true });
    expect(names).toContain(T.public);
    expect(names).toContain(T.hidden);
    expect(names).not.toContain(T.private);
  });
});

// ---------------------------------------------------------------------------
// Regular authenticated user
// ---------------------------------------------------------------------------
describe('get_trails() — regular user (user@test.com)', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;

  beforeAll(async () => {
    client = await signedInClient('user@test.com', 'password123');
  });

  it('returns public trails', async () => {
    const names = await trailNames(client);
    expect(names).toContain(T.public);
  });

  it('does NOT return hidden trails by default', async () => {
    const names = await trailNames(client);
    expect(names).not.toContain(T.hidden);
  });

  it('hidden=true exposes hidden public trails', async () => {
    const names = await trailNames(client, { hidden: true });
    expect(names).toContain(T.hidden);
  });

  it('can see all public trails (user role sees all trails)', async () => {
    const names = await trailNames(client);
    expect(names).toContain(T.public);
  });
});

// ---------------------------------------------------------------------------
// Admin user
// ---------------------------------------------------------------------------
describe('get_trails() — admin user (admin@test.com)', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;

  beforeAll(async () => {
    client = await signedInClient('admin@test.com', 'password123');
  });

  it('returns public trails', async () => {
    const names = await trailNames(client);
    expect(names).toContain(T.public);
  });

  it('returns private trails', async () => {
    const names = await trailNames(client);
    expect(names).toContain(T.private);
  });

  it('does NOT return hidden trails by default', async () => {
    const names = await trailNames(client);
    expect(names).not.toContain(T.hidden);
  });

  it('hidden=true returns hidden trails', async () => {
    const names = await trailNames(client, { hidden: true });
    expect(names).toContain(T.hidden);
  });
});

// ---------------------------------------------------------------------------
// Geometry shape
// ---------------------------------------------------------------------------
describe('get_trails() — geometry output', () => {
  it('returns geometry as a GeoJSON LineString object', async () => {
    const { data, error } = await serviceClient.rpc('get_trails');
    expect(error).toBeNull();
    const trail = (data ?? []).find((t) => t.name === T.public);
    expect(trail).toBeDefined();
    const geom = trail!.geometry as { type: string; coordinates: number[][] };
    expect(geom.type).toBe('LineString');
    expect(Array.isArray(geom.coordinates)).toBe(true);
    expect(geom.coordinates.length).toBeGreaterThanOrEqual(2);
  });
});
