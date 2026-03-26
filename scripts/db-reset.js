#!/usr/bin/env node
/**
 * db-reset.js
 *
 * Full local database reset: drops all data, re-runs all migrations, seeds,
 * then regenerates database.types.ts and POLICIES.md.
 *
 * Usage:
 *   node scripts/db-reset.js
 *   pnpm db:reset
 *
 * Flags:
 *   --no-seed      Skip seed data (migrations only)
 *   --no-types     Skip database.types.ts regeneration
 *   --no-policies  Skip POLICIES.md regeneration
 *   --help         Show this help
 *
 * ⚠️  Destructive — all local data will be lost.
 */

import { execSync } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .option('seed', {
    type: 'boolean',
    default: true,
    description: 'Run seed.sql after migrations',
  })
  .option('types', {
    type: 'boolean',
    default: true,
    description: 'Regenerate database.types.ts',
  })
  .option('policies', {
    type: 'boolean',
    default: true,
    description: 'Regenerate POLICIES.md',
  })
  .help().argv;

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
// Main
// ---------------------------------------------------------------------------

console.log('⚠️  Full database reset — all local data will be lost.\n');

checkSupabaseRunning();

const resetCmd = argv.seed
  ? 'supabase db reset'
  : 'supabase db reset --no-seed';

run(
  resetCmd,
  'Reset database (migrations' + (argv.seed ? ' + seed' : '') + ')'
);

if (argv.types) {
  run(
    'supabase gen types typescript --local --schema public > src/lib/supabase/database.types.ts',
    'Regenerate database.types.ts'
  );
}

if (argv.policies) {
  run('node scripts/extract-db-policies.js', 'Regenerate POLICIES.md');
}

// Run prettier and summarise — suppress per-file output
console.log('\n▶ Format source files');
try {
  const changed = execSync(
    'prettier --list-different "src/**/*.{js,jsx,ts,tsx,json,css,md}"',
    { encoding: 'utf8' }
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  execSync(
    'prettier --write --log-level silent "src/**/*.{js,jsx,ts,tsx,json,css,md}"'
  );
  console.log(`  reformatted ${changed.length} file(s)`);
} catch (e) {
  // --list-different exits 1 when files need formatting; that's fine
  const changed = (e.stdout ?? '').trim().split('\n').filter(Boolean);
  if (changed.length) {
    execSync(
      'prettier --write --log-level silent "src/**/*.{js,jsx,ts,tsx,json,css,md}"'
    );
    console.log(`  reformatted ${changed.length} file(s)`);
  } else {
    console.error('  prettier failed:', e.message);
    process.exit(1);
  }
}

console.log('\n✔ db:reset complete.');
