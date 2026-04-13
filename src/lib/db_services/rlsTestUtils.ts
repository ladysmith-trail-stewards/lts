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
 *     expected: {
 *       anon:       { c: false, r: true,  u: false, s: false, h: false },
 *       superAdmin: { c: true,  r: true,  u: true,  s: false, h: true  },
 *     },
 *   });
 *
 * Omit an operation key (c/r/u/s/h) to skip that test for the role.
 * Omit a role from `expected` entirely to skip all tests for that role.
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
 * Per-role expected outcomes for each CRUSH operation.
 * Omit a key to skip that operation's test entirely.
 */
export type CrushExpected = {
  c?: boolean | null;
  r?: boolean | null;
  u?: boolean | null;
  s?: boolean | null;
  h?: boolean | null;
};

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dynClient(client: RlsClient): any {
  return client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dynServiceClient(): any {
  return serviceClient;
}

function rowCount(data: unknown): number {
  return Array.isArray(data) ? data.length : 0;
}

// ---------------------------------------------------------------------------
// tableRlsSuite — CRUSH tests for a table
// ---------------------------------------------------------------------------

export interface TableRlsOptions {
  suite: () => BuiltTestSuite;

  /** Target table name. */
  table: string;

  insertData: () => Record<string, unknown>;

  /** UPDATE payload for the U test. */
  updateData: Record<string, unknown>;

  /**
   * Per-role CRUSH expectations. Omit a key to skip that operation.
   * Omit a role entirely to skip all its tests.
   */
  expected: Partial<Record<RoleName, CrushExpected>>;

  /**
   * Optional pre-existing row id shared across all roles.
   * When supplied the utility skips per-role fixture creation.
   */
  rowId?: () => number;
}

export function tableRlsSuite(opts: TableRlsOptions): void {
  for (const roleConfig of ALL_ROLES) {
    const exp = opts.expected[roleConfig.key];
    if (exp === undefined) continue;

    const cExp = exp.c;
    const rExp = exp.r;
    const uExp = exp.u;
    const sExp = exp.s;
    const hExp = exp.h;

    describe(`${opts.table} CRUSH — ${roleConfig.label}`, () => {
      let client: RlsClient;
      let fixtureId: number;
      let ownsFixture = false;

      const extraCreatedIds: number[] = [];

      beforeAll(async () => {
        const suite = opts.suite();
        client = await roleConfig.getClient(suite);

        if (opts.rowId) {
          fixtureId = opts.rowId();
          ownsFixture = false;
        } else {
          const { data: row, error } = await dynServiceClient()
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
          await dynServiceClient().from(opts.table).delete().eq('id', id);
        }
        if (ownsFixture) {
          await dynServiceClient()
            .from(opts.table)
            .delete()
            .eq('id', fixtureId);
        }
      });

      // ── C — Create ────────────────────────────────────────────────────────
      if (cExp != null) {
        it('C — create', async () => {
          const { data, error } = await dynClient(client)
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
      if (rExp != null) {
        it('R — read', async () => {
          const { data } = await dynClient(client)
            .from(opts.table)
            .select('id')
            .eq('id', fixtureId);

          const count = rowCount(data);
          if (rExp) {
            expect(count, 'R: expected row to be visible').toBeGreaterThan(0);
          } else {
            expect(count, 'R: expected row to be hidden').toBe(0);
          }
        });
      }

      // ── U — Update ────────────────────────────────────────────────────────
      if (uExp != null) {
        const firstKey = Object.keys(opts.updateData)[0];
        if (!firstKey) {
          throw new Error(
            `tableRlsSuite: updateData must contain at least one field for U tests (table: ${opts.table})`
          );
        }

        it('U — update', async () => {
          await dynClient(client)
            .from(opts.table)
            .update(opts.updateData)
            .eq('id', fixtureId);

          const { data: row } = await dynServiceClient()
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
      if (sExp != null) {
        it('S — soft delete + re-read', async () => {
          const { error } = await dynClient(client)
            .from(opts.table)
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', fixtureId);

          const { data: svcRow } = await dynServiceClient()
            .from(opts.table)
            .select('deleted_at')
            .eq('id', fixtureId)
            .single();

          const deletedAt = (svcRow as { deleted_at: string | null } | null)
            ?.deleted_at;

          const { data: reReadData } = await dynClient(client)
            .from(opts.table)
            .select('id')
            .eq('id', fixtureId);

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
            if (rExp) {
              expect(
                rowCount(reReadData),
                'S: row should still be visible after failed soft-delete'
              ).toBeGreaterThan(0);
            }
          }
        });
      }

      // ── H — Hard Delete ───────────────────────────────────────────────────
      if (hExp != null) {
        it('H — hard delete', async () => {
          await dynClient(client).from(opts.table).delete().eq('id', fixtureId);

          const { data: row } = await dynServiceClient()
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
  suite: () => BuiltTestSuite;

  /** View name (used as the Supabase `.from()` target). */
  view: string;

  /**
   * Optional label for the `describe` block title.
   * Useful when testing the same view with different fixture rows.
   */
  label?: string;

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
        const { data } = await dynClient(client)
          .from(opts.view)
          .select('id')
          .eq('id', id);

        const count = rowCount(data);
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
  suite: () => BuiltTestSuite;

  /** RPC function name. */
  rpc: string;

  /** Thunk returning the RPC parameters. Omit for RPCs with no parameters. */
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
