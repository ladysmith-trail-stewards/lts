#!/usr/bin/env node
/**
 * db-backup.js
 *
 * Dumps the database to a timestamped SQL file in the backups/ directory.
 * Works against the local Supabase instance or a remote production database.
 *
 * Usage:
 *   node scripts/db-backup.js              # dump local DB
 *   node scripts/db-backup.js --db-url <connection-string>   # dump remote/prod DB
 *   pnpm db:backup
 *   pnpm db:backup -- --db-url <connection-string>
 *
 * Flags:
 *   --db-url   PostgreSQL connection string for remote DB (omit to target local)
 *   --file     Override the output file path (default: backups/YYYY-MM-DDTHH-MM-SS.sql)
 *   --data-only  Dump data rows only (no schema / DDL)
 *   --help     Show this help
 *
 * ⚠️  The connection string contains credentials — never commit it to git.
 *     Store it in .env or pass it via an environment variable.
 */

import { execSync, spawnSync } from 'child_process';
import { mkdirSync } from 'fs';
import { join } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .option('db-url', {
    type: 'string',
    description: 'PostgreSQL connection string for remote DB (omit to use local)',
  })
  .option('file', {
    type: 'string',
    description: 'Override output file path',
  })
  .option('data-only', {
    type: 'boolean',
    default: false,
    description: 'Dump data rows only (no DDL)',
  })
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

function checkSupabaseCli() {
  const result = spawnSync('supabase', ['--version'], { encoding: 'utf8' });
  if (result.error) {
    console.error('✖ Supabase CLI not found. Install it: brew install supabase/tap/supabase');
    process.exit(1);
  }
}

function checkLocalSupabaseRunning() {
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

function buildOutputPath() {
  if (argv.file) return argv.file;
  const ts = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
  return join('backups', `${ts}.sql`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

checkSupabaseCli();

const isRemote = Boolean(argv['db-url']);

if (!isRemote) {
  checkLocalSupabaseRunning();
}

// Ensure backups/ directory exists (listed in root .gitignore — never committed)
mkdirSync('backups', { recursive: true });

const outputFile = buildOutputPath();

let dumpCmd = `supabase db dump --file "${outputFile}"`;
if (isRemote) {
  dumpCmd += ` --db-url "${argv['db-url']}"`;
}
if (argv['data-only']) {
  dumpCmd += ' --data-only';
}

const target = isRemote ? `remote (${argv['db-url'].replace(/:[^:@]+@/, ':***@')})` : 'local';
run(dumpCmd, `Dump ${target} database → ${outputFile}`);

console.log(`\n✔ Backup complete: ${outputFile}`);
console.log('  Keep this file secure — it may contain sensitive data.');
console.log('  Never commit backups/ to git.');
