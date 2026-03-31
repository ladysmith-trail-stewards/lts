import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  anonClient,
  serviceClient,
  signedInClient,
  SEED_USER,
} from '../../db_services/supabaseTestClients';
import {
  fixtureCreateTrail,
  fixtureDeleteTrails,
} from '../../db_services/trails/testHelpers';

const P = '__trails_view_test__';
let publicTrailId: number;
let privateTrailId: number;
let softDeletedTrailId: number;

beforeAll(async () => {
  [publicTrailId, privateTrailId, softDeletedTrailId] = await Promise.all([
    fixtureCreateTrail({
      name: `${P}public`,
      visibility: 'public',
      region_id: 1,
    }),
    fixtureCreateTrail({
      name: `${P}private`,
      visibility: 'private',
      region_id: 1,
    }),
    fixtureCreateTrail({
      name: `${P}soft-deleted`,
      visibility: 'public',
      region_id: 1,
    }),
  ]);
  // Soft-delete the third trail directly via service role
  await serviceClient
    .from('trails')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', softDeletedTrailId);
});

afterAll(async () => {
  await fixtureDeleteTrails(publicTrailId, privateTrailId, softDeletedTrailId);
});

function fixtureNames(data: { name: string | null }[] | null) {
  return (data ?? []).map((t) => t.name ?? '');
}

describe('trails_view — anon', () => {
  it('sees public non-deleted trails', async () => {
    const { data, error } = await anonClient
      .from('trails_view')
      .select('name')
      .in('name', [`${P}public`, `${P}private`, `${P}soft-deleted`]);
    expect(error).toBeNull();
    expect(fixtureNames(data)).toContain(`${P}public`);
  });

  it('cannot see private trails', async () => {
    const { data } = await anonClient
      .from('trails_view')
      .select('name')
      .eq('name', `${P}private`);
    expect(fixtureNames(data)).not.toContain(`${P}private`);
  });

  it('cannot see soft-deleted trails', async () => {
    const { data } = await anonClient
      .from('trails_view')
      .select('name')
      .eq('name', `${P}soft-deleted`);
    expect(fixtureNames(data)).not.toContain(`${P}soft-deleted`);
  });
});

describe('trails_view — authenticated', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>;
  beforeAll(async () => {
    client = await signedInClient(SEED_USER.email, SEED_USER.password);
  });

  it('sees public trails', async () => {
    const { data } = await client
      .from('trails_view')
      .select('name')
      .eq('name', `${P}public`);
    expect(fixtureNames(data)).toContain(`${P}public`);
  });

  it('sees private trails', async () => {
    const { data } = await client
      .from('trails_view')
      .select('name')
      .eq('name', `${P}private`);
    expect(fixtureNames(data)).toContain(`${P}private`);
  });

  it('does not see soft-deleted trails', async () => {
    const { data } = await client
      .from('trails_view')
      .select('name')
      .eq('name', `${P}soft-deleted`);
    expect(fixtureNames(data)).not.toContain(`${P}soft-deleted`);
  });
});

describe('trails_view — response shape', () => {
  it('returns distance_m and geometry_geojson columns', async () => {
    const { data, error } = await anonClient
      .from('trails_view')
      .select('distance_m, geometry_geojson')
      .eq('name', `${P}public`)
      .single();
    expect(error).toBeNull();
    expect(data).toHaveProperty('distance_m');
    expect(data).toHaveProperty('geometry_geojson');
    expect(typeof data!.distance_m).toBe('number');
    expect(data!.geometry_geojson).not.toBeNull();
  });
});
