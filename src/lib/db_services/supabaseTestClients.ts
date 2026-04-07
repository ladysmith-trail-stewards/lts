/**
 * Shared Supabase clients for integration tests.
 *
 * Requires local Supabase running (`pnpm db:start`) with migrations + seed applied.
 *
 * Per-suite fixture users + regions are created by `suiteSetup(tag)` (from
 * `profiles/testHelpers.ts`) inside each test file's own `beforeAll`, and
 * torn down in `afterAll` via `suiteTeardown(suite)`.
 *
 * The global setup file (`integration.global-setup.ts`) purges any stale
 * `i_test_*` rows before and after the full test run.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string;
const secretKey = import.meta.env.VITE_SUPABASE_SECRET_KEY as string;

// ---------------------------------------------------------------------------
// Pre-built clients
// ---------------------------------------------------------------------------

/** Anon (unauthenticated) client. */
export const anonClient = createClient<Database>(url, anonKey);

/** Service-role client — bypasses RLS. Used only for fixture setup/teardown. */
export const serviceClient = createClient<Database>(url, secretKey);

// ---------------------------------------------------------------------------
// Authenticated client factory
// ---------------------------------------------------------------------------

/** Returns a Supabase client signed in with the given credentials. */
export async function signedInClient(
  email: string,
  password: string
): Promise<ReturnType<typeof createClient<Database>>> {
  const client = createClient<Database>(url, anonKey);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}
