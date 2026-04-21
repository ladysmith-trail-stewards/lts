#!/usr/bin/env node
/**
 * extract-db-schema-view.js
 *
 * Dumps a local Supabase schema snapshot for AI + human debugging.
 * Includes the full SQL definition for tables, views, indexes, policies,
 * grants, and RPCs (functions) in the selected schema.
 *
 * Usage:
 *   node scripts/extract-db-schema-view.js
 *   pnpm db:schema-view
 *
 * Requires:
 *   - Local Supabase running (`pnpm db:start`)
 */

import { execFileSync } from 'child_process';
import { writeFileSync, readFileSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const __dirname = dirname(fileURLToPath(import.meta.url));

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .option('schema', {
    type: 'string',
    default: 'public',
    description: 'Schema to dump from local Supabase',
  })
  .option('out', {
    type: 'string',
    default: 'supabase/SCHEMA_VIEW.sql',
    description: 'Output SQL file path (relative to repo root)',
  })
  .help().argv;

function runCommand(command, args, label, { allowFailure = false } = {}) {
  console.log(`\n▶ ${label}`);
  try {
    return execFileSync(command, args, { encoding: 'utf8' });
  } catch (error) {
    if (allowFailure) {
      return `${error.stdout ?? ''}\n${error.stderr ?? ''}`.trim();
    }
    console.error(`\n✖ Failed: ${label}`);
    const details = `${error.stdout ?? ''}\n${error.stderr ?? ''}`.trim();
    if (details) console.error(details);
    process.exit(1);
  }
}

function resolveSupabaseRunner() {
  try {
    execFileSync('supabase', ['--version'], { stdio: 'ignore' });
    return { command: 'supabase', prefix: [] };
  } catch {
    try {
      execFileSync('pnpm', ['--version'], { stdio: 'ignore' });
      return { command: 'pnpm', prefix: ['exec', 'supabase'] };
    } catch {
      console.error(
        '✖ Supabase CLI not found. Install dependencies with `pnpm install`.'
      );
      process.exit(1);
    }
  }
}

function checkSupabaseRunning() {
  const out = runCommand(
    SUPABASE_RUNNER.command,
    [...SUPABASE_RUNNER.prefix, 'status'],
    'Check local Supabase status',
    { allowFailure: true }
  );

  if (!out.includes('is running')) {
    console.error(
      '✖ Local Supabase is not running. Start it first: pnpm db:start'
    );
    process.exit(1);
  }
}

const SUPABASE_RUNNER = resolveSupabaseRunner();
const outPath = resolve(__dirname, '..', argv.out);
const tempPath = resolve(__dirname, '../supabase/.schema-view.tmp.sql');

checkSupabaseRunning();

runCommand(
  SUPABASE_RUNNER.command,
  [
    ...SUPABASE_RUNNER.prefix,
    'db',
    'dump',
    '--local',
    '--schema',
    argv.schema,
    '--file',
    tempPath,
  ],
  `Dump ${argv.schema} schema from local Supabase`
);

const raw = readFileSync(tempPath, 'utf8');

const generatedAt = new Date().toISOString();
const header = `-- SCHEMA VIEW (LLM-friendly local snapshot)
-- Auto-generated. Re-run: pnpm db:schema-view
-- Generated at ${generatedAt}
-- Source: supabase db dump --local --schema ${argv.schema}
-- Includes schema objects needed for debugging RLS access decisions:
--   tables, views, indexes, policies, grants, RPCs (functions)
-- Note: PostGIS-specific objects may appear and can be ignored.

`;

writeFileSync(outPath, header + raw, 'utf8');
rmSync(tempPath, { force: true });

console.log(`\n✔ Written schema snapshot → ${outPath}`);
