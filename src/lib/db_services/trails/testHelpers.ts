/**
 * Trail-specific test fixtures.
 *
 * Requires local Supabase running (`pnpm db:start`) with migrations + seed applied.
 */

import { serviceClient } from '../supabaseTestClients';
import type { Database } from '../../supabase/database.types';

// ---------------------------------------------------------------------------
// Fixture geometry
// ---------------------------------------------------------------------------

/** Minimal valid LineString in Ladysmith, BC. */
export const SAMPLE_GEOMETRY = {
  type: 'LineString' as const,
  coordinates: [
    [-123.82, 48.98],
    [-123.81, 48.97],
  ],
};

// ---------------------------------------------------------------------------
// Fixture trail factory
// ---------------------------------------------------------------------------

type TrailInsert = Database['public']['Tables']['trails']['Insert'];

/**
 * Inserts a trail via service_role (bypasses RLS) and returns its id.
 * Use in `beforeAll` / `beforeEach` to create controlled fixtures.
 */
export async function fixtureCreateTrail(
  overrides: Partial<TrailInsert> & { name: string }
): Promise<number> {
  const { data, error } = await serviceClient
    .from('trails')
    .insert({
      type: 'trail',
      geometry: SAMPLE_GEOMETRY as unknown as string,
      visibility: 'public',
      region_id: 1,
      ...overrides,
    })
    .select('id')
    .single();

  if (error) throw new Error(`fixtureCreateTrail failed: ${error.message}`);
  return data.id;
}

/** Deletes trails by id via service_role. Call in `afterAll` / `afterEach`. */
export async function fixtureDeleteTrails(...ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await serviceClient.from('trails').delete().in('id', ids);
}
