#!/usr/bin/env node
/**
 * extract-db-policies.js
 *
 * Calls the `get_rls_policies()` RPC (service-role only) and queries
 * `information_schema.routine_privileges` for RPC grant info, then
 * writes supabase/POLICIES.md — a human + AI readable snapshot of all
 * RLS policies and callable RPCs active in the public schema.
 *
 * Run after `pnpm db:reset` or `pnpm db:start`:
 *   node scripts/extract-db-policies.js
 *   pnpm db:policies
 *
 * Requires:
 *   - Local Supabase r> **Trails — soft delete**: The matrix DELETE column only reflects RLS policies.
> `admin` and `super_user` have no DELETE policy (cannot hard-delete) but **can soft-delete**
> via the `soft_delete_trails` RPC (sets `deleted_at`). Soft-deleted rows are hidden from
> `trails_view`. `super_admin` can hard-delete directly via PostgREST DELETE (RLS policy).
> See the **RPCs** section for soft-delete access rules. **Profiles — soft delete**: Same pattern. `admin` has no DELETE policy (cannot hard-delete)
> but **can soft-delete profiles in their region** via `soft_delete_profiles`. Any authenticated
> user can soft-delete their own profile (self-deletion). `super_admin` can hard-delete directly
> via PostgREST DELETE (RLS policy) — no RPC required.(`pnpm db:start`)
 *   - SUPABASE_SERVICE_ROLE_KEY env var (or falls back to local dev key)
 *   - SUPABASE_URL env var (or falls back to local dev URL)
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../supabase/POLICIES.md');

// ---------------------------------------------------------------------------
// Read .env (Vite-style) — VITE_SUPABASE_URL + VITE_SUPABASE_SECRET_KEY
// ---------------------------------------------------------------------------
function readDotEnv() {
  const envPath = resolve(__dirname, '../.env');
  try {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    const env = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
    return env;
  } catch {
    return {};
  }
}

const dotEnv = readDotEnv();

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  dotEnv.VITE_SUPABASE_URL ??
  'http://127.0.0.1:54321';

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? dotEnv.VITE_SUPABASE_SECRET_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error(
    'Missing service-role key.\n' +
      'Set VITE_SUPABASE_SECRET_KEY in .env or SUPABASE_SERVICE_ROLE_KEY in the environment.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COMMANDS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL'];

// Ordered display roles (rows of the matrix)
const ROLES = ['anon', 'user', 'super_user', 'admin', 'super_admin'];
const ROLE_LABELS = {
  anon: 'Anon',
  user: 'User',
  super_user: 'Super User',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

function codeOrDash(val) {
  const v = (val ?? '').trim();
  return v ? `\`${v}\`` : '—';
}

/**
 * Infer which roles a policy applies to from its name and expressions.
 * Returns an array of role keys from ROLES, or special tokens:
 *   'authenticated' → all non-anon roles
 *   'all'           → every role including anon
 *
 * Matches auth.jwt() ->> 'user_role' patterns, including multi-role
 * ARRAY[...] expressions like `= ANY (ARRAY['admin','super_user'])`.
 */
function inferRoles(policy_name, using_expr, check_expr) {
  const haystack =
    `${policy_name} ${using_expr ?? ''} ${check_expr ?? ''}`.toLowerCase();
  const expr = `${using_expr ?? ''} ${check_expr ?? ''}`.toLowerCase();

  if (haystack.includes('service_role')) return ['service_role'];

  // Policy applies to all roles (using (true) or no role restriction)
  if (expr.trim() === 'true') return ['all'];

  // auth.role() = 'authenticated' → every signed-in role
  if (expr.includes("'authenticated'") && expr.includes('auth.role()')) {
    return ['authenticated'];
  }

  // Collect roles mentioned in JWT claim checks or policy names.
  // Must check super_admin before admin, and super_user before user.
  const mentioned = new Set();
  if (haystack.includes('super_admin')) mentioned.add('super_admin');
  if (haystack.includes('super_user')) mentioned.add('super_user');
  // 'admin' — only add plain admin if not preceded by 'super_'
  if (/(?<!super_)admin/.test(haystack)) mentioned.add('admin');
  // 'user' — only add plain user if it appears as a role value or policy name token
  if (/[^_a-z]user[^_a-z]|'user'/.test(haystack)) mentioned.add('user');

  if (mentioned.size > 0) return [...mentioned];

  // auth.uid() only → own-row policy, applies to all authenticated users
  if (expr.includes('auth.uid()')) return ['authenticated'];

  return ['anon'];
}

/**
 * Is the policy scoped to a region for a *specific* role?
 * Returns true only when the region_id check is NOT guarded by a super_admin
 * short-circuit for that role.
 *
 * Pattern: super_admin gets global access when the expression reads:
 *   user_role = 'super_admin'
 *   OR (user_role = 'admin' AND region_id = ...)
 *
 * For super_admin we return false (global); for admin we return true (region).
 */
function isRegionScopedForRole(using_expr, check_expr, role) {
  const expr = `${using_expr ?? ''} ${check_expr ?? ''}`;
  if (!expr.includes("'region_id'") && !expr.includes('get_my_region_id')) {
    return false;
  }
  // super_admin has an unconditional branch in the same policy — treat as global.
  if (role === 'super_admin') return false;
  return true;
}

/**
 * Is the policy scoped to the calling user's own row for a specific role?
 * super_admin has an unconditional branch in the SELECT/UPDATE policies
 * alongside the auth.uid() own-row branch — treat as global.
 */
function isOwnScopedForRole(using_expr, check_expr, role) {
  if (!`${using_expr ?? ''} ${check_expr ?? ''}`.includes('auth.uid()')) {
    return false;
  }
  if (role === 'super_admin') return false;
  return true;
}

// Scope priority: higher index wins
const SCOPE_RANK = { own: 1, region: 2, always: 3 };

/**
 * Build a role × command matrix for one table.
 * Cell values: 'always' | 'region' | 'own' | null
 */
function buildMatrix(policies) {
  const matrix = {};
  for (const role of ROLES) {
    matrix[role] = {};
    for (const cmd of COMMANDS) matrix[role][cmd] = null;
  }

  for (const { policy_name, command, using_expr, check_expr } of policies) {
    const inferredRoles = inferRoles(policy_name, using_expr, check_expr);

    // Expand special tokens
    let targetRoles;
    if (inferredRoles.includes('all')) {
      targetRoles = [...ROLES];
    } else if (inferredRoles.includes('authenticated')) {
      targetRoles = ROLES.filter((r) => r !== 'anon');
    } else {
      targetRoles = inferredRoles.filter((r) => ROLES.includes(r));
    }

    if (!targetRoles.length) continue;

    const cmds = command === 'ALL' ? COMMANDS : [command];

    for (const r of targetRoles) {
      // Evaluate scope per-role so that a policy covering both super_admin
      // (global) and admin (region-scoped) doesn't stamp region on super_admin.
      let scope;
      if (isRegionScopedForRole(using_expr, check_expr, r)) scope = 'region';
      else if (isOwnScopedForRole(using_expr, check_expr, r)) scope = 'own';
      else scope = 'always';

      for (const cmd of cmds) {
        const current = matrix[r][cmd];
        if (current === null || SCOPE_RANK[scope] > SCOPE_RANK[current]) {
          matrix[r][cmd] = scope;
        }
      }
    }
  }

  return matrix;
}

function renderMatrix(matrix) {
  const activeCmds = COMMANDS.filter((cmd) =>
    ROLES.some((r) => matrix[r][cmd] !== null)
  );

  const header = `| Role | ${activeCmds.join(' | ')} |`;
  const sep = `|---|${activeCmds.map(() => ':---:').join('|')}|`;

  const rows = ROLES.map((role) => {
    const cells = activeCmds.map((cmd) => {
      const v = matrix[role][cmd];
      if (v === 'always') return '✅';
      if (v === 'region') return '📍';
      if (v === 'own') return '👤';
      return '—';
    });
    return `| ${ROLE_LABELS[role]} | ${cells.join(' | ')} |`;
  });

  return [header, sep, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Markdown builders
// ---------------------------------------------------------------------------

/** Human-readable matrix section — one matrix per table. */
function buildMatrixSection(rows) {
  if (!rows.length) return '_No RLS policies found._\n';

  const byTable = {};
  for (const row of rows) (byTable[row.table_name] ??= []).push(row);

  let md = '';
  for (const [table, policies] of Object.entries(byTable)) {
    const matrix = buildMatrix(policies);
    md += `### \`${table}\`\n\n`;
    md += renderMatrix(matrix) + '\n\n';
  }
  return md;
}

/**
 * RPCs section — queries pg_proc + pg_namespace for every public-schema
 * function and the roles that have EXECUTE grants on it, then renders a
 * per-function grantee table.
 *
 * Internal helpers (handle_new_user, get_rls_policies, get_admin_users,
 * custom_access_token_hook, set_updated_at) are filtered out — only RPCs
 * intended to be called by application code are shown.
 */
async function buildRpcSection(supabase) {
  // Internal / trigger functions to exclude from RPC docs
  const INTERNAL_RPCS = new Set([
    'handle_new_user',
    'get_rls_policies',
    'get_admin_users',
  ]);

  // Query via the Supabase DB REST endpoint using a raw SQL approach.
  // We embed the SQL as a call to the get_rls_policies function's
  // companion by posting directly to /rest/v1/rpc/get_rls_policies
  // — but for arbitrary SQL we use the /pg endpoint or the
  // admin API. Simplest reliable approach: use fetch against
  // the Postgres direct connection string is not available here,
  // so we call a SQL query via the Supabase management API proxy
  // at /pg/query if it exists, otherwise fall back to a well-formed
  // PostgREST RPC call.

  // Use the Supabase REST meta: /rest/v1/rpc against a helper
  // that returns routine + grantee info from pg_catalog.
  const body = JSON.stringify({
    query: `
      SELECT
        p.proname                                    AS routine_name,
        r.rolname                                    AS grantee,
        obj_description(p.oid, 'pg_proc')            AS description
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN pg_roles r
      WHERE n.nspname = 'public'
        AND r.rolname IN ('anon', 'authenticated', 'service_role')
        AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
      ORDER BY p.proname, r.rolname;
    `,
  });

  // Try the local Supabase pg meta API (available in local dev)
  const pgMetaRes = await fetch(
    `${SUPABASE_URL.replace(':54321', ':54322')}/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body,
    }
  ).catch(() => null);

  let privRows = null;

  if (pgMetaRes?.ok) {
    const json = await pgMetaRes.json();
    privRows = json.rows ?? json;
  }

  // Fallback: try the pg-meta service on its standard local port 54323
  if (!privRows) {
    const pgMeta2Res = await fetch(`http://127.0.0.1:54323/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'pg-meta-key': SERVICE_ROLE_KEY,
      },
      body,
    }).catch(() => null);

    if (pgMeta2Res?.ok) {
      const json = await pgMeta2Res.json();
      privRows = json.rows ?? json;
    }
  }

  if (!privRows) {
    // Final fallback: derive from migration files (static, always accurate)
    return buildRpcSectionStatic();
  }

  // Group by routine_name → { grantees: Set, description: string|null }
  const byRpc = {};
  for (const { routine_name, grantee, description } of privRows) {
    if (INTERNAL_RPCS.has(routine_name)) continue;
    byRpc[routine_name] ??= {
      grantees: new Set(),
      description: description ?? null,
    };
    byRpc[routine_name].grantees.add(grantee);
    if (description) byRpc[routine_name].description = description;
  }

  if (!Object.keys(byRpc).length) {
    return buildRpcSectionStatic();
  }

  return renderRpcTable(byRpc);
}

/**
 * Static fallback: parse GRANT/REVOKE lines from migration SQL files
 * to build the RPC → grantee map without needing a live DB query.
 * Also detects SECURITY DEFINER functions.
 */
function buildRpcSectionStatic() {
  const migrationsDir = resolve(__dirname, '../supabase/migrations');
  let files;
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(resolve(migrationsDir, f), 'utf8'));
  } catch {
    return '_Could not determine RPC privileges._\n';
  }

  const INTERNAL_RPCS = new Set([
    'get_my_role',
    'get_my_region_id',
    'handle_new_user',
    'get_rls_policies',
    'get_admin_users',
    'custom_access_token_hook',
    'set_updated_at',
  ]);

  // Track: rpcName → { grantees: Set<string>, securityDefiner: boolean }
  const grants = {};

  for (const sql of files) {
    // Find each public function declaration and look for SECURITY DEFINER
    // and COMMENT ON FUNCTION in the migration SQL.
    const fnRe = /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(/gi;
    let m;
    while ((m = fnRe.exec(sql)) !== null) {
      const name = m[1];
      const window = sql.slice(m.index, m.index + 400);
      const secDef = /security\s+definer/i.test(window);
      if (!INTERNAL_RPCS.has(name)) {
        grants[name] ??= {
          grantees: new Set(),
          securityDefiner: false,
          description: null,
        };
        if (secDef) grants[name].securityDefiner = true;
      }
    }

    // Extract COMMENT ON FUNCTION descriptions
    const commentRe =
      /comment\s+on\s+function\s+public\.(\w+)\s*\([^)]*\)\s+is\s+'((?:[^']|'')+)'/gi;
    let cm;
    while ((cm = commentRe.exec(sql)) !== null) {
      const [, name, rawComment] = cm;
      if (!INTERNAL_RPCS.has(name) && grants[name]) {
        // Postgres concatenates adjacent string literals; collapse them and unescape ''
        grants[name].description = rawComment.replace(/''/g, "'");
      }
    }

    // Match GRANT EXECUTE … TO <role>
    const grantMatches = [
      ...sql.matchAll(
        /grant\s+execute\s+on\s+function\s+public\.(\w+)[^;]*to\s+(\w+)/gi
      ),
    ];
    for (const m of grantMatches) {
      const [, name, grantee] = m;
      if (!INTERNAL_RPCS.has(name)) {
        grants[name] ??= { grantees: new Set(), securityDefiner: false };
        grants[name].grantees.add(grantee);
      }
    }

    // Match REVOKE EXECUTE … FROM <role> — remove from set
    const revokeMatches = [
      ...sql.matchAll(
        /revoke\s+execute\s+on\s+function\s+public\.(\w+)[^;]*from\s+(\w+)/gi
      ),
    ];
    for (const m of revokeMatches) {
      const [, name, grantee] = m;
      grants[name]?.grantees.delete(grantee);
    }
  }

  // Remove internal RPCs that slipped through
  for (const name of INTERNAL_RPCS) delete grants[name];

  const filtered = Object.fromEntries(
    Object.entries(grants).filter(([, v]) => v.grantees.size > 0)
  );

  if (!Object.keys(filtered).length) return '_No application RPCs found._\n';

  // Convert to the shape renderRpcTable expects: name → { grantees, securityDefiner }
  return (
    renderRpcTable(filtered) +
    '\n> ℹ️ Derived from migration GRANT/REVOKE statements.\n'
  );
}

function renderRpcTable(byRpc) {
  const GRANTEE_ORDER = ['anon', 'authenticated', 'service_role'];

  let md = '| RPC | Callable by | Security | Notes |\n|---|---|:---:| ---|\n';
  for (const [name, val] of Object.entries(byRpc).sort()) {
    // val may be a Set (legacy live-DB path) or { grantees, securityDefiner, description }
    const grantees = val instanceof Set ? val : val.grantees;
    const secDef = val instanceof Set ? false : val.securityDefiner;
    const desc = val instanceof Set ? null : val.description;

    const cleaned = [...grantees]
      .filter((g) => GRANTEE_ORDER.includes(g))
      .sort((a, b) => GRANTEE_ORDER.indexOf(a) - GRANTEE_ORDER.indexOf(b));

    const secLabel = secDef ? '🔒 DEFINER' : 'INVOKER';
    md += `| \`${name}\` | ${cleaned.map((g) => `\`${g}\``).join(', ') || '—'} | ${secLabel} | ${desc ?? '—'} |\n`;
  }

  md += `\n> ℹ️ **Security**: \`INVOKER\` = runs as the calling user (RLS applies normally). \`🔒 DEFINER\` = runs as the function owner, bypassing RLS — used only where a genuine privilege bypass is required (e.g. writing \`deleted_at\` past column-level security).\n`;
  md += `> ℹ️ \`authenticated\` = any signed-in user. Individual RPCs may enforce additional role checks internally via \`auth.jwt()\` claims.\n`;
  return md;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Calling get_rls_policies() via service-role RPC…');

const { data, error } = await supabase.rpc('get_rls_policies');

if (error) {
  console.error(
    'RPC failed. Is local Supabase running? (`pnpm db:start`)\n',
    error.message
  );
  process.exit(1);
}

const rpcSection = await buildRpcSection(supabase);

const md = `# RLS Policies

> Auto-generated by \`scripts/extract-db-policies.js\`.
> Re-run after \`pnpm db:reset\` or schema changes: \`pnpm db:policies\`.
>
> **For AI reference** — describes the exact RLS policies
> active in the local Supabase instance.

---

## Access Matrix

> ✅ = always &nbsp;·&nbsp; 📍 = own region only &nbsp;·&nbsp; 👤 = own record only &nbsp;·&nbsp; — = no access
>
> \`service_role\` bypasses RLS entirely and is excluded from this matrix.
>
> **\`pending\` role** — new Google/OAuth sign-ups land here until an admin promotes them to \`user\`.
> No policies grant \`pending\` any access (identical to \`anon\` at the data layer).
>
> **Soft delete** — setting \`deleted_at\` is the standard non-destructive removal path.
> The DELETE column in the matrix reflects hard-delete RLS only (\`super_admin\` only).
> All other roles use the \`soft_delete_*\` RPCs to soft-delete records they're permitted to manage.
> Soft-deleted rows are hidden from \`trails_view\` and excluded by application queries.
> \`deleted_at\` cannot be set by a direct UPDATE — only via the SECURITY DEFINER soft-delete RPCs.

${buildMatrixSection(data)}
---

## RPCs

${rpcSection}
`;

writeFileSync(OUT, md, 'utf8');
console.log(`Written → ${OUT}`);
