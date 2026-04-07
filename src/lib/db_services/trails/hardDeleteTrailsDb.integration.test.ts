import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  anonClient,
  serviceClient,
  signedInClient,
} from '../supabaseTestClients';
import { fixtureCreateTrail } from './testHelpers';
import {
  suiteSetup,
  suiteTeardown,
  type SuiteFixtures,
} from '../profiles/testHelpers';

/**
 * Hard-delete via PostgREST DELETE (table-level RLS policy).
 *
 * Only super_admin has the "trails: super_admin delete" RLS policy.
 * For all other roles PostgREST returns no error but deletes zero rows
 * (RLS silently filters the row out rather than raising an error).
 * We assert the row still exists as the definitive proof of denial.
 */

const P = '__hard_delete_trails_test__';
let suite: SuiteFixtures;

beforeAll(async () => {
  suite = await suiteSetup(P);
});

afterAll(async () => {
  await suiteTeardown(suite);
});

async function rowExists(id: number): Promise<boolean> {
  const { data } = await serviceClient
    .from('trails')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  return data !== null;
}

// ---------------------------------------------------------------------------
// Anon — denied (row survives)
// ---------------------------------------------------------------------------
describe('hard delete trails (RLS) — anon (denied)', () => {
  it('row survives after anon DELETE attempt', async () => {
    const id = await fixtureCreateTrail({
      name: `${P}anon-target`,
      region_id: suite.regionId,
    });

    await anonClient.from('trails').delete().eq('id', id);

    expect(await rowExists(id)).toBe(true);
    await serviceClient.from('trails').delete().eq('id', id);
  });
});

// ---------------------------------------------------------------------------
// User — denied (row survives)
// ---------------------------------------------------------------------------
describe('hard delete trails (RLS) — user (denied)', () => {
  it('row survives after user DELETE attempt', async () => {
    const id = await fixtureCreateTrail({
      name: `${P}user-target`,
      region_id: suite.regionId,
    });

    const client = await signedInClient(suite.user.email, suite.user.password);
    await client.from('trails').delete().eq('id', id);

    expect(await rowExists(id)).toBe(true);
    await serviceClient.from('trails').delete().eq('id', id);
  });
});

// ---------------------------------------------------------------------------
// Admin — denied (row survives)
// ---------------------------------------------------------------------------
describe('hard delete trails (RLS) — admin (denied)', () => {
  it('row survives after admin DELETE attempt', async () => {
    const id = await fixtureCreateTrail({
      name: `${P}admin-target`,
      region_id: suite.regionId,
    });

    const client = await signedInClient(
      suite.admin.email,
      suite.admin.password
    );
    await client.from('trails').delete().eq('id', id);

    expect(await rowExists(id)).toBe(true);
    await serviceClient.from('trails').delete().eq('id', id);
  });
});

// ---------------------------------------------------------------------------
// Super User — denied (row survives)
// ---------------------------------------------------------------------------
describe('hard delete trails (RLS) — super_user (denied)', () => {
  it('row survives after super_user DELETE attempt', async () => {
    const id = await fixtureCreateTrail({
      name: `${P}super-user-target`,
      region_id: suite.regionId,
    });

    const client = await signedInClient(
      suite.superUser.email,
      suite.superUser.password
    );
    await client.from('trails').delete().eq('id', id);

    expect(await rowExists(id)).toBe(true);
    await serviceClient.from('trails').delete().eq('id', id);
  });
});

// ---------------------------------------------------------------------------
// Super Admin — permitted via RLS DELETE policy
// ---------------------------------------------------------------------------
describe('hard delete trails (RLS) — super_admin (permitted)', () => {
  it('permanently deletes the row', async () => {
    const id = await fixtureCreateTrail({
      name: `${P}super-admin-target`,
      region_id: suite.regionId,
    });

    const client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
    const { error } = await client.from('trails').delete().eq('id', id);
    expect(error).toBeNull();

    expect(await rowExists(id)).toBe(false);
  });

  it('bulk deletes multiple rows', async () => {
    const [id1, id2, id3] = await Promise.all([
      fixtureCreateTrail({ name: `${P}bulk-1`, region_id: suite.regionId }),
      fixtureCreateTrail({ name: `${P}bulk-2`, region_id: suite.regionId }),
      fixtureCreateTrail({ name: `${P}bulk-3`, region_id: suite.regionId }),
    ]);

    const client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
    const { error } = await client
      .from('trails')
      .delete()
      .in('id', [id1, id2, id3]);
    expect(error).toBeNull();

    const { data: rows } = await serviceClient
      .from('trails')
      .select('id')
      .in('id', [id1, id2, id3]);
    expect(rows).toHaveLength(0);
  });

  it('delete on non-existent id is a silent no-op', async () => {
    const client = await signedInClient(
      suite.superAdmin.email,
      suite.superAdmin.password
    );
    const { error } = await client
      .from('trails')
      .delete()
      .eq('id', 999_999_999);
    expect(error).toBeNull();
  });
});
