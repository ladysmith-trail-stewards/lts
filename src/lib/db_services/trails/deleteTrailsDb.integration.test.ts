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
  it('trail still exists after anon attempts delete (RLS silent no-op)', async () => {
    const id = await fixtureCreateTrail({ name: `${P}anon-target` });
    const { error } = await deleteTrailsDb(anonClient, id);
    void error;

    const { data: row } = await serviceClient
      .from('trails')
      .select('id')
      .eq('id', id)
      .single();
    expect(row).not.toBeNull();

    await serviceClient.from('trails').delete().eq('id', id);
  });
});

describe('deleteTrailsDb — user role (denied)', () => {
  it('trail still exists after user attempts delete', async () => {
    const id = await fixtureCreateTrail({ name: `${P}user-target` });
    const client = await signedInClient(SEED_USER.email, SEED_USER.password);
    await deleteTrailsDb(client, id);

    const { data: row } = await serviceClient
      .from('trails')
      .select('id')
      .eq('id', id)
      .single();
    expect(row).not.toBeNull();

    await serviceClient.from('trails').delete().eq('id', id);
  });
});

describe('deleteTrailsDb — admin (permitted for own region)', () => {
  it('deletes a trail and row no longer exists', async () => {
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
      .select('id')
      .eq('id', id)
      .maybeSingle();
    expect(row).toBeNull();
  });
});

describe('deleteTrailsDb — super_user (permitted for own region)', () => {
  it('deletes a trail and row no longer exists', async () => {
    const id = await fixtureCreateTrail({ name: `${P}super-user-target`, region_id: 1 });
    const client = await signedInClient(SEED_SUPER_USER.email, SEED_SUPER_USER.password);
    const { error } = await deleteTrailsDb(client, id);
    expect(error).toBeNull();

    const { data: row } = await serviceClient.from('trails').select('id').eq('id', id).maybeSingle();
    expect(row).toBeNull();
  });
});

describe('deleteTrailsDb — super_admin (permitted for any trail)', () => {
  it('deletes a trail and row no longer exists', async () => {
    const id = await fixtureCreateTrail({ name: `${P}super-admin-target` });
    const client = await signedInClient(SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    const { error } = await deleteTrailsDb(client, id);
    expect(error).toBeNull();

    const { data: row } = await serviceClient.from('trails').select('id').eq('id', id).maybeSingle();
    expect(row).toBeNull();
  });
});

describe('deleteTrailsDb — bulk delete', () => {
  it('deletes multiple trails in one call', async () => {
    const [id1, id2, id3] = await Promise.all([
      fixtureCreateTrail({ name: `${P}bulk-1` }),
      fixtureCreateTrail({ name: `${P}bulk-2` }),
      fixtureCreateTrail({ name: `${P}bulk-3` }),
    ]);

    const { error } = await deleteTrailsDb(serviceClient, [id1, id2, id3]);
    expect(error).toBeNull();

    const { data: rows } = await serviceClient
      .from('trails')
      .select('id')
      .in('id', [id1, id2, id3]);
    expect(rows).toHaveLength(0);
  });
});

describe('deleteTrailsDb — non-existent id', () => {
  it('is a no-op (no error)', async () => {
    const { error } = await deleteTrailsDb(serviceClient, 999_999_999);
    expect(error).toBeNull();
  });
});

