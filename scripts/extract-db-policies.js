#!/usr/bin/env node
/**
 * extract-db-policies.js
 *
 * Calls the `get_rls_policies()` and `get_rpc_privileges()` RPCs
 * (service-role only) then writes supabase/POLICIES.md — a human + AI
 * readable snapshot of all RLS policies and callable RPCs active in the
 * local Supabase instance.
 *
 * Run after `pnpm db:reset` or schema changes:
 *   node scripts/extract-db-policies.js
 *   pnpm db:policies
 *
 * Requires:
 *   - Local Supabase running (`pnpm db:start`)
 *   - VITE_SUPABASE_SECRET_KEY in .env (or SUPABASE_SERVICE_ROLE_KEY in env)
 *   - VITE_SUPABASE_URL in .env (or SUPABASE_URL in env)
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync } from 'fs';
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

  if (mentioned.size > 0) {
    // If the policy also has an auth.uid() branch (own-row access), it applies
    // to ALL authenticated users — not just the explicitly-named roles.
    if (expr.includes('auth.uid()')) return ['authenticated'];
    return [...mentioned];
  }

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
  // super_admin always has an unconditional branch — treat as global.
  if (role === 'super_admin') return false;

  // Check whether this role is explicitly paired with the region_id guard.
  // e.g. `user_role in ('admin', 'super_user') and region_id = ...`
  // vs   `user_role = 'admin' and region_id = ...` (super_user not paired).
  const rolePattern = new RegExp(`'${role}'`);
  if (!rolePattern.test(expr)) return false;

  // Confirm the role mention is in a branch that also contains region_id.
  // Split on top-level OR to check if they're in the same arm.
  // Simple heuristic: both the role value and 'region_id' appear together
  // within a reasonable window (500 chars).
  const idx = expr.indexOf(`'${role}'`);
  const window = expr.slice(Math.max(0, idx - 200), idx + 200);
  return window.includes('region_id') || window.includes('get_my_region_id');
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
 * RPCs section — calls get_rpc_privileges() (service-role only) to get
 * every public-schema function with its grantees, SECURITY DEFINER flag,
 * and description straight from the live DB. Fails hard if unreachable.
 */
async function buildRpcSection() {
  const INTERNAL_RPCS = new Set([
    'handle_new_user',
    'get_rls_policies',
    'get_rpc_privileges',
    'get_admin_users',
    'get_my_role',
    'get_my_region_id',
    'custom_access_token_hook',
    'set_updated_at',
    'set_geom_updated_at',
    'block_deleted_at_update',
    'attach_block_deleted_at_trigger',
    'get_trails_utm',
    'get_utm_epsg',
  ]);

  const { data, error } = await supabase.rpc('get_rpc_privileges');

  if (error) {
    console.error(
      'get_rpc_privileges() RPC failed. Is local Supabase running? (`pnpm db:start`)\n',
      error.message
    );
    process.exit(1);
  }

  // Group by routine_name
  const byRpc = {};
  for (const { routine_name, security_definer, description, grantee } of data) {
    if (INTERNAL_RPCS.has(routine_name)) continue;
    byRpc[routine_name] ??= {
      grantees: new Set(),
      securityDefiner: security_definer === true,
      description: description ?? null,
    };
    byRpc[routine_name].grantees.add(grantee);
  }

  return renderRpcTable(byRpc);
}

function renderRpcTable(byRpc) {
  const GRANTEE_ORDER = ['anon', 'authenticated', 'service_role'];

  let md = '| RPC | Callable by | Security | Notes |\n|---|---|:---:| ---|\n';
  for (const [
    name,
    { grantees, securityDefiner, description },
  ] of Object.entries(byRpc).sort()) {
    const cleaned = [...grantees]
      .filter((g) => GRANTEE_ORDER.includes(g))
      .sort((a, b) => GRANTEE_ORDER.indexOf(a) - GRANTEE_ORDER.indexOf(b));

    const secLabel = securityDefiner ? '🔒 DEFINER' : 'INVOKER';
    md += `| \`${name}\` | ${cleaned.map((g) => `\`${g}\``).join(', ') || '—'} | ${secLabel} | ${description ?? '—'} |\n`;
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

const rpcSection = await buildRpcSection();

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
> Soft-delete is performed by setting \`deleted_at\` directly via UPDATE; the \`block_deleted_at_update\`
> trigger enforces role-based rules (JWT claims) to determine which records each role may soft-delete.
> \`super_admin\` may soft-delete anything; \`admin\` may soft-delete profiles in their region or their own;
> \`super_user\` may soft-delete their own profile; \`user\` may soft-delete their own profile.
> Soft-deleted rows are hidden from \`trails_view\` and excluded by application queries.

${buildMatrixSection(data)}
---

## RPCs

${rpcSection}
`;

writeFileSync(OUT, md, 'utf8');
console.log(`Written → ${OUT}`);
