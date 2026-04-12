import { describe, it, expect } from 'vitest';
import { getTrailClassOptionsDb } from './getTrailClassOptionsDb';
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
// The `trail_class_options` view is created by migration 20260403000000.

const EXPECTED_VALUES = [
  'EASIEST',
  'EASY',
  'INTERMEDIATE',
  'BLACK',
  'DOUBLE_BLACK',
  'ADVANCED',
  'PRO',
  'ACCESS',
  'PATH',
  'SECONDARY',
  'IMBY',
  'LIFT',
  'TBD',
];

function values(data: { value: string }[] | null) {
  return (data ?? []).map((r) => r.value);
}

describe('getTrailClassOptionsDb — anon', () => {
  it('returns all trail class options', async () => {
    const { data, error } = await getTrailClassOptionsDb(anonClient);
    expect(error).toBeNull();
    expect(values(data)).toEqual(EXPECTED_VALUES);
  });

  it('returns rows with value, label, and sort_order fields', async () => {
    const { data, error } = await getTrailClassOptionsDb(anonClient);
    expect(error).toBeNull();
    const row = (data ?? []).find((r) => r.value === 'INTERMEDIATE');
    expect(row).toMatchObject({
      value: 'INTERMEDIATE',
      label: 'Intermediate',
      sort_order: 3,
    });
  });

  it('returns rows ordered by sort_order ascending', async () => {
    const { data } = await getTrailClassOptionsDb(anonClient);
    const orders = (data ?? []).map((r) => r.sort_order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

describe('getTrailClassOptionsDb — authenticated user (role: user)', () => {
  it('returns all trail class options', async () => {
    const client = await signedInClient(SEED_USER.email, SEED_USER.password);
    const { data, error } = await getTrailClassOptionsDb(client);
    expect(error).toBeNull();
    expect(values(data)).toEqual(EXPECTED_VALUES);
  });
});

describe('getTrailClassOptionsDb — super_user', () => {
  it('returns all trail class options', async () => {
    const client = await signedInClient(
      SEED_SUPER_USER.email,
      SEED_SUPER_USER.password
    );
    const { data, error } = await getTrailClassOptionsDb(client);
    expect(error).toBeNull();
    expect(values(data)).toEqual(EXPECTED_VALUES);
  });
});

describe('getTrailClassOptionsDb — admin', () => {
  it('returns all trail class options', async () => {
    const client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
    const { data, error } = await getTrailClassOptionsDb(client);
    expect(error).toBeNull();
    expect(values(data)).toEqual(EXPECTED_VALUES);
  });
});

describe('getTrailClassOptionsDb — super_admin', () => {
  it('returns all trail class options', async () => {
    const client = await signedInClient(
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
    );
    const { data, error } = await getTrailClassOptionsDb(client);
    expect(error).toBeNull();
    expect(values(data)).toEqual(EXPECTED_VALUES);
  });
});

describe('getTrailClassOptionsDb — service role', () => {
  it('returns all trail class options', async () => {
    const { data, error } = await getTrailClassOptionsDb(serviceClient);
    expect(error).toBeNull();
    expect(values(data)).toEqual(EXPECTED_VALUES);
  });

  it('returns exactly 13 options', async () => {
    const { data } = await getTrailClassOptionsDb(serviceClient);
    expect(data).toHaveLength(13);
  });
});
