import { describe, it, expect } from 'vitest';
import { serviceClient } from '../../db_services/supabaseTestClients';

/**
 * Seed verification tests — requires:
 *   1. `supabase start` (Docker running)
 *   2. `supabase db reset` (migrations + seed applied)
 *
 * Only static seed data (regions, trails) is verified here.
 * Test users are created on demand as fixtures by the integration test suite —
 * see `profiles/testHelpers.ts` → `suiteSetup()`.
 */

describe('Seed data verification', () => {
  const client = serviceClient;

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

  describe('Trails', () => {
    it('has at least one seeded trail in region 1', async () => {
      const { data, error } = await client
        .from('trails')
        .select('id')
        .eq('region_id', 1);
      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThan(0);
    });
  });
});
