import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { upsertTrailsDb } from './upsertTrailsDb';
import type { TrailFeature } from './upsertTrailsDb';
import {
  anonClient,
  serviceClient,
  signedInClient,
} from '../supabaseTestClients';
import { fixtureDeleteTrails, SAMPLE_GEOMETRY } from './testHelpers';
import { TestSuite, type BuiltTestSuite } from '../testSuite';

const P = '__upsert_test__';

let suite: BuiltTestSuite;
const created: number[] = [];

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').createAllUsers().build();
});

afterAll(async () => {
  await suite.teardown();
});

afterEach(async () => {
  await fixtureDeleteTrails(...created.splice(0));
});

function trailFeature(nameSuffix: string, id?: number): TrailFeature {
  return {
    type: 'Feature',
    geometry: SAMPLE_GEOMETRY as TrailFeature['geometry'],
    properties: {
      ...(id != null ? { id } : {}),
      name: `${P}${nameSuffix}`,
      type: 'trail',
      visibility: 'public',
      region_id: suite.regionId,
    },
  };
}

describe('upsertTrailsDb — anon (denied)', () => {
  it('returns a top-level error, no rows inserted', async () => {
    const { results, allOk, error } = await upsertTrailsDb(
      anonClient,
      trailFeature('anon')
    );
    expect(error).not.toBeNull();
    expect(allOk).toBe(false);
    expect(results).toHaveLength(0);
  });
});

describe('upsertTrailsDb — user role (denied)', () => {
  it('returns a top-level error', async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    const { results, allOk, error } = await upsertTrailsDb(
      client,
      trailFeature('user')
    );
    expect(error).not.toBeNull();
    expect(allOk).toBe(false);
    expect(results).toHaveLength(0);
  });
});

describe('upsertTrailsDb — admin insert (permitted for own region)', () => {
  it('inserts a trail and returns ok=true with an id', async () => {
    const client = await signedInClient(
      suite.admin.email,
      suite.admin.password
    );
    const { results, allOk, error } = await upsertTrailsDb(
      client,
      trailFeature('admin-insert')
    );

    expect(error).toBeNull();
    expect(allOk).toBe(true);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(typeof results[0].id).toBe('number');

    created.push(results[0].id!);
  });
});

describe('upsertTrailsDb — super_user insert', () => {
  it('inserts and returns ok=true', async () => {
    const client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
    const { results, allOk, error } = await upsertTrailsDb(
      client,
      trailFeature('super-user-insert')
    );

    expect(error).toBeNull();
    expect(allOk).toBe(true);
    created.push(results[0].id!);
  });
});

describe('upsertTrailsDb — super_admin insert', () => {
  it('inserts and returns ok=true', async () => {
    const client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
    const { results, allOk, error } = await upsertTrailsDb(
      client,
      trailFeature('super-admin-insert')
    );

    expect(error).toBeNull();
    expect(allOk).toBe(true);
    created.push(results[0].id!);
  });
});

describe('upsertTrailsDb — update existing trail', () => {
  it('updates by id and persists the new name', async () => {
    const client = await signedInClient(
      suite.admin.email,
      suite.admin.password
    );

    const { results: insertResults } = await upsertTrailsDb(
      serviceClient,
      trailFeature('to-update')
    );
    const id = insertResults[0].id!;
    created.push(id);

    const newName = `${P}updated-name`;
    const { results, allOk, error } = await upsertTrailsDb(client, {
      ...trailFeature('to-update', id),
      properties: {
        id,
        name: newName,
        type: 'trail',
        visibility: 'public',
        region_id: suite.regionId,
      },
    });

    expect(error).toBeNull();
    expect(allOk).toBe(true);
    expect(results[0].id).toBe(id);

    const { data: row } = await serviceClient
      .from('trails')
      .select('name')
      .eq('id', id)
      .single();
    expect(row!.name).toBe(newName);
  });
});

describe('upsertTrailsDb — update persists new geometry', () => {
  it('updates by id and overwrites the stored LineString geometry', async () => {
    const { results: insertResults } = await upsertTrailsDb(
      serviceClient,
      trailFeature('geom-update')
    );
    const id = insertResults[0].id!;
    created.push(id);

    const newGeometry: TrailFeature['geometry'] = {
      type: 'LineString',
      coordinates: [
        [-123.9, 49.0],
        [-123.89, 48.99],
      ],
    };

    const { error, allOk } = await upsertTrailsDb(serviceClient, {
      type: 'Feature',
      geometry: newGeometry,
      properties: {
        id,
        name: `${P}geom-update`,
        type: 'trail',
        visibility: 'public',
        region_id: suite.regionId,
      },
    });

    expect(error).toBeNull();
    expect(allOk).toBe(true);

    const { data: row } = await serviceClient
      .from('trails_view')
      .select('geometry_geojson')
      .eq('id', id)
      .single();

    const stored = row!.geometry_geojson as {
      type: string;
      coordinates: number[][];
    };
    expect(stored.type).toBe('LineString');
    expect(stored.coordinates[0][0]).toBeCloseTo(-123.9, 4);
    expect(stored.coordinates[0][1]).toBeCloseTo(49.0, 4);
    expect(stored.coordinates[1][0]).toBeCloseTo(-123.89, 4);
    expect(stored.coordinates[1][1]).toBeCloseTo(48.99, 4);
  });
});

describe('upsertTrailsDb — bulk insert', () => {
  it('inserts three trails and returns all ok=true', async () => {
    const { results, allOk, error } = await upsertTrailsDb(serviceClient, [
      trailFeature('bulk-1'),
      trailFeature('bulk-2'),
      trailFeature('bulk-3'),
    ]);

    expect(error).toBeNull();
    expect(allOk).toBe(true);
    expect(results).toHaveLength(3);
    results.forEach((r) => {
      expect(r.ok).toBe(true);
      expect(typeof r.id).toBe('number');
      created.push(r.id!);
    });
  });
});

describe('upsertTrailsDb — invalid geometry', () => {
  it('returns a top-level error and inserts nothing', async () => {
    const { results, allOk, error } = await upsertTrailsDb(serviceClient, {
      type: 'Feature',
      geometry: {
        type: 'Point' as unknown as 'LineString',
        coordinates: [[-123.83, 48.99]],
      },
      properties: {
        name: `${P}bad-geom`,
        type: 'trail',
        visibility: 'public',
        region_id: suite.regionId,
      },
    });

    expect(error).not.toBeNull();
    expect(allOk).toBe(false);
    expect(results).toHaveLength(0);
  });
});

describe('upsertTrailsDb — sentinel id = -1 treated as insert', () => {
  it('inserts a new trail when id is -1 (Draw Trail sentinel) and returns a positive id', async () => {
    const { results, allOk, error } = await upsertTrailsDb(
      serviceClient,
      trailFeature('sentinel-insert', -1)
    );

    expect(error).toBeNull();
    expect(allOk).toBe(true);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(results[0].id).toBeGreaterThan(0);

    created.push(results[0].id!);
  });
});

describe('upsertTrailsDb — pending user', () => {
  it.todo('pending (google SSO) user cannot upsert a trail');
});
