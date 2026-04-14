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
 *   const P = '__my_rls_test__';
 *   let suite: BuiltTestSuite;
 *   beforeAll(async () => {
 *     suite = await new TestSuite(P).createRegion('main').createAllUsers().build();
 *   });
 *   afterAll(async () => { await suite.teardown(); });
 *   tableRlsSuite({
 *     suite: () => suite,
 *     table: 'trails',
 *     insertData: () => ({ name: `${P}t`, type: 'trail', ... }),
 *     updateData: { description: 'updated' },
 *     expected: {
 *       anon:       { c: false, r: true,  u: false, s: false, h: false },
 *       superAdmin: { c: true,  r: true,  u: true,  s: false  },
 *     },
 *   });
 *
 * Omit an operation key (c/r/u/s/h) to skip that test for the role.
 * Omit a role from `expected` entirely to skip all tests for that role.
 *
 * Table/View constraints:
 *  - RlsTable  — tables with `id: number` and `deleted_at: string | null`
 *  - SoftTable — subset of RlsTable; tables where soft-delete (S) is testable
 *  - RlsView   — views with `id: number | null` (PostgREST makes view PKs nullable)
 *  - Internal PostGIS system tables/views (spatial_ref_sys, geography_columns,
 *    geometry_columns) are excluded via Omit.
 *
 * Hard-delete + cascades:
 *  If a table has child rows with `ON DELETE CASCADE`, Postgres executes the
 *  cascade as a constraint operation — RLS on the child table is NOT checked.
 *  Children with `ON DELETE RESTRICT` / `NO ACTION` will cause the DELETE to
 *  fail with a FK violation regardless of who is deleting.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  anonClient,
  serviceClient,
  signedInClient,
} from './supabaseTestClients';
import type { BuiltTestSuite } from './testSuite';
import type { Database } from '../supabase/database.types';

// ---------------------------------------------------------------------------
// Table / View name types
// ---------------------------------------------------------------------------

type AllTables = keyof Database['public']['Tables'];
type AllViews = keyof Database['public']['Views'];

/** PostGIS system tables we never test. */
type ExcludedTables = 'spatial_ref_sys';

/** PostGIS system views we never test. */
type ExcludedViews = 'geography_columns' | 'geometry_columns';

/** Tables that have `id: number` and `deleted_at: string | null` — eligible for full CRUSH tests. */
export type RlsTable = Exclude<
  {
    [T in AllTables]: Database['public']['Tables'][T]['Row'] extends {
      id: number;
      deleted_at: string | null;
    }
      ? T
      : never;
  }[AllTables],
  ExcludedTables
>;

/** Views that have `id: number | null` — eligible for read-visibility tests. */
export type RlsView = Exclude<
  {
    [V in AllViews]: Database['public']['Views'][V]['Row'] extends {
      id: number | null;
    }
      ? V
      : never;
  }[AllViews],
  ExcludedViews
>;

// Row type helpers
type TableRow<T extends AllTables> = Database['public']['Tables'][T]['Row'];
type TableInsert<T extends AllTables> =
  Database['public']['Tables'][T]['Insert'];

// ---------------------------------------------------------------------------
// Role types
// ---------------------------------------------------------------------------

export type RoleName =
  | 'anon'
  | 'pending'
  | 'user'
  | 'superUser'
  | 'admin'
  | 'superAdmin';

export type CrushExpected = {
  c?: boolean | null;
  r?: boolean | null;
  u?: boolean | null;
  s?: boolean | null;
  h?: boolean | null;
};

// ---------------------------------------------------------------------------
// Role config
// ---------------------------------------------------------------------------

interface RoleConfig {
  label: string;
  key: RoleName;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getClient: (suite: BuiltTestSuite) => Promise<any>;
}

const ALL_ROLES: RoleConfig[] = [
  {
    label: 'anon',
    key: 'anon',
    getClient: () => Promise.resolve(anonClient),
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
// tableRlsSuite
// ---------------------------------------------------------------------------

export interface TableRlsOptions<T extends RlsTable> {
  suite: () => BuiltTestSuite;
  table: T;
  insertData: () => TableInsert<T>;
  updateData: Partial<TableRow<T>>;
  expected: Partial<Record<RoleName, CrushExpected>>;
  /** Provide an existing row id to skip service-role seeding. */
  rowId?: () => number;
}

export function tableRlsSuite<T extends RlsTable>(
  opts: TableRlsOptions<T>
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = serviceClient as any;

  for (const roleConfig of ALL_ROLES) {
    const exp = opts.expected[roleConfig.key];
    if (exp === undefined) continue;

    const cExp = exp.c;
    const rExp = exp.r;
    const uExp = exp.u;
    const sExp = exp.s;
    const hExp = exp.h;

    describe(`${opts.table} CRUSH — ${roleConfig.label}`, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let act: any;
      let fixtureId: number;
      let ownsFixture = false;
      const extraCreatedIds: number[] = [];

      beforeAll(async () => {
        act = await roleConfig.getClient(opts.suite());

        if (opts.rowId) {
          fixtureId = opts.rowId();
        } else {
          const { data: row, error } = await svc
            .from(opts.table)
            .insert(opts.insertData())
            .select('id')
            .single();
          if (error)
            throw new Error(
              `tableRlsSuite: seed failed (${opts.table}): ${error.message}`
            );
          fixtureId = (row as { id: number }).id;
          ownsFixture = true;
        }
      });

      afterAll(async () => {
        for (const id of extraCreatedIds) {
          await svc.from(opts.table).delete().eq('id', id);
        }
        if (ownsFixture) {
          await svc.from(opts.table).delete().eq('id', fixtureId);
        }
      });

      if (cExp != null) {
        it('C — create', async () => {
          const { data, error } = await act
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

      if (rExp != null) {
        it('R — read', async () => {
          const { data } = await act
            .from(opts.table)
            .select('id')
            .eq('id', fixtureId);
          const count = Array.isArray(data) ? data.length : 0;
          if (rExp) {
            expect(count, 'R: expected row to be visible').toBeGreaterThan(0);
          } else {
            expect(count, 'R: expected row to be hidden').toBe(0);
          }
        });
      }

      if (uExp != null) {
        const firstKey = Object.keys(opts.updateData)[0];
        if (!firstKey)
          throw new Error(
            `tableRlsSuite: updateData must have at least one field (table: ${opts.table})`
          );

        it('U — update', async () => {
          await act
            .from(opts.table)
            .update(opts.updateData)
            .eq('id', fixtureId);

          const { data: row } = await svc
            .from(opts.table)
            .select(firstKey)
            .eq('id', fixtureId)
            .single();

          const current = (row as Record<string, unknown> | null)?.[firstKey];

          if (uExp) {
            expect(current, 'U: expected update to persist').toEqual(
              opts.updateData[firstKey as keyof typeof opts.updateData]
            );
          } else {
            expect(current, 'U: expected row to remain unchanged').not.toEqual(
              opts.updateData[firstKey as keyof typeof opts.updateData]
            );
          }
        });
      }

      if (sExp != null) {
        it('S — soft delete', async () => {
          const { error } = await act
            .from(opts.table)
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', fixtureId);

          const { data: svcRow } = await svc
            .from(opts.table)
            .select('deleted_at')
            .eq('id', fixtureId)
            .single();

          const deletedAt = (svcRow as { deleted_at: string | null } | null)
            ?.deleted_at;

          if (sExp) {
            expect(error, 'S: expected soft delete to succeed').toBeNull();
            expect(
              deletedAt,
              'S: expected deleted_at to be set'
            ).not.toBeNull();
            // Restore so H test has a live row
            await svc
              .from(opts.table)
              .update({ deleted_at: null })
              .eq('id', fixtureId);
          } else {
            // Don't assert on `error` here — RLS may silently block the UPDATE
            // (returning null error + 0 rows changed) rather than raising an error.
            // The trigger raises an error only when the role can update rows but
            // deleted_at is blocked. Ground truth is always the actual column value.
            expect(
              deletedAt,
              'S: expected deleted_at to remain null'
            ).toBeNull();
            if (rExp) {
              const { data: reRead } = await act
                .from(opts.table)
                .select('id')
                .eq('id', fixtureId);
              expect(
                Array.isArray(reRead) ? reRead.length : 0,
                'S: row should still be visible after failed soft-delete'
              ).toBeGreaterThan(0);
            }
          }
        });
      }

      if (hExp != null) {
        it('H — hard delete', async () => {
          await act.from(opts.table).delete().eq('id', fixtureId);

          const { data: row } = await svc
            .from(opts.table)
            .select('id')
            .eq('id', fixtureId)
            .maybeSingle();

          if (hExp) {
            expect(row, 'H: expected row to be permanently deleted').toBeNull();
            ownsFixture = false; // row is gone, skip afterAll cleanup
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
// viewRlsSuite
// ---------------------------------------------------------------------------

export interface ViewRlsOptions<V extends RlsView> {
  suite: () => BuiltTestSuite;
  view: V;
  label?: string;
  rowId: () => number;
  expected: Partial<Record<RoleName, boolean>>;
}

export function viewRlsSuite<V extends RlsView>(opts: ViewRlsOptions<V>): void {
  const prefix = opts.label ?? opts.view;

  for (const roleConfig of ALL_ROLES) {
    const expected = opts.expected[roleConfig.key];
    if (expected === undefined) continue;

    describe(`${prefix} — ${roleConfig.label}`, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let act: any;

      beforeAll(async () => {
        act = await roleConfig.getClient(opts.suite());
      });

      it(`R — read (expect: ${expected ? 'visible' : 'hidden'})`, async () => {
        const { data } = await act
          .from(opts.view)
          .select('id')
          .eq('id', opts.rowId());
        const count = Array.isArray(data) ? data.length : 0;
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
// rpcRlsSuite
// ---------------------------------------------------------------------------

export interface RpcRlsOptions {
  suite: () => BuiltTestSuite;
  rpc: keyof Database['public']['Functions'];
  params?: () => Record<string, unknown>;
  expected: Partial<Record<RoleName, boolean>>;
}

export function rpcRlsSuite(opts: RpcRlsOptions): void {
  for (const roleConfig of ALL_ROLES) {
    const expected = opts.expected[roleConfig.key];
    if (expected === undefined) continue;

    describe(`${opts.rpc} RPC — ${roleConfig.label}`, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let act: any;

      beforeAll(async () => {
        act = await roleConfig.getClient(opts.suite());
      });

      it(
        expected ? 'call succeeds (no error)' : 'call is denied (error)',
        async () => {
          const { error } = await act.rpc(opts.rpc, opts.params?.() ?? {});
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
