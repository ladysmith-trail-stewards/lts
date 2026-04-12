/**
 * Fluent test-suite fixture builder.
 *
 * Usage:
 *
 *   // Minimal — just a region:
 *   const suite = await new TestSuite('my_tag')
 *     .createRegion('My Region')
 *     .build();
 *
 *   // With a bbox:
 *   const suite = await new TestSuite('my_tag')
 *     .createRegion('Bounded', [-124.05, 48.98, -123.95, 49.05])
 *     .build();
 *
 *   // Only the users you need:
 *   const suite = await new TestSuite('my_tag')
 *     .createRegion('My Region')
 *     .createUser([
 *       { name: 'alice', role: 'user',       regionName: 'My Region' },
 *       { name: 'bob',   role: 'super_admin', regionName: 'My Region' },
 *     ])
 *     .build();
 *
 *   // All five standard roles at once:
 *   const suite = await new TestSuite('my_tag')
 *     .createRegion('My Region')
 *     .createAllUsers()   // user, admin, super_user, super_admin, pending
 *     .build();
 *
 *   // Access results:
 *   const { regions, users } = suite.get();
 *   suite.regionId          // first region's id
 *   suite.user              // FixtureUserCredentials for role 'user'
 *   suite.admin             // … 'admin'
 *   suite.superUser         // … 'super_user'
 *   suite.superAdmin        // … 'super_admin'
 *   suite.pending           // … 'pending' (google provider)
 *
 *   // Teardown:
 *   await suite.teardown();
 *
 * All fixture names are automatically prefixed with `i_test_<tag>_` so they
 * are collision-free across parallel suites and swept up by purgeAllTestFixtures.
 */

import { serviceClient } from './supabaseTestClients';
import type { Database } from '../supabase/database.types';
import {
  fixtureCreateUser,
  fixtureDeleteUser,
  type FixtureUserCredentials,
} from './profiles/testHelpers';

type AppRole = Database['public']['Enums']['app_role'];

// ---------------------------------------------------------------------------
// Default auth-user config
// ---------------------------------------------------------------------------

export const defaultUser = {
  password: 'fixture-password-123',
  emailDomain: '@test-fixture.invalid',
  emailConfirm: true,
} as const;

// ---------------------------------------------------------------------------
// Public result types
// ---------------------------------------------------------------------------

export interface SuiteRegion {
  id: number;
  name: string;
  /** [minLng, minLat, maxLng, maxLat] – undefined when no bbox was set. */
  bbox?: [number, number, number, number];
}

export interface SuiteUser extends FixtureUserCredentials {
  regionId: number;
}

export interface SuiteResult {
  regions: SuiteRegion[];
  users: SuiteUser[];
}

// ---------------------------------------------------------------------------
// Builder step types
// ---------------------------------------------------------------------------

interface RegionSpec {
  name: string;
  bbox?: [number, number, number, number];
}

interface UserSpec {
  name: string;
  role: AppRole;
  /** Must match a name passed to .createRegion(). Defaults to the first region. */
  regionName?: string;
  /** Provider metadata for raw_app_meta_data (e.g. 'google' to simulate SSO). */
  provider?: string;
}

// The five standard roles created by createAllUsers(), in a fixed name order.
const ALL_USER_ROLES: Array<{
  name: string;
  role: AppRole;
  provider?: string;
}> = [
  { name: 'user', role: 'user' },
  { name: 'admin', role: 'admin' },
  { name: 'super_user', role: 'super_user' },
  { name: 'super_admin', role: 'super_admin' },
  { name: 'pending', role: 'pending', provider: 'google' },
];

// ---------------------------------------------------------------------------
// TestSuite class
// ---------------------------------------------------------------------------

export class TestSuite {
  private readonly safeTag: string;
  private readonly regionSpecs: RegionSpec[] = [];
  private readonly userSpecs: UserSpec[] = [];

  constructor(tag: string) {
    this.safeTag = tag.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  }

  /**
   * Queues a region to be created.
   * @param name  Human-readable name (auto-prefixed with `i_test_<tag>_`).
   * @param bbox  Optional bounding box as [minLng, minLat, maxLng, maxLat].
   */
  createRegion(name: string, bbox?: [number, number, number, number]): this {
    this.regionSpecs.push({ name, bbox });
    return this;
  }

  /**
   * Queues one or more specific users to be created.
   * `regionName` must match a name passed to `.createRegion()`; defaults to
   * the first region.
   */
  createUser(users: UserSpec[]): this {
    this.userSpecs.push(...users);
    return this;
  }

  /**
   * Queues all five standard role-users (user, admin, super_user, super_admin,
   * pending) in the first (or named) region. Equivalent to calling
   * `.createUser([...])` with all five roles.
   */
  createAllUsers(regionName?: string): this {
    this.userSpecs.push(...ALL_USER_ROLES.map((u) => ({ ...u, regionName })));
    return this;
  }

  /** Executes all queued operations and returns a {@link BuiltTestSuite}. */
  async build(): Promise<BuiltTestSuite> {
    if (this.regionSpecs.length === 0) {
      throw new Error('TestSuite: call .createRegion() before .build()');
    }

    // ---- Regions -----------------------------------------------------------
    const regions: SuiteRegion[] = [];

    for (const spec of this.regionSpecs) {
      const prefixedName = `i_test_${this.safeTag}_${spec.name
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()}`;

      const { data: row, error: insertErr } = await serviceClient
        .from('regions')
        .insert({ name: prefixedName })
        .select('id')
        .single();

      if (insertErr) {
        throw new Error(
          `TestSuite.build (region "${spec.name}"): ${insertErr.message}`
        );
      }

      if (spec.bbox) {
        const [minLng, minLat, maxLng, maxLat] = spec.bbox;
        // `any` cast until `pnpm db:types` picks up set_region_bbox.
        // serviceClient runs as service_role and bypasses RLS.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: bboxErr } = await (serviceClient.rpc as any)(
          'set_region_bbox',
          {
            p_region_id: row.id,
            p_min_lng: minLng,
            p_min_lat: minLat,
            p_max_lng: maxLng,
            p_max_lat: maxLat,
          }
        );
        if (bboxErr) {
          throw new Error(
            `TestSuite.build: could not set bbox for region "${spec.name}": ${(bboxErr as { message: string }).message}`
          );
        }
      }

      regions.push({ id: row.id, name: prefixedName, bbox: spec.bbox });
    }

    // Lookup by caller-supplied name (before prefix) for user → region mapping.
    const regionByName = new Map<string, SuiteRegion>(
      this.regionSpecs.map((spec, i) => [spec.name, regions[i]])
    );
    const defaultRegion = regions[0];

    // ---- Users -------------------------------------------------------------
    const users: SuiteUser[] = [];

    await Promise.all(
      this.userSpecs.map(async (spec) => {
        const region =
          spec.regionName !== undefined
            ? regionByName.get(spec.regionName)
            : defaultRegion;

        if (!region) {
          throw new Error(
            `TestSuite.build: user "${spec.name}" references unknown region "${spec.regionName}".`
          );
        }

        const prefixedName = `i_test_${this.safeTag}_${spec.name
          .replace(/[^a-z0-9]/gi, '_')
          .toLowerCase()}`;

        const creds = await fixtureCreateUser({
          name: prefixedName,
          role: spec.role,
          region_id: region.id,
          provider: spec.provider,
        });

        users.push({ ...creds, regionId: region.id });
      })
    );

    return new BuiltTestSuite({ regions, users });
  }
}

// ---------------------------------------------------------------------------
// BuiltTestSuite — returned by .build()
// ---------------------------------------------------------------------------

export class BuiltTestSuite {
  private readonly result: SuiteResult;

  constructor(result: SuiteResult) {
    this.result = result;
  }

  /** Returns all fixture data created by this suite. */
  get(): SuiteResult {
    return this.result;
  }

  // ---- Convenience accessors (mirror the old SuiteFixtures shape) ----------

  /** ID of the first region created. */
  get regionId(): number {
    return this.result.regions[0].id;
  }

  private _userByRole(role: AppRole): SuiteUser {
    const u = this.result.users.find((u) => u.role === role);
    if (!u)
      throw new Error(
        `TestSuite: no user with role "${role}" was created. Add .createUser() or .createAllUsers().`
      );
    return u;
  }

  get user(): SuiteUser {
    return this._userByRole('user');
  }
  get admin(): SuiteUser {
    return this._userByRole('admin');
  }
  get superUser(): SuiteUser {
    return this._userByRole('super_user');
  }
  get superAdmin(): SuiteUser {
    return this._userByRole('super_admin');
  }
  get pending(): SuiteUser {
    return this._userByRole('pending');
  }

  // ---- Teardown ------------------------------------------------------------

  /** Deletes all users and regions created by this suite. */
  async teardown(): Promise<void> {
    await Promise.all(this.result.users.map((u) => fixtureDeleteUser(u)));
    for (const region of this.result.regions) {
      await serviceClient.from('regions').delete().eq('id', region.id);
    }
  }
}
