import { describe, it, expect } from 'vitest';

describe('Supabase local connection', () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  it('has the required environment variables', () => {
    expect(url, 'VITE_SUPABASE_URL is not set').toBeTruthy();
    expect(
      key,
      'VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY is not set'
    ).toBeTruthy();
  });

  // NOTE: Skipped because the PostgREST container takes a few seconds to become
  // healthy after `supabase db reset`, causing a spurious HTTP 500 when the
  // full test suite runs immediately afterwards. Connectivity is implicitly
  // verified by every other integration test that queries the database.
  it.skip('can connect and reach the database', async () => {
    const response = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });

    expect(response.ok, `Connection failed: HTTP ${response.status}`).toBe(
      true
    );
  });
});
