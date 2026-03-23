#!/usr/bin/env node
/**
 * db-migrate.js
 *
 * Applies pending migrations to the local Supabase instance without
 * dropping data, then regenerates database.types.ts and POLICIES.md.
 *
 * Usage:
 *   node scripts/db-migrate.js
 *   pnpm db:migrate
 *
 * Flags:
 *   --no-types     Skip database.types.ts regeneration
 *   --no-policies  Skip POLICIES.md regeneration
 *   --dry-run      Show pending migrations without applying them
 *   --help         Show this help
 */

import { execSync } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .option('types', { type: 'boolean', default: true, description: 'Regenerate database.types.ts' })
  .option('policies', { type: 'boolean', default: true, description: 'Regenerate POLICIES.md' })
  .option('dry-run', { type: 'boolean', default: false, description: 'Show pending migrations without applying' })
  .help()
  .argv;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd, label) {
  console.log(`\n▶ ${label ?? cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch {
    console.error(`\n✖ Failed: ${label ?? cmd}`);
    process.exit(1);
  }
}

function checkSupabaseRunning() {
  try {
    const out = execSync('supabase status 2>&1', { encoding: 'utf8' });
    if (!out.includes('is running')) {
      console.error('✖ Local Supabase is not running. Start it first: pnpm db:start');
      process.exit(1);
    }
  } catch {
    console.error('✖ Could not check Supabase status. Is the CLI installed?');
    process.exit(1);
  }
}

function getPendingMigrations() {
  try {
    const out = execSync('supabase migration list 2>&1', { encoding: 'utf8' });
    // Lines with no remote timestamp are pending (local only)
    const pending = out
      .split('\n')
      .filter(line => /^\s*│/.test(line))          // table rows only
      .filter(line => /\|\s*$/.test(line.trim()))   // remote column empty
      .map(line => line.match(/(\d{14}[^│]*)/)?.[1]?.trim())
      .filter(Boolean);
    return pending;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

checkSupabaseRunning();

if (argv['dry-run']) {
  console.log('\n▶ Checking pending migrations…');
  const pending = getPendingMigrations();
  if (pending.length === 0) {
    console.log('  No pending migrations — local DB is up to date.');
  } else {
    console.log(`  ${pending.length} pending migration(s):`);
    pending.forEach(m => console.log(`    • ${m}`));
  }
  process.exit(0);
}

run('supabase db push --local', 'Apply pending migrations');

if (argv.types) {
  run(
    'supabase gen types typescript --local --schema public > src/lib/supabase/database.types.ts',
    'Regenerate database.types.ts'
  );
}

if (argv.policies) {
  run('node scripts/extract-db-policies.js', 'Regenerate POLICIES.md');
}

console.log('\n✔ db:migrate complete.');
