import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';

/**
 * RLS integration tests — requires:
 *   1. `supabase start` (Docker running)
 *   2. `supabase db reset` (migrations + seed applied)
 *
 * Strategy: sign in as each seed user, then query using their
 * session JWT so Postgres evaluates RLS as that user.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string;
const secretKey = import.meta.env.VITE_SUPABASE_SECRET_KEY as string;

/** Sign in and return a client authenticated as that user. */
async function signedInClient(email: string, password: string) {
  const client = createClient<Database>(url, anonKey);
  const { error } = await client.auth.signInWithPassword({ email, password });
  expect(error, `Sign-in failed for ${email}: ${error?.message}`).toBeNull();
  return client;
}

describe('RLS — profiles table', () => {
  describe('regular user (user@test.com)', () => {
    let client: Awaited<ReturnType<typeof signedInClient>>;

    beforeAll(async () => {
      client = await signedInClient('user@test.com', 'password123');
    });

    it('can read their own profile', async () => {
      const { data, error } = await client.from('profiles').select('name');
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].name).toBe('Test User');
    });

    it('cannot see other profiles', async () => {
      const { data, error } = await client.from('profiles').select('name');
      expect(error).toBeNull();
      const names = data!.map((p) => p.name);
      expect(names).not.toContain('Admin User');
    });

    it('cannot insert a new profile', async () => {
      const { error } = await client.from('profiles').insert({
        auth_user_id: '00000000-0000-0000-0000-000000000099',
        name: 'Intruder',
        region_id: 1,
      });
      expect(error).not.toBeNull();
    });

    it('cannot delete profiles', async () => {
      await client.from('profiles').delete().eq('name', 'Test User');

      const serviceClient = createClient<Database>(url, secretKey);
      const { data } = await serviceClient
        .from('profiles')
        .select('name')
        .eq('name', 'Test User');
      expect(data).toHaveLength(1);
    });
  });

  describe('admin user (admin@test.com)', () => {
    let client: Awaited<ReturnType<typeof signedInClient>>;

    beforeAll(async () => {
      client = await signedInClient('admin@test.com', 'password123');
    });

    it('can read all local profiles', async () => {
      const { data, error } = await client
        .from('profiles')
        .select('name')
        .order('name');
      expect(error).toBeNull();
      expect(data).toHaveLength(4);
      const names = data!.map((p) => p.name);
      expect(names).toContain('Test User');
      expect(names).toContain('Admin User');
    });

    it("can update another user's profile", async () => {
      const { error } = await client
        .from('profiles')
        .update({ bio: 'Updated by admin' })
        .eq('name', 'Test User');
      expect(error).toBeNull();

      // Restore
      await client
        .from('profiles')
        .update({ bio: null })
        .eq('name', 'Test User');
    });
  });
});

describe('RLS — role checks', () => {
  it('regular user is_admin() returns false', async () => {
    const client = await signedInClient('user@test.com', 'password123');
    const { data } = await client.rpc('is_admin');
    expect(data).toBe(false);
  });

  it('admin user is_admin() returns true', async () => {
    const client = await signedInClient('admin@test.com', 'password123');
    const { data } = await client.rpc('is_admin');
    expect(data).toBe(true);
  });

  it('regular user get_my_role() returns user', async () => {
    const client = await signedInClient('user@test.com', 'password123');
    const { data } = await client.rpc('get_my_role');
    expect(data).toBe('user');
  });

  it('admin user get_my_role() returns admin', async () => {
    const client = await signedInClient('admin@test.com', 'password123');
    const { data } = await client.rpc('get_my_role');
    expect(data).toBe('admin');
  });
});
