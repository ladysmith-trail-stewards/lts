import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { deleteTrailsDb } from './deleteTrailsDb';
import {
  anonClient,
  serviceClient,
  signedInClient,
} from '../supabaseTestClients';
import { fixtureCreateTrail } from './testHelpers';
import { TestSuite, type BuiltTestSuite } from '../testSuite';

const P = '__delete_trails_test__';
let suite: BuiltTestSuite;

beforeAll(async () => {
  suite = await new TestSuite(P).createRegion('main').createAllUsers().build();
});

afterAll(async () => {
  await suite.teardown();
});

describe('deleteTrailsDb — anon (denied)', () => {
  it('returns an error and trail deleted_at remains unset', async () => {
    const id = await fixtureCreateTrail({
      name: `${P}anon-target`,
      region_id: suite.regionId,
    });
    const { error } = await deleteTrailsDb(anonClient, id);
    expect(error).not.toBeNull();

    const { data: row } = await serviceClient
      .from('trails')
      .select('id, deleted_at')
      .eq('id', id)
      .single();
    expect(row).not.toBeNull();
    expect(row!.deleted_at).toBeNull();

    await serviceClient.from('trails').delete().eq('id', id);
  });
});

describe('deleteTrailsDb — user role (denied)', () => {
  it('returns an error and trail deleted_at remains unset', async () => {
    const id = await fixtureCreateTrail({
      name: `${P}user-target`,
      region_id: suite.regionId,
    });
    const client = await signedInClient(suite.user.email, suite.user.password);
    const { error } = await deleteTrailsDb(client, id);
    expect(error).not.toBeNull();

    const { data: row } = await serviceClient
      .from('trails')
      .select('id, deleted_at')
      .eq('id', id)
      .single();
    expect(row).not.toBeNull();
    expect(row!.deleted_at).toBeNull();

    await serviceClient.from('trails').delete().eq('id', id);
  });
});

describe('deleteTrailsDb — admin (permitted for own region)', () => {
  it('sets deleted_at on the row and excludes it from trails_view', async () => {
    const id = await fixtureCreateTrail({
      name: `${P}admin-target`,
      visibility: 'public',
      region_id: suite.regionId,
    });
    const client = await signedInClient(
      suite.admin.email,
      suite.admin.password
    );
    const { error } = await deleteTrailsDb(client, id);

    expect(error).toBeNull();

    const { data: row } = await serviceClient
      .from('trails')
      .select('id, deleted_at')
      .eq('id', id)
      .single();
    expect(row).not.toBeNull();
    expect(row!.deleted_at).not.toBeNull();

    const { data: viewRow } = await serviceClient
      .from('trails_view')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    expect(viewRow).toBeNull();

    await serviceClient.from('trails').delete().eq('id', id);
  });
});

describe('deleteTrailsDb — super_user (permitted for own region)', () => {
  it('sets deleted_at on the row and excludes it from trails_view', async () => {
    const id = await fixtureCreateTrail({
      name: `${P}super-user-target`,
      region_id: suite.regionId,
    });
    const client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
    const { error } = await deleteTrailsDb(client, id);
    expect(error).toBeNull();

    const { data: row } = await serviceClient
      .from('trails')
      .select('id, deleted_at')
      .eq('id', id)
      .single();
    expect(row).not.toBeNull();
    expect(row!.deleted_at).not.toBeNull();

    const { data: viewRow } = await serviceClient
      .from('trails_view')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    expect(viewRow).toBeNull();

    await serviceClient.from('trails').delete().eq('id', id);
  });
});

describe('deleteTrailsDb — super_admin (permitted for any trail)', () => {
  it('sets deleted_at on the row and excludes it from trails_view', async () => {
    const id = await fixtureCreateTrail({
      name: `${P}super-admin-target`,
      region_id: suite.regionId,
    });
    const client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
    const { error } = await deleteTrailsDb(client, id);
    expect(error).toBeNull();

    const { data: row } = await serviceClient
      .from('trails')
      .select('id, deleted_at')
      .eq('id', id)
      .single();
    expect(row).not.toBeNull();
    expect(row!.deleted_at).not.toBeNull();

    const { data: viewRow } = await serviceClient
      .from('trails_view')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    expect(viewRow).toBeNull();

    await serviceClient.from('trails').delete().eq('id', id);
  });
});

describe('deleteTrailsDb — bulk delete', () => {
  it('soft-deletes multiple trails in one call', async () => {
    const [id1, id2, id3] = await Promise.all([
      fixtureCreateTrail({ name: `${P}bulk-1`, region_id: suite.regionId }),
      fixtureCreateTrail({ name: `${P}bulk-2`, region_id: suite.regionId }),
      fixtureCreateTrail({ name: `${P}bulk-3`, region_id: suite.regionId }),
    ]);
    const client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
    const { error } = await deleteTrailsDb(client, [id1, id2, id3]);
    expect(error).toBeNull();

    const { data: rows } = await serviceClient
      .from('trails')
      .select('id, deleted_at')
      .in('id', [id1, id2, id3]);
    expect(rows).toHaveLength(3);
    rows!.forEach((row) => expect(row.deleted_at).not.toBeNull());

    const { data: viewRows } = await serviceClient
      .from('trails_view')
      .select('id')
      .in('id', [id1, id2, id3]);
    expect(viewRows).toHaveLength(0);

    await serviceClient.from('trails').delete().in('id', [id1, id2, id3]);
  });
});

describe('deleteTrailsDb — non-existent id', () => {
  it('is a no-op (no error)', async () => {
    const client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
    const { error } = await deleteTrailsDb(client, 999_999_999);
    expect(error).toBeNull();
  });
});

describe('deleteTrailsDb — pending user', () => {
  it.todo('pending (google SSO) user cannot soft-delete a trail');
});
