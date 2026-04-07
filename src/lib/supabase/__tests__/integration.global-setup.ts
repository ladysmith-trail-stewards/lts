/**
 * Vitest globalSetup for the integration project.
 *
 * Runs once in the main process (not a worker) before any test files start
 * and again after all test files finish.
 *
 * Responsibility: purge all `i_test_*` rows left over from previous crashed
 * runs (setup) and sweep up any rows leaked by the current run (teardown).
 *
 * Individual test suites create their own `i_test_*` region + users in
 * `beforeAll` via `suiteSetup(tag)` and clean up in `afterAll` via
 * `suiteTeardown(suite)`.  This global file is only a safety net.
 */

import { createClient } from '@supabase/supabase-js';

// globalSetup runs in the main Vitest process where import.meta.env is not
// available. Read the same values from process.env (Vitest loads .env files
// before running globalSetup when envDir is configured).
const url = process.env.VITE_SUPABASE_URL;
const secretKey = process.env.VITE_SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  throw new Error(
    'integration.global-setup: VITE_SUPABASE_URL and VITE_SUPABASE_SECRET_KEY must be set in .env'
  );
}

// Use `any` for Database type — globalSetup can't import the generated types
// without causing circular resolution issues in the main process.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = createClient<any>(url, secretKey);

async function purgeTestFixtures(): Promise<void> {
  // 1. Find all i_test_ profiles and collect their auth user ids
  const { data: profiles } = await client
    .from('profiles')
    .select('id, auth_user_id')
    .like('name', 'i_test_%');

  if (profiles && profiles.length > 0) {
    await client
      .from('profiles')
      .delete()
      .in(
        'id',
        profiles.map((p: { id: number }) => p.id)
      );

    await Promise.all(
      profiles.map(({ auth_user_id }: { auth_user_id: string }) =>
        client.auth.admin.deleteUser(auth_user_id).catch(() => {})
      )
    );
  }

  // 2. Remove i_test_ regions (after profiles are gone, FK is clear)
  await client.from('regions').delete().like('name', 'i_test_%');
}

export async function setup(): Promise<void> {
  await purgeTestFixtures();
}

export async function teardown(): Promise<void> {
  await purgeTestFixtures();
}
