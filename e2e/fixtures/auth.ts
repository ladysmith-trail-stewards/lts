import { test as base, type Page } from '@playwright/test';

/**
 * Seed user credentials (from supabase/seed.sql).
 * All share the same password.
 */
export const SEED_USERS = {
  user: { email: 'user@test.com', password: 'password123', role: 'user' },
  super_user: {
    email: 'super_user@test.com',
    password: 'password123',
    role: 'super_user',
  },
  admin: { email: 'admin@test.com', password: 'password123', role: 'admin' },
  super_admin: {
    email: 'super_admin@test.com',
    password: 'password123',
    role: 'super_admin',
  },
} as const;

export type SeedUserKey = keyof typeof SEED_USERS;

/**
 * Sign in via the Supabase REST API and inject the session into the browser's
 * localStorage so tests skip the login form UI for non-auth specs.
 */
export async function signInViaApi(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  const supabaseUrl =
    process.env.E2E_SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    'http://127.0.0.1:54321';
  const supabaseAnonKey =
    process.env.E2E_SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    '';

  const res = await page.request.post(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      headers: {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      data: { email, password },
    },
  );

  if (!res.ok()) {
    throw new Error(
      `Supabase sign-in failed for ${email}: ${res.status()} ${await res.text()}`,
    );
  }

  const session = await res.json();

  // Inject session into localStorage so the app's AuthProvider picks it up.
  await page.goto('/');
  await page.evaluate(
    ({ session, supabaseUrl }) => {
      const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
      localStorage.setItem(storageKey, JSON.stringify(session));
    },
    { session, supabaseUrl },
  );
}

/**
 * Extended test fixture that exposes a `signIn` helper for each spec.
 */
export const test = base.extend<{
  signIn: (userKey: SeedUserKey) => Promise<void>;
}>({
  signIn: async ({ page }, provide) => {
    await provide(async (userKey: SeedUserKey) => {
      const { email, password } = SEED_USERS[userKey];
      await signInViaApi(page, email, password);
    });
  },
});

export { expect } from '@playwright/test';
