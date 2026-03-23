/**
 * Shared Supabase clients for integration tests.
 *
 * Requires local Supabase running (`pnpm db:start`) with migrations + seed applied.
 *
 * Seed users (password: "password123"):
 *   user@test.com  → role: user
 *   admin@test.com → role: admin
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

// ---------------------------------------------------------------------------
// Well-known seed credentials
// ---------------------------------------------------------------------------

export const SEED_USER = { email: 'user@test.com', password: 'password123' };
export const SEED_ADMIN = { email: 'admin@test.com', password: 'password123' };
export const SEED_SUPER_USER = {
  email: 'super_user@test.com',
  password: 'password123',
};
export const SEED_SUPER_ADMIN = {
  email: 'super_admin@test.com',
  password: 'password123',
};
