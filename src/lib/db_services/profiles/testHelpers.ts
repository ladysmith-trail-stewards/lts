/**
 * Profile-specific test fixtures.
 *
 * Requires local Supabase running (`pnpm db:start`) with migrations + seed applied.
 */

import { serviceClient } from '../supabaseTestClients';
import type { Database } from '../../supabase/database.types';

type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];

/** Module-level registry so cleanup can find the auth user even after the profile row is deleted. */
const authUserByProfileId = new Map<number, string>();

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
  const email = `fixture-${overrides.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}@test-fixture.invalid`;

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
