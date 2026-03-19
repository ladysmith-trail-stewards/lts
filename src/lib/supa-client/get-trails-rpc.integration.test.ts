import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/**
 * get_trails() RPC integration tests — requires:
 *   1. `supabase start` (Docker running)
 *   2. `supabase db reset` (migrations + seed applied)
 *
 * Strategy: each suite creates its own fixture trails via the service
 * role client and cleans them up in afterAll — no dependency on seed data.
 *
 * Access-control cases covered:
 *   - anon can see public trails, not hidden, not admin_only
 *   - regular user can see public trails, not hidden, not admin_only
 *   - attributed user can see their user-restricted trail
 *   - non-attributed user cannot see user-restricted trail
 *   - admin can see everything including admin_only and hidden
 *   - hidden=true arg includes hidden trails for those who have access
 */

const url       = import.meta.env.VITE_SUPABASE_URL as string
const anonKey   = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string
const secretKey = import.meta.env.VITE_SUPABASE_SECRET_KEY as string

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const serviceClient = createClient<Database>(url, secretKey)

/** Minimal valid geometry — a two-point LineString in Ladysmith, BC. */
const SAMPLE_GEOMETRY = {
  type: 'LineString' as const,
  coordinates: [[-123.82, 48.98], [-123.81, 48.97]],
}

type TrailInsert = Database['public']['Tables']['trails']['Insert']

/** Insert a trail via service role and return its id. */
async function createTrail(overrides: Partial<TrailInsert> & { name: string }): Promise<number> {
  const { data, error } = await serviceClient
    .from('trails')
    .insert({
      type: 'trail',
      geometry: SAMPLE_GEOMETRY as unknown as string,
      restriction: 'public',
      ...overrides,
    })
    .select('id')
    .single()
  if (error) throw new Error(`createTrail failed: ${error.message}`)
  return data.id
}

/** Delete trails by id via service role. */
async function deleteTrails(...ids: number[]) {
  if (ids.length === 0) return
  await serviceClient.from('trails').delete().in('id', ids)
}

/** Sign in and return an authenticated client. */
async function signedInClient(email: string, password: string) {
  const client = createClient<Database>(url, anonKey)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`)
  return client
}

/** Call get_trails() and return the names of the results. */
async function trailNames(
  client: ReturnType<typeof createClient<Database>>,
  opts: { hidden?: boolean } = {},
) {
  const { data, error } = await client.rpc('get_trails', { hidden: opts.hidden ?? false })
  if (error) throw new Error(`get_trails failed: ${error.message}`)
  return (data ?? []).map(t => t.name)
}

/** Look up a profile id by name (service role). */
async function profileIdByName(name: string): Promise<number> {
  const { data, error } = await serviceClient
    .from('profiles')
    .select('id')
    .eq('name', name)
    .single()
  if (error) throw new Error(`profileIdByName failed: ${error.message}`)
  return data.id
}

// ---------------------------------------------------------------------------
// Fixture trail names — unique prefix avoids collisions with other test runs
// ---------------------------------------------------------------------------
const PREFIX = '__rpc_test__'
const T = {
  public:     `${PREFIX}public`,
  hidden:     `${PREFIX}hidden`,
  adminOnly:  `${PREFIX}admin_only`,
  userRestr:  `${PREFIX}user_restricted`,
}

// ---------------------------------------------------------------------------
// Suite setup: create fixture trails once, tear them down after all suites
// ---------------------------------------------------------------------------
let trailIds: number[] = []

beforeAll(async () => {
  const [publicId, hiddenId, adminOnlyId, userRestrId] = await Promise.all([
    createTrail({ name: T.public,    restriction: 'public',     hidden: false }),
    createTrail({ name: T.hidden,    restriction: 'public',     hidden: true  }),
    createTrail({ name: T.adminOnly, restriction: 'admin_only', hidden: false }),
    createTrail({ name: T.userRestr, restriction: 'user',       hidden: false }),
  ])
  trailIds = [publicId, hiddenId, adminOnlyId, userRestrId]

  // Attribute the user-restricted trail to the regular seed user
  const regularUserId = await profileIdByName('Test User')
  const { error } = await serviceClient
    .from('trail_attribution')
    .insert({ trail_id: userRestrId, profile_id: regularUserId })
  if (error) throw new Error(`trail_attribution insert failed: ${error.message}`)
})

afterAll(async () => {
  await deleteTrails(...trailIds)
})

// ---------------------------------------------------------------------------
// Anon caller
// ---------------------------------------------------------------------------
describe('get_trails() — anon caller', () => {
  const anonClient = createClient<Database>(url, anonKey)

  it('returns public trails', async () => {
    const names = await trailNames(anonClient)
    expect(names).toContain(T.public)
  })

  it('does NOT return hidden trails by default', async () => {
    const names = await trailNames(anonClient)
    expect(names).not.toContain(T.hidden)
  })

  it('does NOT return admin_only trails', async () => {
    const names = await trailNames(anonClient)
    expect(names).not.toContain(T.adminOnly)
  })

  it('does NOT return user-restricted trails', async () => {
    const names = await trailNames(anonClient)
    expect(names).not.toContain(T.userRestr)
  })

  it('hidden=true arg does NOT expose hidden trails to anon', async () => {
    // hidden arg controls the WHERE filter in the function, but RLS still
    // only allows 'public' trails — so passing hidden=true only surfaces
    // public+hidden rows, not admin_only or user ones.
    const names = await trailNames(anonClient, { hidden: true })
    expect(names).toContain(T.public)
    expect(names).toContain(T.hidden)       // public restriction, just hidden=true
    expect(names).not.toContain(T.adminOnly)
    expect(names).not.toContain(T.userRestr)
  })
})

// ---------------------------------------------------------------------------
// Regular authenticated user (non-admin, attributed to userRestr trail)
// ---------------------------------------------------------------------------
describe('get_trails() — regular user (user@test.com)', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>

  beforeAll(async () => {
    client = await signedInClient('user@test.com', 'password123')
  })

  it('returns public trails', async () => {
    const names = await trailNames(client)
    expect(names).toContain(T.public)
  })

  it('does NOT return hidden trails by default', async () => {
    const names = await trailNames(client)
    expect(names).not.toContain(T.hidden)
  })

  it('does NOT return admin_only trails', async () => {
    const names = await trailNames(client)
    expect(names).not.toContain(T.adminOnly)
  })

  it('returns the user-restricted trail they are attributed to', async () => {
    const names = await trailNames(client)
    expect(names).toContain(T.userRestr)
  })

  it('hidden=true exposes hidden public trails', async () => {
    const names = await trailNames(client, { hidden: true })
    expect(names).toContain(T.hidden)
  })

  it('hidden=true still does NOT expose admin_only trails', async () => {
    const names = await trailNames(client, { hidden: true })
    expect(names).not.toContain(T.adminOnly)
  })
})

// ---------------------------------------------------------------------------
// Regular user who is NOT attributed to the user-restricted trail
// ---------------------------------------------------------------------------
describe('get_trails() — non-attributed user (admin@test.com acting as non-attributed)', () => {
  // We need a second non-admin, non-attributed user.  Rather than a new seed
  // user, we create a temporary auth user + profile for this suite only.
  let client: Awaited<ReturnType<typeof signedInClient>>
  let tempAuthUserId: string
  let tempProfileId: number

  beforeAll(async () => {
    // Create temp auth user
    const { data: authData, error: authErr } = await serviceClient.auth.admin.createUser({
      email: 'nonattributed@test.com',
      password: 'password123',
      email_confirm: true,
    })
    if (authErr) throw new Error(`createUser failed: ${authErr.message}`)
    tempAuthUserId = authData.user.id

    // Create profile (triggers default permissions row)
    const { data: profileData, error: profileErr } = await serviceClient
      .from('profiles')
      .insert({ auth_user_id: tempAuthUserId, name: `${PREFIX}non_attributed_user`, user_type: 'member' })
      .select('id')
      .single()
    if (profileErr) throw new Error(`profile insert failed: ${profileErr.message}`)
    tempProfileId = profileData.id

    client = await signedInClient('nonattributed@test.com', 'password123')
  })

  afterAll(async () => {
    // Clean up profile (cascade deletes permissions), then auth user
    await serviceClient.from('profiles').delete().eq('id', tempProfileId)
    await serviceClient.auth.admin.deleteUser(tempAuthUserId)
  })

  it('can see public trails', async () => {
    const names = await trailNames(client)
    expect(names).toContain(T.public)
  })

  it('cannot see the user-restricted trail they are NOT attributed to', async () => {
    const names = await trailNames(client)
    expect(names).not.toContain(T.userRestr)
  })

  it('cannot see admin_only trails', async () => {
    const names = await trailNames(client)
    expect(names).not.toContain(T.adminOnly)
  })
})

// ---------------------------------------------------------------------------
// Admin user
// ---------------------------------------------------------------------------
describe('get_trails() — admin user (admin@test.com)', () => {
  let client: Awaited<ReturnType<typeof signedInClient>>

  beforeAll(async () => {
    client = await signedInClient('admin@test.com', 'password123')
  })

  it('returns public trails', async () => {
    const names = await trailNames(client)
    expect(names).toContain(T.public)
  })

  it('returns admin_only trails', async () => {
    const names = await trailNames(client)
    expect(names).toContain(T.adminOnly)
  })

  it('returns user-restricted trails', async () => {
    const names = await trailNames(client)
    expect(names).toContain(T.userRestr)
  })

  it('does NOT return hidden trails by default', async () => {
    const names = await trailNames(client)
    expect(names).not.toContain(T.hidden)
  })

  it('hidden=true returns hidden public trails', async () => {
    const names = await trailNames(client, { hidden: true })
    expect(names).toContain(T.hidden)
  })

  it('hidden=true also returns hidden admin_only trails', async () => {
    // Create a hidden admin_only trail just for this check
    const hiddenAdminId = await createTrail({
      name: `${PREFIX}hidden_admin_only`,
      restriction: 'admin_only',
      hidden: true,
    })
    try {
      const names = await trailNames(client, { hidden: true })
      expect(names).toContain(`${PREFIX}hidden_admin_only`)
    } finally {
      await deleteTrails(hiddenAdminId)
    }
  })
})

// ---------------------------------------------------------------------------
// Geometry shape
// ---------------------------------------------------------------------------
describe('get_trails() — geometry output', () => {
  it('returns geometry as a GeoJSON LineString object', async () => {
    const { data, error } = await serviceClient.rpc('get_trails')
    expect(error).toBeNull()
    const trail = (data ?? []).find(t => t.name === T.public)
    expect(trail).toBeDefined()
    const geom = trail!.geometry as { type: string; coordinates: number[][] }
    expect(geom.type).toBe('LineString')
    expect(Array.isArray(geom.coordinates)).toBe(true)
    expect(geom.coordinates.length).toBeGreaterThanOrEqual(2)
  })
})
