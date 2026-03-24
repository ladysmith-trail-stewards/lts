#!/usr/bin/env node
/**
 * extract-db-policies.js
 *
 * Calls the `get_rls_policies()` RPC (service-role only) and writes
 * supabase/POLICIES.md — a human + AI readable snapshot of all RLS
 * policies active in the public schema.
 *
 * Run after `pnpm db:reset` or `pnpm db:start`:
 *   node scripts/extract-db-policies.js
 *   pnpm db:policies
 *
 * Requires:
 *   - Local Supabase running (`pnpm db:start`)
 *   - SUPABASE_SERVICE_ROLE_KEY env var (or falls back to local dev key)
 *   - SUPABASE_URL env var (or falls back to local dev URL)
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
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  dotEnv.VITE_SUPABASE_SECRET_KEY;

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
  anon:        'Anon',
  user:        'User',
  super_user:  'Super User',
  admin:       'Admin',
  super_admin: 'Super Admin',
};

function codeOrDash(val) {
  const v = (val ?? '').trim();
  return v ? `\`${v}\`` : '—';
}

/**
 * Infer which role a policy applies to from its name / expressions.
 * Returns one of the ROLES keys, or 'authenticated' for all-authenticated policies.
 */
function inferRole(policy_name, using_expr, check_expr) {
  const haystack = `${policy_name} ${using_expr ?? ''} ${check_expr ?? ''}`.toLowerCase();
  if (haystack.includes('service_role'))  return 'service_role';
  if (haystack.includes('super_admin'))   return 'super_admin';
  if (haystack.includes('super_user'))    return 'super_user';
  if (haystack.includes('admin'))         return 'admin';
  if (haystack.includes('user'))          return 'user';
  // Policies scoped to auth.role() = 'authenticated' apply to all logged-in roles
  if (haystack.includes("'authenticated'")) return 'authenticated';
  // public / anon policies (e.g. "visibility = 'public'", "true") — treat as anon
  return 'anon';
}

/**
 * Is the policy scoped to a region (contains get_my_region_id)?
 */
function isRegionScoped(using_expr, check_expr) {
  return `${using_expr ?? ''} ${check_expr ?? ''}`.includes('get_my_region_id');
}

/**
 * Is the policy scoped to the calling user's own row (contains auth.uid())?
 */
function isOwnScoped(using_expr, check_expr) {
  return `${using_expr ?? ''} ${check_expr ?? ''}`.includes('auth.uid()');
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
    const role = inferRole(policy_name, using_expr, check_expr);

    // 'authenticated' = applies to every non-anon role
    const targetRoles = role === 'authenticated'
      ? ROLES.filter(r => r !== 'anon')
      : ROLES.includes(role) ? [role] : [];

    if (!targetRoles.length) continue;

    const cmds = command === 'ALL' ? COMMANDS : [command];

    let scope;
    if (isRegionScoped(using_expr, check_expr)) scope = 'region';
    else if (isOwnScoped(using_expr, check_expr)) scope = 'own';
    else scope = 'always';

    for (const r of targetRoles) {
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
  const activeCmds = COMMANDS.filter(cmd =>
    ROLES.some(r => matrix[r][cmd] !== null)
  );

  const header = `| Role | ${activeCmds.join(' | ')} |`;
  const sep    = `|---|${activeCmds.map(() => ':---:').join('|')}|`;

  const rows = ROLES.map(role => {
    const cells = activeCmds.map(cmd => {
      const v = matrix[role][cmd];
      if (v === 'always') return '✅';
      if (v === 'region') return '📍';
      if (v === 'own')    return '👤';
      return '—';
    });
    return `| ${ROLE_LABELS[role]} | ${cells.join(' | ')} |`;
  });

  return [header, sep, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Markdown builders
// ---------------------------------------------------------------------------

/** Detail table — policy name, command, USING, WITH CHECK (no roles column). */
function buildDetailSection(rows) {
  if (!rows.length) return '_No RLS policies found._\n';

  const byTable = {};
  for (const row of rows) (byTable[row.table_name] ??= []).push(row);

  let md = '';
  for (const [table, policies] of Object.entries(byTable)) {
    md += `### \`${table}\`\n\n`;
    md += `| Policy name | Command | USING | WITH CHECK |\n`;
    md += `|---|---|---|---|\n`;
    for (const { policy_name, command, using_expr, check_expr } of policies) {
      md += `| \`${policy_name}\` | \`${command}\` | ${codeOrDash(using_expr)} | ${codeOrDash(check_expr)} |\n`;
    }
    md += '\n';
  }
  return md;
}

/** Human-readable matrix section — one matrix per table. */
function buildMatrixSection(rows) {
  if (!rows.length) return '_No RLS policies found._\n';

  const byTable = {};
  for (const row of rows) (byTable[row.table_name] ??= []).push(row);

  const legend =
    '> ✅ = always &nbsp;·&nbsp; 📍 = own region only &nbsp;·&nbsp; 👤 = own record only &nbsp;·&nbsp; — = no access\n' +
    '>\n' +
    '> `service_role` bypasses RLS entirely and is excluded from this matrix.\n\n';

  let md = legend;
  for (const [table, policies] of Object.entries(byTable)) {
    const matrix = buildMatrix(policies);
    md += `### \`${table}\`\n\n`;
    md += renderMatrix(matrix) + '\n\n';
  }
  return md;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Calling get_rls_policies() via service-role RPC…');

const { data, error } = await supabase.rpc('get_rls_policies');

if (error) {
  console.error('RPC failed. Is local Supabase running? (`pnpm db:start`)\n', error.message);
  process.exit(1);
}

const now = new Date().toISOString();

const md = `# RLS Policies

> Auto-generated by \`scripts/extract-db-policies.js\` on ${now}.
> Re-run after \`pnpm db:reset\` or schema changes: \`pnpm db:policies\`.
>
> **For AI reference** — describes the exact RLS policies
> active in the local Supabase instance.

---

## Access Matrix

${buildMatrixSection(data)}
---

## Policy Detail

${buildDetailSection(data)}
`;

writeFileSync(OUT, md, 'utf8');
console.log(`Written → ${OUT}`);
