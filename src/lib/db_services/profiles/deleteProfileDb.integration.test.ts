import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { deleteProfileDb } from './deleteProfileDb';
import { serviceClient } from '../supabaseTestClients';
import { fixtureCreateProfile, fixtureDeleteProfiles } from './testHelpers';
import { TestSuite, type BuiltTestSuite } from '../testSuite';

const P = '__delete_profile_test__';

let suite: BuiltTestSuite;

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').build();
});

afterAll(async () => {
  await suite.teardown();
});

describe('deleteProfileDb — sets deleted_at', () => {
  it('sets deleted_at on the row', async () => {
    const id = await fixtureCreateProfile({
      name: `${P}target`,
      region_id: suite.regionId,
    });

    const { error } = await deleteProfileDb(serviceClient, id);
    expect(error).toBeNull();

    const { data: row } = await serviceClient
      .from('profiles')
      .select('id, deleted_at')
      .eq('id', id)
      .single();
    expect(row!.deleted_at).not.toBeNull();

    await fixtureDeleteProfiles(id);
  });
});

describe('deleteProfileDb — bulk', () => {
  it('sets deleted_at on multiple profiles in one call', async () => {
    const id1 = await fixtureCreateProfile({
      name: `${P}bulk-1`,
      region_id: suite.regionId,
    });
    const id2 = await fixtureCreateProfile({
      name: `${P}bulk-2`,
      region_id: suite.regionId,
    });

    const { error } = await deleteProfileDb(serviceClient, [id1, id2]);
    expect(error).toBeNull();

    const { data: rows } = await serviceClient
      .from('profiles')
      .select('id, deleted_at')
      .in('id', [id1, id2]);
    expect(rows).toHaveLength(2);
    for (const row of rows!) {
      expect(row.deleted_at).not.toBeNull();
    }

    await fixtureDeleteProfiles(id1, id2);
  });
});

describe('deleteProfileDb — non-existent id', () => {
  it('is a no-op (no error)', async () => {
    const { error } = await deleteProfileDb(serviceClient, 9999999);
    expect(error).toBeNull();
  });
});

describe('deleteProfileDb — pending user', () => {
  it.todo('pending (google SSO) user cannot soft-delete a profile');
});
