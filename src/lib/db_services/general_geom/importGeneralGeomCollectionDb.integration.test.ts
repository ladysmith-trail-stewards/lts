import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { importGeneralGeomCollectionDb } from './importGeneralGeomCollectionDb';
import { serviceClient, signedInClient } from '../supabaseTestClients';
import { TestSuite, type BuiltTestSuite } from '../testSuite';

const P = '__import_general_geom_test__';

// Minimal valid Point geometry.
const POINT: GeoJSON.Feature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-123.98, 49.01] },
  properties: { name: 'Test Point' },
};

const LINE: GeoJSON.Feature = {
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [
      [-123.98, 49.01],
      [-123.97, 49.02],
    ],
  },
  properties: {},
};

let suite: BuiltTestSuite;

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').createAllUsers().build();
});

afterAll(async () => {
  // Cascade-delete any imported collections created during these tests.
  await serviceClient
    .from('general_geom_collection')
    .delete()
    .like('label', `${P}%`);
  await suite.teardown();
});

// ---------------------------------------------------------------------------
// Happy path — service client (bypasses RLS)
// ---------------------------------------------------------------------------

describe('importGeneralGeomCollectionDb — single feature insert', () => {
  it('returns ok=true with an id for each inserted feature', async () => {
    const { results, allOk, error } = await importGeneralGeomCollectionDb(
      serviceClient,
      {
        collection: {
          label: `${P}single`,
          visibility: 'public',
          feature_collection_type: 'Point',
          region_id: suite.regionId,
        },
        features: [POINT],
      }
    );

    expect(error).toBeNull();
    expect(allOk).toBe(true);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(typeof results[0].id).toBe('number');
    expect(results[0].id).toBeGreaterThan(0);
  });
});

describe('importGeneralGeomCollectionDb — multiple features', () => {
  it('inserts all features and returns one result per feature', async () => {
    const { results, allOk, error } = await importGeneralGeomCollectionDb(
      serviceClient,
      {
        collection: {
          label: `${P}multi`,
          visibility: 'public',
          feature_collection_type: 'Mixed',
          region_id: suite.regionId,
        },
        features: [POINT, LINE],
      }
    );

    expect(error).toBeNull();
    expect(allOk).toBe(true);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.ok).toBe(true);
      expect(r.id).toBeGreaterThan(0);
    }
  });

  it('stamps region_id on every inserted general_geom row', async () => {
    const { results } = await importGeneralGeomCollectionDb(serviceClient, {
      collection: {
        label: `${P}region-check`,
        visibility: 'public',
        feature_collection_type: 'Point',
        region_id: suite.regionId,
      },
      features: [POINT],
    });

    const { data } = await serviceClient
      .from('general_geom')
      .select('region_id')
      .eq('id', results[0].id!)
      .single();

    expect(data!.region_id).toBe(suite.regionId);
  });
});

describe('importGeneralGeomCollectionDb — collection persisted correctly', () => {
  it('creates a general_geom_collection row with the supplied label', async () => {
    const label = `${P}collection-check`;
    await importGeneralGeomCollectionDb(serviceClient, {
      collection: {
        label,
        description: 'Integration test collection',
        visibility: 'private',
        feature_collection_type: 'LineString',
        region_id: suite.regionId,
      },
      features: [LINE],
    });

    const { data, error } = await serviceClient
      .from('general_geom_collection')
      .select('label, visibility, region_id, description')
      .eq('label', label)
      .single();

    expect(error).toBeNull();
    expect(data!.label).toBe(label);
    expect(data!.visibility).toBe('private');
    expect(data!.region_id).toBe(suite.regionId);
    expect(data!.description).toBe('Integration test collection');
  });
});

// ---------------------------------------------------------------------------
// RLS — role-based access
// ---------------------------------------------------------------------------

describe('importGeneralGeomCollectionDb — RLS: anon denied', () => {
  it('returns an error for unauthenticated callers', async () => {
    // anon client — use supabase rpc directly since importGeneralGeomCollectionDb
    // accepts any SupabaseClient<Database>
    const { error } = await importGeneralGeomCollectionDb(
      // Create a temporary anon client inline via the test utility.
      // We import anonClient from supabaseTestClients.
      (await import('../supabaseTestClients')).anonClient,
      {
        collection: {
          label: `${P}anon`,
          visibility: 'public',
          feature_collection_type: 'Point',
          region_id: suite.regionId,
        },
        features: [POINT],
      }
    );
    expect(error).not.toBeNull();
  });
});

describe('importGeneralGeomCollectionDb — RLS: user denied', () => {
  it('returns an error for role=user', async () => {
    const client = await signedInClient(suite.user.email, suite.user.password);
    const { error } = await importGeneralGeomCollectionDb(client, {
      collection: {
        label: `${P}user`,
        visibility: 'public',
        feature_collection_type: 'Point',
        region_id: suite.regionId,
      },
      features: [POINT],
    });
    expect(error).not.toBeNull();
  });
});

describe('importGeneralGeomCollectionDb — RLS: super_user permitted', () => {
  it('succeeds for role=super_user in their own region', async () => {
    const client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
    const { error, allOk } = await importGeneralGeomCollectionDb(client, {
      collection: {
        label: `${P}super-user`,
        visibility: 'public',
        feature_collection_type: 'Point',
        region_id: suite.regionId,
      },
      features: [POINT],
    });
    expect(error).toBeNull();
    expect(allOk).toBe(true);
  });
});

describe('importGeneralGeomCollectionDb — RLS: admin permitted', () => {
  it('succeeds for role=admin in their own region', async () => {
    const client = await signedInClient(
      suite.admin.email,
      suite.admin.password
    );
    const { error, allOk } = await importGeneralGeomCollectionDb(client, {
      collection: {
        label: `${P}admin`,
        visibility: 'public',
        feature_collection_type: 'Point',
        region_id: suite.regionId,
      },
      features: [POINT],
    });
    expect(error).toBeNull();
    expect(allOk).toBe(true);
  });
});

describe('importGeneralGeomCollectionDb — RLS: super_admin permitted', () => {
  it('succeeds for role=super_admin', async () => {
    const client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
    const { error, allOk } = await importGeneralGeomCollectionDb(client, {
      collection: {
        label: `${P}super-admin`,
        visibility: 'public',
        feature_collection_type: 'Point',
        region_id: suite.regionId,
      },
      features: [POINT],
    });
    expect(error).toBeNull();
    expect(allOk).toBe(true);
  });
});
