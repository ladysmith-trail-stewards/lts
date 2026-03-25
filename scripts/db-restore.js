#!/usr/bin/env node
/**
 * db-restore.js
 *
 * Restores the database from a SQL dump file produced by db-backup.js.
 * Works against the local Supabase instance or a remote production database.
 *
 * Usage:
 *   node scripts/db-restore.js --file backups/2026-01-01T00-00-00Z.sql   # local
 *   node scripts/db-restore.js --file <path> --db-url <connection-string> # remote
 *   pnpm db:restore -- --file <path>
 *   pnpm db:restore -- --file <path> --db-url <connection-string>
 *
 * Flags:
 *   --file     Path to the SQL dump file to restore (required)
 *   --db-url   PostgreSQL connection string for remote DB (omit to target local)
 *   --yes      Skip the confirmation prompt
 *   --help     Show this help
 *
 * ⚠️  Restoring overwrites existing data. Always take a fresh backup before restoring.
 * ⚠️  The connection string contains credentials — never commit it to git.
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { createInterface } from 'readline';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 --file <path> [options]')
  .option('file', {
    type: 'string',
    demandOption: true,
    description: 'Path to the SQL dump file to restore',
  })
  .option('db-url', {
    type: 'string',
    description: 'PostgreSQL connection string for remote DB (omit to use local)',
  })
  .option('yes', {
    alias: 'y',
    type: 'boolean',
    default: false,
    description: 'Skip confirmation prompt',
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

function checkPsql() {
  const result = spawnSync('psql', ['--version'], { encoding: 'utf8' });
  if (result.error) {
    console.error(
      '✖ psql not found. Install PostgreSQL client tools:\n' +
        '  macOS:  brew install libpq && brew link --force libpq\n' +
        '  Ubuntu: sudo apt install postgresql-client',
    );
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

function getLocalDbUrl() {
  // Default local Supabase DB connection (port set in supabase/config.toml, default 54322)
  try {
    const out = execSync('supabase status 2>&1', { encoding: 'utf8' });
    const match = out.match(/DB URL\s*:\s*(postgresql:\/\/\S+)/i);
    if (match) return match[1];
  } catch {
    // fall through to default
  }
  return 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

checkSupabaseCli();
checkPsql();

const dumpFile = argv.file;
if (!existsSync(dumpFile)) {
  console.error(`✖ Dump file not found: ${dumpFile}`);
  process.exit(1);
}

const isRemote = Boolean(argv['db-url']);

if (!isRemote) {
  checkLocalSupabaseRunning();
}

const dbUrl = isRemote ? argv['db-url'] : getLocalDbUrl();
const safeUrl = dbUrl.replace(/:[^:@]+@/, ':***@');
const target = isRemote ? `remote (${safeUrl})` : 'local';

console.log('\n⚠️  Database restore');
console.log(`   Target : ${target}`);
console.log(`   File   : ${dumpFile}`);
console.log('\n   This will execute all SQL in the dump file against the target database.');
console.log('   Existing data may be overwritten or duplicated depending on the dump type.');

if (!argv.yes) {
  const answer = await confirm('\n   Continue? (yes/no): ');
  if (answer !== 'yes' && answer !== 'y') {
    console.log('\n✖ Aborted.');
    process.exit(0);
  }
}

run(`psql "${dbUrl}" -f "${dumpFile}"`, `Restore ${target} database from ${dumpFile}`);

console.log('\n✔ Restore complete.');
if (!isRemote) {
  console.log('  Run `pnpm db:types` if the schema changed to regenerate database.types.ts.');
}
