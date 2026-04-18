#!/usr/bin/env node
/**
 * db-lint.js
 *
 * Runs two layers of database linting against the local Supabase instance:
 *
 *   1. `supabase db lint`  — Splinter rules (RLS, security-definer views, etc.)
 *      Exits non-zero on errors.
 *
 *   2. Custom trigger checks — warns (but does NOT fail) when a public table
 *      is missing a `_block_deleted_at` or `_set_updated_at` trigger. These
 *      are structural conventions, not hard errors, so they surface as ⚠️
 *      warnings only.
 *
 * Usage:
 *   node scripts/db-lint.js
 *   pnpm db:lint
 *
 * Tables can be opted-out of a trigger check by adding them to the SKIP_*
 * sets below (e.g. pure lookup tables that never soft-delete).
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Tables deliberately excluded from trigger checks
// ---------------------------------------------------------------------------

/**
 * Tables that intentionally have no `_block_deleted_at` trigger — e.g. pure
 * reference / junction tables that are hard-deleted only.
 */
const SKIP_BLOCK_DELETED_AT = new Set([
  'trail_elevations', // append-only computed table, never soft-deleted
]);

/**
 * Tables that intentionally have no `_set_updated_at` trigger — e.g. immutable
 * append-only tables.
 */
const SKIP_SET_UPDATED_AT = new Set([
  'trail_elevations', // append-only computed table, updated_at managed by the elevation pipeline
]);

// ---------------------------------------------------------------------------
// Env / client setup (mirrors extract-db-policies.js)
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function checkSupabaseRunning() {
  try {
    const out = execSync('supabase status 2>&1', { encoding: 'utf8' });
    if (!out.includes('is running')) {
      console.error(
        '✖ Local Supabase is not running. Start it first: pnpm db:start'
      );
      process.exit(1);
    }
  } catch {
    console.error('✖ Could not check Supabase status. Is the CLI installed?');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Step 1: supabase db lint (Splinter)
// ---------------------------------------------------------------------------

function runSplinterLint() {
  console.log('\n▶ supabase db lint (Splinter)\n');
  try {
    execSync('supabase db lint', { stdio: 'inherit' });
    console.log('\n✔ Splinter lint passed.');
  } catch {
    // supabase db lint exits non-zero when it finds errors — propagate.
    console.error('\n✖ Splinter lint reported errors (see above).');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Step 2: custom trigger checks
// ---------------------------------------------------------------------------

async function checkTriggersViaRestFallback() {
  // Use supabase-js .from() won't work for pg_catalog — use the Postgres
  // connection string directly via execSync + psql instead.
  const psqlUrl = getPsqlUrl();

  const sql = `
    select
      c.relname as table_name,
      bool_or(t.tgname like '%_block_deleted_at') as has_block_deleted_at,
      bool_or(t.tgname like '%_set_updated_at')   as has_set_updated_at
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_trigger t
      on t.tgrelid = c.oid and not t.tgisinternal
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname not in (
        'spatial_ref_sys',
        'geography_columns',
        'geometry_columns',
        'raster_columns',
        'raster_overviews'
      )
    group by c.relname
    order by c.relname;
  `;

  let raw;
  try {
    raw = execSync(
      `psql "${psqlUrl}" -t -A -F '|' -c "${sql.replace(/\n\s*/g, ' ').trim()}"`,
      { encoding: 'utf8' }
    );
  } catch (e) {
    console.warn(
      '⚠️  Could not query triggers via psql — skipping trigger check.'
    );
    console.warn('   Make sure psql is installed and the local DB is running.');
    return false;
  }

  const rows = raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [table_name, has_block_deleted_at, has_set_updated_at] =
        line.split('|');
      return {
        table_name,
        has_block_deleted_at: has_block_deleted_at === 't',
        has_set_updated_at: has_set_updated_at === 't',
      };
    });

  return emitTriggerWarnings(rows);
}

function getPsqlUrl() {
  // Try to grab the DB URL from supabase status
  try {
    const status = execSync('supabase status', { encoding: 'utf8' });
    const match = status.match(/DB URL\s*:\s*(\S+)/);
    if (match) return match[1];
  } catch {
    // ignore
  }
  // Fallback to the known local default
  return 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
}

/**
 * Emits ⚠️ warnings for tables missing expected triggers.
 * Returns true if any warnings were emitted.
 */
function emitTriggerWarnings(rows) {
  const warnings = [];

  for (const row of rows) {
    const { table_name, has_block_deleted_at, has_set_updated_at } = row;

    if (!has_block_deleted_at && !SKIP_BLOCK_DELETED_AT.has(table_name)) {
      warnings.push(
        `  ⚠️  ${table_name} — missing \`${table_name}_block_deleted_at\` trigger\n` +
          `       before update on public.${table_name}\n` +
          `       for each row execute function public.block_deleted_at_update(...)`
      );
    }

    if (!has_set_updated_at && !SKIP_SET_UPDATED_AT.has(table_name)) {
      warnings.push(
        `  ⚠️  ${table_name} — missing \`${table_name}_set_updated_at\` trigger\n` +
          `       before update on public.${table_name}\n` +
          `       for each row execute function public.set_updated_at()`
      );
    }
  }

  if (warnings.length === 0) {
    console.log(
      '✔ All public tables have block_deleted_at and set_updated_at triggers.'
    );
    return false;
  }

  console.log(
    `⚠️  ${warnings.length} trigger warning(s) — these are conventions, not hard errors:\n`
  );
  for (const w of warnings) {
    console.log(w + '\n');
  }
  console.log(
    '  If a table intentionally skips a trigger, add it to the SKIP_* sets in scripts/db-lint.js'
  );
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

checkSupabaseRunning();
runSplinterLint();
const hadWarnings = await checkTriggersViaRestFallback();

console.log(
  hadWarnings
    ? '\n⚠️  db:lint complete with warnings.'
    : '\n✔ db:lint complete.'
);
