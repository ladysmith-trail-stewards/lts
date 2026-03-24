import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';

/**
 * Seed verification tests — requires:
 *   1. `supabase start` (Docker running)
 *   2. `supabase db reset` (migrations + seed applied)
 */

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string;

// Use the secret key so RLS doesn't block us during verification
const SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SECRET_KEY as string;

describe('Seed data verification', () => {
  const client = createClient<Database>(url, SERVICE_ROLE_KEY ?? anonKey);

  type ProfileRow = Database['public']['Tables']['profiles']['Row'];

  let profiles: ProfileRow[];

  beforeAll(async () => {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .order('name');

    expect(error, `Failed to fetch profiles: ${error?.message}`).toBeNull();
    profiles = data ?? [];
  });

  it('has exactly 4 seed profiles', () => {
    expect(profiles).toHaveLength(4);
  });

  describe('Test User (user@test.com)', () => {
    let user: ProfileRow;

    beforeAll(() => {
      user = profiles.find((p) => p.name === 'Test User')!;
    });

    it('exists', () => {
      expect(user, 'Test User profile not found').toBeDefined();
    });

    it('has role "user"', () => {
      expect(user.role).toBe('user');
    });

    it('has region_id 1', () => {
      expect(user.region_id).toBe(1);
    });
  });

  describe('Admin User (admin@test.com)', () => {
    let admin: ProfileRow;

    beforeAll(() => {
      admin = profiles.find((p) => p.name === 'Admin User')!;
    });

    it('exists', () => {
      expect(admin, 'Admin User profile not found').toBeDefined();
    });

    it('has role "admin"', () => {
      expect(admin.role).toBe('admin');
    });

    it('has region_id 1', () => {
      expect(admin.region_id).toBe(1);
    });
  });

  describe('Regions', () => {
    it('has the default Ladysmith region', async () => {
      const { data, error } = await client
        .from('regions')
        .select('*')
        .eq('name', 'Ladysmith');
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].id).toBe(1);
    });
  });

  describe('Auth users', () => {
    it('test user can sign in', async () => {
      const authClient = createClient<Database>(url, anonKey);
      const { data, error } = await authClient.auth.signInWithPassword({
        email: 'user@test.com',
        password: 'password123',
      });
      expect(error, `Sign-in failed: ${error?.message}`).toBeNull();
      expect(data.user?.email).toBe('user@test.com');
      await authClient.auth.signOut();
    });

    it('admin user can sign in', async () => {
      const authClient = createClient<Database>(url, anonKey);
      const { data, error } = await authClient.auth.signInWithPassword({
        email: 'admin@test.com',
        password: 'password123',
      });
      expect(error, `Sign-in failed: ${error?.message}`).toBeNull();
      expect(data.user?.email).toBe('admin@test.com');
      await authClient.auth.signOut();
    });
  });
});
