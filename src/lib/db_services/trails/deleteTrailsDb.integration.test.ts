import { describe, it, expect } from 'vitest';
import { deleteTrailsDb } from './deleteTrailsDb';
import {
  anonClient,
  serviceClient,
  signedInClient,
  SEED_USER,
  SEED_ADMIN,
  SEED_SUPER_USER,
  SEED_SUPER_ADMIN,
} from '../supabaseTestClients';
import { fixtureCreateTrail } from './testHelpers';

const P = '__delete_trails_test__';

describe('deleteTrailsDb — anon (denied)', () => {
  it('trail still exists and deleted_at is unset after anon attempts soft-delete (RLS silent no-op)', async () => {
    const id = await fixtureCreateTrail({ name: `${P}anon-target` });
    const { error } = await deleteTrailsDb(anonClient, id);
    void error;

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
  it('trail still exists and deleted_at is unset after user attempts soft-delete', async () => {
    const id = await fixtureCreateTrail({ name: `${P}user-target` });
    const client = await signedInClient(SEED_USER.email, SEED_USER.password);
    await deleteTrailsDb(client, id);

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
      region_id: 1,
    });
    const client = await signedInClient(SEED_ADMIN.email, SEED_ADMIN.password);
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
      region_id: 1,
    });
    const client = await signedInClient(
      SEED_SUPER_USER.email,
      SEED_SUPER_USER.password
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
    const id = await fixtureCreateTrail({ name: `${P}super-admin-target` });
    const client = await signedInClient(
      SEED_SUPER_ADMIN.email,
      SEED_SUPER_ADMIN.password
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
      fixtureCreateTrail({ name: `${P}bulk-1` }),
      fixtureCreateTrail({ name: `${P}bulk-2` }),
      fixtureCreateTrail({ name: `${P}bulk-3` }),
    ]);

    const { error } = await deleteTrailsDb(serviceClient, [id1, id2, id3]);
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
    const { error } = await deleteTrailsDb(serviceClient, 999_999_999);
    expect(error).toBeNull();
  });
});
