import { describe, it, expect, afterEach } from 'vitest';
import { createTrailDb } from './createTrailDb';
import {
  anonClient,
  serviceClient,
  signedInClient,
  SEED_USER,
  SEED_ADMIN,
  SEED_SUPER_USER,
  SEED_SUPER_ADMIN,
} from '../supabaseTestClients';
import { fixtureDeleteTrails, SAMPLE_GEOMETRY } from './testHelpers';

// Requires local Supabase running (`pnpm db:start`). See README.md for RLS rules.

const P = '__ct_test__';

// Collect ids created during tests so we can clean up even if assertions fail
const created: number[] = [];

afterEach(async () => {
  await fixtureDeleteTrails(...created.splice(0));
});

function trailPayload(nameSuffix: string) {
  return {
    name: `${P}${nameSuffix}`,
    type: 'trail' as const,
    visibility: 'public' as const,
    region_id: 1,
    geometry: SAMPLE_GEOMETRY as unknown as string,
  };
}

describe('createTrailDb — anon (denied)', () => {
  it('returns an error and does not create a trail', async () => {
    const { data, error } = await createTrailDb(
      anonClient,
      trailPayload('anon')
    );
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

describe('createTrailDb — user role (denied)', () => {
  it('returns an error and does not create a trail', async () => {
    const client = await signedInClient(SEED_USER.email, SEED_USER.password);
    const { data, error } = await createTrailDb(client, trailPayload('user'));
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

describe('createTrailDb — admin (permitted for own region)', () => {
  it('creates a trail and returns its id', async () => {
    const client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
    const { data, error } = await createTrailDb(client, trailPayload('admin'));

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(typeof data!.id).toBe('number');

    created.push(data!.id);
  });

  it('created trail is readable afterwards', async () => {
    const client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
    const { data } = await createTrailDb(
      client,
      trailPayload('admin-readable')
    );
    created.push(data!.id);

    const { data: rows } = await serviceClient
      .from('trails')
      .select('id, name')
      .eq('id', data!.id)
      .single();

    expect(rows).not.toBeNull();
    expect(rows!.name).toBe(`${P}admin-readable`);
  });
});

describe('createTrailDb — super_user (permitted for own region)', () => {
  it('creates a trail and returns its id', async () => {
    const client = await signedInClient(
      SEED_SUPER_USER.email,
      SEED_SUPER_USER.password
    );
    const { data, error } = await createTrailDb(
      client,
      trailPayload('super-user')
    );

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(typeof data!.id).toBe('number');

    created.push(data!.id);
  });
});

describe('createTrailDb — super_admin (permitted for any region)', () => {
  it('creates a trail and returns its id', async () => {
    const client = await signedInClient(
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
    );
    const { data, error } = await createTrailDb(
      client,
      trailPayload('super-admin')
    );

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(typeof data!.id).toBe('number');

    created.push(data!.id);
  });
});

describe('createTrailDb — service role (bypasses RLS)', () => {
  it('creates a trail and returns its id', async () => {
    const { data, error } = await createTrailDb(
      serviceClient,
      trailPayload('service')
    );

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(typeof data!.id).toBe('number');

    created.push(data!.id);
  });

  it('can create a private trail', async () => {
    const { data, error } = await createTrailDb(serviceClient, {
      ...trailPayload('service-private'),
      visibility: 'private',
    });

    expect(error).toBeNull();
    created.push(data!.id);

    const { data: row } = await serviceClient
      .from('trails')
      .select('visibility')
      .eq('id', data!.id)
      .single();

    expect(row!.visibility).toBe('private');
  });

  it('can create a hidden trail', async () => {
    const { data, error } = await createTrailDb(serviceClient, {
      ...trailPayload('service-hidden'),
      hidden: true,
    });

    expect(error).toBeNull();
    created.push(data!.id);

    const { data: row } = await serviceClient
      .from('trails')
      .select('hidden')
      .eq('id', data!.id)
      .single();

    expect(row!.hidden).toBe(true);
  });
});

describe('createTrailDb — created row shape', () => {
  it('stores all provided fields correctly', async () => {
    const payload = {
      ...trailPayload('shape'),
      trail_class: 'INTERMEDIATE',
      bike: true,
      planned: false,
      hidden: false,
    };

    const { data, error } = await createTrailDb(serviceClient, payload);
    expect(error).toBeNull();
    created.push(data!.id);

    const { data: row } = await serviceClient
      .from('trails')
      .select(
        'name, type, visibility, trail_class, bike, planned, hidden, region_id'
      )
      .eq('id', data!.id)
      .single();

    expect(row).toMatchObject({
      name: payload.name,
      type: 'trail',
      visibility: 'public',
      trail_class: 'INTERMEDIATE',
      bike: true,
      planned: false,
      hidden: false,
      region_id: 1,
    });
  });
});
