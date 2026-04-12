/**
 * RLS test utilities — generic helpers for exercising Row-Level Security
 * across all six security levels (anon + five profile roles).
 *
 * Three utilities are exported:
 *
 *  tableRlsSuite  – registers CRUSH tests (Create / Read / Update /
 *                   Soft-delete / Hard-delete) for a table.
 *  viewRlsSuite   – registers read-visibility tests for a view.
 *  rpcRlsSuite    – registers call-success tests for an RPC.
 *
 * Each utility accepts a `suite` thunk (lazily resolved after the caller's
 * `beforeAll`) and registers `describe`/`it` blocks via Vitest's API.
 *
 * Usage example:
 *
 *   const P = '__my_rls_test__';
 *   let suite: BuiltTestSuite;
 *
 *   beforeAll(async () => {
 *     suite = await new TestSuite(P).createRegion('main').createAllUsers().build();
 *   });
 *   afterAll(async () => { await suite.teardown(); });
 *
 *   tableRlsSuite({
 *     suite: () => suite,
 *     table: 'trails',
 *     insertData: () => ({ name: `${P}t`, type: 'trail', ... }),
 *     updateData: { description: 'updated' },
 *     softDeleteFn: (client, id) => client.rpc('soft_delete_trails', { ids: [id] })
 *       .then(({ error }) => ({ error: error ? new Error(error.message) : null })),
 *     expected: {
 *       anon:       [false, true,  false, false, false],
 *       superAdmin: [true,  true,  true,  true,  true ],
 *     },
 *   });
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  anonClient,
  serviceClient,
  signedInClient,
} from './supabaseTestClients';
import type { BuiltTestSuite } from './testSuite';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The six security levels tested by every utility. */
export type RoleName =
  | 'anon'
  | 'pending'
  | 'user'
  | 'superUser'
  | 'admin'
  | 'superAdmin';

/**
 * CRUSH tuple — per-role expected success flags:
 *   [Create, Read, Update, SoftDelete, HardDelete]
 */
export type CrushTuple = [boolean, boolean, boolean, boolean, boolean];

/** Skip individual CRUSH operations for a given role. */
export type CrushBypass = Partial<Record<'C' | 'R' | 'U' | 'S' | 'H', boolean>>;

export type RlsClient = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Shared role registry
// ---------------------------------------------------------------------------

interface RoleConfig {
  label: string;
  key: RoleName;
  getClient: (suite: BuiltTestSuite) => Promise<RlsClient>;
}

const ALL_ROLES: RoleConfig[] = [
  {
    label: 'anon',
    key: 'anon',
    getClient: () => Promise.resolve(anonClient as RlsClient),
  },
  {
    label: 'pending',
    key: 'pending',
    getClient: (s) => signedInClient(s.pending.email, s.pending.password),
  },
  {
    label: 'user',
    key: 'user',
    getClient: (s) => signedInClient(s.user.email, s.user.password),
  },
  {
    label: 'super_user',
    key: 'superUser',
    getClient: (s) => signedInClient(s.superUser.email, s.superUser.password),
  },
  {
    label: 'admin',
    key: 'admin',
    getClient: (s) => signedInClient(s.admin.email, s.admin.password),
  },
  {
    label: 'super_admin',
    key: 'superAdmin',
    getClient: (s) => signedInClient(s.superAdmin.email, s.superAdmin.password),
  },
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Casts a client to `any` to allow dynamic table/view names. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dyn(client: RlsClient): any {
  return client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dynSvc(): any {
  return serviceClient;
}

// ---------------------------------------------------------------------------
// tableRlsSuite — CRUSH tests for a table
// ---------------------------------------------------------------------------

export interface TableRlsOptions {
  /**
   * Thunk returning the current BuiltTestSuite.
   * Accessed inside `it()` callbacks — safe after the caller's `beforeAll`.
   */
  suite: () => BuiltTestSuite;

  /** Target table name. */
  table: string;

  /**
   * Thunk returning the INSERT payload for both the C test and fixture rows.
   * Called inside `it()` callbacks — safe to reference `suite.regionId` etc.
   */
  insertData: () => Record<string, unknown>;

  /** UPDATE payload for the U test. */
  updateData: Record<string, unknown>;

  /**
   * Performs a soft-delete (sets `deleted_at`) for a single row.
   * Receives the test client and the fixture row id.
   */
  softDeleteFn: (
    client: RlsClient,
    id: number
  ) => Promise<{ error: Error | null }>;

  /**
   * Per-role CRUSH expectations — [Create, Read, Update, SoftDelete, HardDelete].
   * Omit a role to skip all its tests.
   */
  expected: Partial<Record<RoleName, CrushTuple>>;

  /**
   * Per-role, per-operation bypass flags.
   * When `true` the corresponding `it()` block is omitted entirely.
   * Useful for operations with complex prerequisites (e.g. geometry creation).
   */
  bypass?: Partial<Record<RoleName, CrushBypass>>;

  /**
   * Optional pre-existing row id shared across all roles.
   * When supplied the utility skips per-role fixture creation and uses this
   * row instead.  Use only when the row is immutable across the test run, or
   * when C is bypassed for every role — otherwise role tests will interfere
   * with each other via shared state.
   */
  rowId?: () => number;
}

export function tableRlsSuite(opts: TableRlsOptions): void {
  for (const roleConfig of ALL_ROLES) {
    const exp = opts.expected[roleConfig.key];
    if (exp === undefined) continue;

    const bypass = opts.bypass?.[roleConfig.key] ?? {};
    const [cExp, rExp, uExp, sExp, hExp] = exp;

    describe(`${opts.table} CRUSH — ${roleConfig.label}`, () => {
      let client: RlsClient;
      let fixtureId: number;
      let ownsFixture = false;

      /** Rows created by the C test that need separate cleanup. */
      const extraCreatedIds: number[] = [];

      beforeAll(async () => {
        const suite = opts.suite();
        client = await roleConfig.getClient(suite);

        if (opts.rowId) {
          // Use the caller-provided row — no fixture creation needed.
          fixtureId = opts.rowId();
          ownsFixture = false;
        } else {
          // Create a dedicated fixture row via service_role.
          const { data: row, error } = await dynSvc()
            .from(opts.table)
            .insert(opts.insertData())
            .select('id')
            .single();
          if (error) {
            throw new Error(
              `tableRlsSuite: fixture create failed (${opts.table}): ${error.message}`
            );
          }
          fixtureId = (row as { id: number }).id;
          ownsFixture = true;
        }
      });

      afterAll(async () => {
        for (const id of extraCreatedIds) {
          await dynSvc().from(opts.table).delete().eq('id', id);
        }
        if (ownsFixture) {
          await dynSvc().from(opts.table).delete().eq('id', fixtureId);
        }
      });

      // ── C — Create ────────────────────────────────────────────────────────
      if (!bypass.C) {
        it('C — create', async () => {
          const { data, error } = await dyn(client)
            .from(opts.table)
            .insert(opts.insertData())
            .select('id')
            .maybeSingle();

          if (cExp) {
            expect(error, 'C: expected create to succeed').toBeNull();
            const id = (data as { id: number } | null)?.id;
            if (id != null) extraCreatedIds.push(id);
          } else {
            expect(error, 'C: expected create to be denied').not.toBeNull();
          }
        });
      }

      // ── R — Read ──────────────────────────────────────────────────────────
      if (!bypass.R) {
        it('R — read', async () => {
          const { data } = await dyn(client)
            .from(opts.table)
            .select('id')
            .eq('id', fixtureId);

          const count = ((data as unknown[]) ?? []).length;
          if (rExp) {
            expect(count, 'R: expected row to be visible').toBeGreaterThan(0);
          } else {
            expect(count, 'R: expected row to be hidden').toBe(0);
          }
        });
      }

      // ── U — Update ────────────────────────────────────────────────────────
      if (!bypass.U) {
        it('U — update', async () => {
          await dyn(client)
            .from(opts.table)
            .update(opts.updateData)
            .eq('id', fixtureId);

          // Confirm via service_role whether the update took effect.
          const firstKey = Object.keys(opts.updateData)[0];
          if (!firstKey) return;

          const { data: row } = await dynSvc()
            .from(opts.table)
            .select(firstKey)
            .eq('id', fixtureId)
            .single();

          const current = (row as Record<string, unknown> | null)?.[firstKey];

          if (uExp) {
            expect(current, 'U: expected update to persist').toEqual(
              opts.updateData[firstKey]
            );
          } else {
            expect(current, 'U: expected row to remain unchanged').not.toEqual(
              opts.updateData[firstKey]
            );
          }
        });
      }

      // ── S — Soft Delete + re-read ─────────────────────────────────────────
      if (!bypass.S) {
        it('S — soft delete + re-read', async () => {
          const { error } = await opts.softDeleteFn(client, fixtureId);

          const { data: row } = await dynSvc()
            .from(opts.table)
            .select('deleted_at')
            .eq('id', fixtureId)
            .single();

          const deletedAt = (row as { deleted_at: string | null } | null)
            ?.deleted_at;

          if (sExp) {
            expect(error, 'S: expected soft delete to succeed').toBeNull();
            expect(
              deletedAt,
              'S: expected deleted_at to be set'
            ).not.toBeNull();
          } else {
            expect(
              error,
              'S: expected soft delete to be denied'
            ).not.toBeNull();
            expect(
              deletedAt,
              'S: expected deleted_at to remain null'
            ).toBeNull();
          }
        });
      }

      // ── H — Hard Delete ───────────────────────────────────────────────────
      if (!bypass.H) {
        it('H — hard delete', async () => {
          await dyn(client).from(opts.table).delete().eq('id', fixtureId);

          const { data: row } = await dynSvc()
            .from(opts.table)
            .select('id')
            .eq('id', fixtureId)
            .maybeSingle();

          if (hExp) {
            expect(row, 'H: expected row to be permanently deleted').toBeNull();
          } else {
            expect(
              row,
              'H: expected row to survive hard-delete attempt'
            ).not.toBeNull();
          }
        });
      }
    });
  }
}

// ---------------------------------------------------------------------------
// viewRlsSuite — read-visibility test for a view
// ---------------------------------------------------------------------------

export interface ViewRlsOptions {
  /** Thunk returning the current BuiltTestSuite. */
  suite: () => BuiltTestSuite;

  /** View name (used as the Supabase `.from()` target). */
  view: string;

  /**
   * Optional label for the `describe` block title.
   * Defaults to `view` when omitted.
   * Useful when testing the same view with different fixture rows
   * (e.g. a public row vs a soft-deleted row).
   */
  label?: string;

  /** Thunk returning the id of a known row to check visibility for. */
  rowId: () => number;

  /** Per-role: `true` = expect row visible, `false` = expect row hidden. */
  expected: Partial<Record<RoleName, boolean>>;
}

export function viewRlsSuite(opts: ViewRlsOptions): void {
  const prefix = opts.label ?? opts.view;
  for (const roleConfig of ALL_ROLES) {
    const expected = opts.expected[roleConfig.key];
    if (expected === undefined) continue;

    describe(`${prefix} — ${roleConfig.label}`, () => {
      let client: RlsClient;

      beforeAll(async () => {
        const suite = opts.suite();
        client = await roleConfig.getClient(suite);
      });

      it(`R — read (expect: ${expected ? 'visible' : 'hidden'})`, async () => {
        const id = opts.rowId();
        const { data } = await dyn(client)
          .from(opts.view)
          .select('id')
          .eq('id', id);

        const count = ((data as unknown[]) ?? []).length;
        if (expected) {
          expect(count, 'R: expected row to be visible').toBeGreaterThan(0);
        } else {
          expect(count, 'R: expected row to be hidden').toBe(0);
        }
      });
    });
  }
}

// ---------------------------------------------------------------------------
// rpcRlsSuite — call-success test for an RPC
// ---------------------------------------------------------------------------

export interface RpcRlsOptions {
  /** Thunk returning the current BuiltTestSuite. */
  suite: () => BuiltTestSuite;

  /** RPC function name. */
  rpc: string;

  /**
   * Thunk returning the RPC parameters (called inside `it()` after beforeAll).
   * Omit for RPCs with no parameters.
   */
  params?: () => Record<string, unknown>;

  /** Per-role: `true` = expect no error, `false` = expect an error. */
  expected: Partial<Record<RoleName, boolean>>;
}

export function rpcRlsSuite(opts: RpcRlsOptions): void {
  for (const roleConfig of ALL_ROLES) {
    const expected = opts.expected[roleConfig.key];
    if (expected === undefined) continue;

    describe(`${opts.rpc} RPC — ${roleConfig.label}`, () => {
      let client: RlsClient;

      beforeAll(async () => {
        const suite = opts.suite();
        client = await roleConfig.getClient(suite);
      });

      it(
        expected ? 'call succeeds (no error)' : 'call is denied (error)',
        async () => {
          const params = opts.params?.() ?? {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (client.rpc as any)(opts.rpc, params);

          if (expected) {
            expect(error, `RPC ${opts.rpc}: expected success`).toBeNull();
          } else {
            expect(error, `RPC ${opts.rpc}: expected denial`).not.toBeNull();
          }
        }
      );
    });
  }
}
