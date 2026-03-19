import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/**
 * Seed verification tests — requires:
 *   1. `supabase start` (Docker running)
 *   2. `supabase db reset` (migrations + seed applied)
 */

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string

// Use the secret key so RLS doesn't block us during verification
const SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SECRET_KEY as string

describe('Seed data verification', () => {
  const client = createClient<Database>(url, SERVICE_ROLE_KEY ?? anonKey)

  type ProfileWithPermissions = {
    name: string
    user_type: string
    permissions: {
      can_read: boolean
      can_write: boolean
      can_delete: boolean
      is_admin: boolean
    } | null
  }

  let profiles: ProfileWithPermissions[]

  beforeAll(async () => {
    const { data, error } = await client
      .from('profiles')
      .select('name, user_type, permissions(can_read, can_write, can_delete, is_admin)')
      .order('name')

    expect(error, `Failed to fetch profiles: ${error?.message}`).toBeNull()
    profiles = (data ?? []) as ProfileWithPermissions[]
  })

  it('has exactly 2 seed profiles', () => {
    expect(profiles).toHaveLength(2)
  })

  describe('Test User (user@test.com)', () => {
    let user: ProfileWithPermissions

    beforeAll(() => {
      user = profiles.find(p => p.name === 'Test User')!
    })

    it('exists', () => {
      expect(user, 'Test User profile not found').toBeDefined()
    })

    it('has user_type "member"', () => {
      expect(user.user_type).toBe('member')
    })

    it('has read permission only', () => {
      expect(user.permissions?.can_read).toBe(true)
      expect(user.permissions?.can_write).toBe(false)
      expect(user.permissions?.can_delete).toBe(false)
      expect(user.permissions?.is_admin).toBe(false)
    })
  })

  describe('Admin User (admin@test.com)', () => {
    let admin: ProfileWithPermissions

    beforeAll(() => {
      admin = profiles.find(p => p.name === 'Admin User')!
    })

    it('exists', () => {
      expect(admin, 'Admin User profile not found').toBeDefined()
    })

    it('has user_type "admin"', () => {
      expect(admin.user_type).toBe('admin')
    })

    it('has all permissions including is_admin', () => {
      expect(admin.permissions?.can_read).toBe(true)
      expect(admin.permissions?.can_write).toBe(true)
      expect(admin.permissions?.can_delete).toBe(true)
      expect(admin.permissions?.is_admin).toBe(true)
    })
  })

  describe('Auth users', () => {
    it('test user can sign in', async () => {
      const authClient = createClient<Database>(url, anonKey)
      const { data, error } = await authClient.auth.signInWithPassword({
        email: 'user@test.com',
        password: 'password123',
      })
      expect(error, `Sign-in failed: ${error?.message}`).toBeNull()
      expect(data.user?.email).toBe('user@test.com')
      await authClient.auth.signOut()
    })

    it('admin user can sign in', async () => {
      const authClient = createClient<Database>(url, anonKey)
      const { data, error } = await authClient.auth.signInWithPassword({
        email: 'admin@test.com',
        password: 'password123',
      })
      expect(error, `Sign-in failed: ${error?.message}`).toBeNull()
      expect(data.user?.email).toBe('admin@test.com')
      await authClient.auth.signOut()
    })
  })
})
