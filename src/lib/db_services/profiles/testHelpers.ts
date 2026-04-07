/**
 * Profile-specific test fixtures.
 *
 * Requires local Supabase running (`pnpm db:start`) with migrations + seed applied.
 */

import { serviceClient } from '../supabaseTestClients';
import type { Database } from '../../supabase/database.types';

type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
type AppRole = Database['public']['Enums']['app_role'];

/** Module-level registry so cleanup can find the auth user even after the profile row is deleted. */
const authUserByProfileId = new Map<number, string>();

/** Credentials returned by {@link fixtureCreateUser}. */
export interface FixtureUserCredentials {
  profileId: number;
  authUserId: string;
  email: string;
  password: string;
  role: AppRole;
}

/** All per-suite fixtures returned by {@link suiteSetup}. */
export interface SuiteFixtures {
  /** The suite-local region id created for this suite. */
  regionId: number;
  user: FixtureUserCredentials;
  admin: FixtureUserCredentials;
  superUser: FixtureUserCredentials;
  superAdmin: FixtureUserCredentials;
  pending: FixtureUserCredentials;
}

/**
 * Creates a dedicated region + five role-users for one test suite.
 *
 * All names/emails are prefixed with `i_test_{tag}_` so they are:
 *   - Collision-free across parallel suites (use a unique tag per file,
 *     e.g. the constant `P` you already define in every test file).
 *   - Easy for global setup/teardown to sweep up via a prefix scan.
 *
 * Call in `beforeAll`; pass the returned `SuiteFixtures` to `suiteTeardown`
 * in `afterAll`.
 */
export async function suiteSetup(tag: string): Promise<SuiteFixtures> {
  const safeTag = tag.replace(/[^a-z0-9]/gi, '_').toLowerCase();

  // Create the suite-local region
  const regionName = `i_test_${safeTag}`;
  const { data: regionRow, error: regionErr } = await serviceClient
    .from('regions')
    .insert({ name: regionName })
    .select('id')
    .single();
  if (regionErr) throw new Error(`suiteSetup (region): ${regionErr.message}`);
  const regionId = regionRow.id;

  // Create the five role-users in parallel
  const [user, admin, superUser, superAdmin, pending] = await Promise.all([
    _createSuiteUser(safeTag, 'user', regionId),
    _createSuiteUser(safeTag, 'admin', regionId),
    _createSuiteUser(safeTag, 'super_user', regionId),
    _createSuiteUser(safeTag, 'super_admin', regionId),
    _createSuiteUser(safeTag, 'pending', regionId, 'google'),
  ]);

  return { regionId, user, admin, superUser, superAdmin, pending };
}

/**
 * Tears down everything created by {@link suiteSetup}: auth users, profiles,
 * and the suite-local region.
 */
export async function suiteTeardown(suite: SuiteFixtures): Promise<void> {
  const users = [
    suite.user,
    suite.admin,
    suite.superUser,
    suite.superAdmin,
    suite.pending,
  ];
  await Promise.all(users.map(fixtureDeleteUser));
  // Region cascades or can be deleted directly (trails FK blocks, but suite
  // trails should already be gone by this point)
  await serviceClient.from('regions').delete().eq('id', suite.regionId);
}

/**
 * Removes ALL `i_test_*` profiles, auth users, and regions from the DB.
 * Called by global setup (before tests) and global teardown (after tests)
 * to ensure a clean slate and catch any leaked fixtures from crashed runs.
 */
export async function purgeAllTestFixtures(): Promise<void> {
  // Trails in i_test_ regions (FK blocks region deletion otherwise)
  const { data: testRegions } = await serviceClient
    .from('regions')
    .select('id')
    .like('name', 'i_test_%');
  if (testRegions && testRegions.length > 0) {
    await serviceClient
      .from('trails')
      .delete()
      .in(
        'region_id',
        testRegions.map((r) => r.id)
      );
  }

  // Profiles whose name starts with i_test_
  const { data: profiles } = await serviceClient
    .from('profiles')
    .select('id, auth_user_id')
    .like('name', 'i_test_%');

  if (profiles && profiles.length > 0) {
    await serviceClient
      .from('profiles')
      .delete()
      .in(
        'id',
        profiles.map((p) => p.id)
      );
    await Promise.all(
      profiles.map(({ auth_user_id }) =>
        serviceClient.auth.admin.deleteUser(auth_user_id).catch(() => {})
      )
    );
  }

  // Regions whose name starts with i_test_
  await serviceClient.from('regions').delete().like('name', 'i_test_%');
}

/** Internal helper — creates one auth user + profile for a suite. */
async function _createSuiteUser(
  safeTag: string,
  role: AppRole,
  regionId: number,
  provider?: string
): Promise<FixtureUserCredentials> {
  const name = `i_test_${safeTag}_${role}`;
  return fixtureCreateUser({ name, role, region_id: regionId, provider });
}

/**
 * Creates a throw-away auth user + profile with the given role and returns
 * sign-in credentials along with the profile id.
 *
 * Idempotent — if the email already exists the existing auth user is reused.
 * Call {@link fixtureDeleteUser} in `afterAll` to clean up.
 */
export async function fixtureCreateUser(opts: {
  name: string;
  role: AppRole;
  region_id?: number;
  /** Provider metadata added to raw_app_meta_data (e.g. to simulate google SSO) */
  provider?: string;
}): Promise<FixtureUserCredentials> {
  const { name, role, region_id = 1, provider } = opts;
  const password = 'fixture-password-123';
  const email = `i_test_${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}@test-fixture.invalid`;

  let authUserId: string;
  const { data: created, error: authError } =
    await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      ...(provider
        ? {
            app_metadata: {
              provider,
              providers: [provider],
            },
          }
        : {}),
    });

  if (authError) {
    if (!authError.message.includes('already been registered')) {
      throw new Error(`fixtureCreateUser (auth): ${authError.message}`);
    }
    const { data: listed } = await serviceClient.auth.admin.listUsers({
      perPage: 200,
    });
    const existing = listed?.users.find((u) => u.email === email);
    if (!existing)
      throw new Error(
        `fixtureCreateUser: could not find existing user ${email}`
      );
    authUserId = existing.id;
  } else {
    authUserId = created.user.id;
  }

  const { data, error } = await serviceClient
    .from('profiles')
    .update({ name, role, region_id, deleted_at: null })
    .eq('auth_user_id', authUserId)
    .select('id')
    .single();

  if (error) throw new Error(`fixtureCreateUser (update): ${error.message}`);

  authUserByProfileId.set(data.id, authUserId);
  return { profileId: data.id, authUserId, email, password, role };
}

/**
 * Deletes a fixture user created by {@link fixtureCreateUser} (auth row + profile).
 */
export async function fixtureDeleteUser(
  credentials: FixtureUserCredentials
): Promise<void> {
  await serviceClient.from('profiles').delete().eq('id', credentials.profileId);
  await serviceClient.auth.admin
    .deleteUser(credentials.authUserId)
    .catch(() => {});
  authUserByProfileId.delete(credentials.profileId);
}

/**
 * Creates a throw-away profile and returns its id.
 *
 * Creates a matching auth.users row first (idempotent — reuses any existing
 * auth user with the same fixture email). The `handle_new_user` trigger
 * auto-inserts a profile — we then update it with our desired overrides.
 */
export async function fixtureCreateProfile(
  overrides: Partial<ProfileInsert> & { name: string }
): Promise<number> {
  const email = `i_test_${overrides.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}@test-fixture.invalid`;

  // Try to create the auth user; if already exists, look it up instead
  let authUserId: string;
  const { data: created, error: authError } =
    await serviceClient.auth.admin.createUser({
      email,
      password: 'fixture-password-123',
      email_confirm: true,
    });

  if (authError) {
    if (!authError.message.includes('already been registered')) {
      throw new Error(`fixtureCreateProfile (auth): ${authError.message}`);
    }
    // Reuse existing auth user
    const { data: listed } = await serviceClient.auth.admin.listUsers({
      perPage: 200,
    });
    const existing = listed?.users.find((u) => u.email === email);
    if (!existing)
      throw new Error(
        `fixtureCreateProfile: could not find existing user ${email}`
      );
    authUserId = existing.id;
  } else {
    authUserId = created.user.id;
  }

  // Upsert the profile row (trigger may or may not have already created it)
  const { data, error } = await serviceClient
    .from('profiles')
    .update({
      role: 'user',
      region_id: 1,
      deleted_at: null,
      ...overrides,
    })
    .eq('auth_user_id', authUserId)
    .select('id')
    .single();

  if (error) throw new Error(`fixtureCreateProfile (update): ${error.message}`);

  authUserByProfileId.set(data.id, authUserId);
  return data.id;
}

/**
 * Cleans up fixture profiles and their auth.users rows.
 *
 * Safe to call after a hard-delete test — uses the module-level registry
 * to find the auth user even when the profile row is already gone.
 */
export async function fixtureDeleteProfiles(...ids: number[]): Promise<void> {
  if (ids.length === 0) return;

  const authUserIds = new Set<string>();
  for (const id of ids) {
    const cached = authUserByProfileId.get(id);
    if (cached) authUserIds.add(cached);
  }

  const { data: profiles } = await serviceClient
    .from('profiles')
    .select('auth_user_id')
    .in('id', ids);
  if (profiles) {
    for (const { auth_user_id } of profiles) authUserIds.add(auth_user_id);
  }

  await serviceClient.from('profiles').delete().in('id', ids);

  for (const uid of authUserIds) {
    await serviceClient.auth.admin.deleteUser(uid).catch(() => {});
  }
  for (const id of ids) authUserByProfileId.delete(id);
}
