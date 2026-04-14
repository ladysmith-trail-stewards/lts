import { describe, it, expect } from 'vitest';
import { getTrailDirectionOptionsDb } from './getTrailDirectionOptionsDb';
import {
  anonClient,
  serviceClient,
  signedInClient,
  SEED_USER,
  SEED_ADMIN,
  SEED_SUPER_USER,
  SEED_SUPER_ADMIN,
} from '../supabaseTestClients';

// Requires local Supabase running (`pnpm db:start`).
// The `trail_direction_options` view is created by migration 20260403000000.

const EXPECTED_VALUES = ['both', 'oneway', 'oneway-reverse'];

function values(data: { value: string }[] | null) {
  return (data ?? []).map((r) => r.value);
}

describe('getTrailDirectionOptionsDb — anon', () => {
  it('returns all direction options', async () => {
    const { data, error } = await getTrailDirectionOptionsDb(anonClient);
    expect(error).toBeNull();
    expect(values(data)).toEqual(EXPECTED_VALUES);
  });

  it('returns rows with value, label, and sort_order fields', async () => {
    const { data, error } = await getTrailDirectionOptionsDb(anonClient);
    expect(error).toBeNull();
    const row = (data ?? []).find((r) => r.value === 'oneway');
    expect(row).toMatchObject({
      value: 'oneway',
      label: 'One Way',
      sort_order: 2,
    });
  });

  it('returns rows ordered by sort_order ascending', async () => {
    const { data } = await getTrailDirectionOptionsDb(anonClient);
    const orders = (data ?? []).map((r) => r.sort_order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

describe('getTrailDirectionOptionsDb — authenticated user (role: user)', () => {
  it('returns all direction options', async () => {
    const client = await signedInClient(SEED_USER.email, SEED_USER.password);
    const { data, error } = await getTrailDirectionOptionsDb(client);
    expect(error).toBeNull();
    expect(values(data)).toEqual(EXPECTED_VALUES);
  });
});

describe('getTrailDirectionOptionsDb — super_user', () => {
  it('returns all direction options', async () => {
    const client = await signedInClient(
      SEED_SUPER_USER.email,
      SEED_SUPER_USER.password
    );
    const { data, error } = await getTrailDirectionOptionsDb(client);
    expect(error).toBeNull();
    expect(values(data)).toEqual(EXPECTED_VALUES);
  });
});

describe('getTrailDirectionOptionsDb — admin', () => {
  it('returns all direction options', async () => {
    const client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
    const { data, error } = await getTrailDirectionOptionsDb(client);
    expect(error).toBeNull();
    expect(values(data)).toEqual(EXPECTED_VALUES);
  });
});

describe('getTrailDirectionOptionsDb — super_admin', () => {
  it('returns all direction options', async () => {
    const client = await signedInClient(
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
    );
    const { data, error } = await getTrailDirectionOptionsDb(client);
    expect(error).toBeNull();
    expect(values(data)).toEqual(EXPECTED_VALUES);
  });
});

describe('getTrailDirectionOptionsDb — service role', () => {
  it('returns all direction options', async () => {
    const { data, error } = await getTrailDirectionOptionsDb(serviceClient);
    expect(error).toBeNull();
    expect(values(data)).toEqual(EXPECTED_VALUES);
  });

  it('returns exactly 3 options', async () => {
    const { data } = await getTrailDirectionOptionsDb(serviceClient);
    expect(data).toHaveLength(3);
  });
});
