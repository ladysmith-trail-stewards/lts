#!/usr/bin/env node
/*
  Generate ./docs/<branch>-pre-pr.md with deterministic checks and optional LLM review
  Usage:
    node scripts/git-prepr-doc.js --branch my-branch --title "Title" --description "Desc" [--llm] [--llm-output "raw text or path"]

  This script keeps deterministic checks (build/tests/lint/tsc/prettier/secrets) in the main pre-PR doc.
  The LLM review section is optional and non-blocking; raw LLM output can be provided via --llm-output.
*/

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .option('branch', { type: 'string', demandOption: true })
  .option('title', { type: 'string', demandOption: true })
  .option('description', { type: 'string', default: '' })
  .option('issues', { type: 'string', default: '' })
  .option('tests', { type: 'string', default: 'pnpm test' })
  .option('review', { type: 'string', default: '' })
  .option('llm', { type: 'boolean', default: false })
  .option('llm-output', { type: 'string', default: '' })
  .option('max-commits', { type: 'number', default: 20 })
  .help()
  .argv;

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', ...opts }).trim();
  } catch (err) {
    return String((err && err.stdout) || (err && err.stderr) || err.message || '');
  }
}

function searchPattern(pattern, searchPath = '.') {
  // Try ripgrep first, fall back to grep. Keep searches constrained and add a timeout to avoid long scans.
  const timeout = 5000;
  try {
    // Prefer rg if available. Use a silent check to avoid shell error output when rg is missing.
    const hasRg = execSync('command -v rg >/dev/null 2>&1 && echo yes', { encoding: 'utf8' }).trim();
    if (hasRg === 'yes') {
      return execSync(`rg -n "${pattern}" ${searchPath}`, { encoding: 'utf8', timeout }).trim();
    }
  } catch (e) {
    // fallthrough to grep
  }

  // Fallback: avoid searching the entire repository by default. If caller passed '.' we'll restrict
  // to common source folders to prevent long-running grep on node_modules, .git, etc.
  try {
    const safePath = (searchPath === '.' || !searchPath) ? 'src supabase public' : searchPath;
    return execSync(`grep -R --line-number -E "${pattern}" ${safePath}`, { encoding: 'utf8', timeout }).trim();
  } catch (err2) {
    return '';
  }
}

console.log('🔍 Starting deterministic pre-PR analysis...');

const changedFilesRaw = run('git diff main --name-only') || '';
const changedFiles = changedFilesRaw.split('\n').filter(Boolean);
const fileCount = changedFiles.length;

// Secrets scan
const diffContent = run('git diff main -- "!docs" "!scripts" || true');
// Inspect the commit history between main and HEAD. Cap by --max-commits if provided.
const maxCommits = Number(argv['max-commits'] || 0);
let historyContent = '';
if (maxCommits > 0) {
  historyContent = run(`git log main..HEAD --all -n ${maxCommits} -p || true`);
} else {
  historyContent = run('git log main..HEAD --all -p || true');
}
const secretsInDiff = /\b(sk_|pk_test_|VITE_SUPABASE|VITE_MAPBOX)\b/.test(diffContent) ? ['Potential API keys or private keys'] : [];
const secretsInHistory = /\b(sk_|pk_test_|VITE_SUPABASE|VITE_MAPBOX)\b/.test(historyContent) ? ['Potential API keys or private keys'] : [];

// Build
console.log('🔨 Running build (deterministic)...');
let buildStatus = '⚠️ UNKNOWN';
const buildOut = run('pnpm run build 2>&1');
if (buildOut.includes('✓ built') || /built in/.test(buildOut)) buildStatus = '✅ PASS';
else if (buildOut.includes('error') || buildOut.includes('ERR')) buildStatus = '🔴 FAILED';
else buildStatus = '⚠️ WARNING';

// Tests
console.log('🧪 Running tests (deterministic)...');
let testStatus = '⚠️ SKIPPED';
const testOut = run(argv.tests + ' 2>&1', { timeout: 60000 });
if (/\d+ passed/.test(testOut) && !/FAIL/.test(testOut)) testStatus = '✅ PASS';
else if (/FAIL/.test(testOut)) testStatus = '🔴 FAILED';

// Lint / TSC / Prettier
console.log('📝 Linting & Type checks...');
const lintOut = run('pnpm run lint 2>&1');
const lintPass = !/error/.test(lintOut);
const tscOut = run('pnpm tsc --noEmit 2>&1');
const tscPass = !/error/.test(tscOut);
const prettierOut = run('pnpm prettier --check "src/**/*.{js,jsx,ts,tsx,json,css,md}" 2>&1');
const prettierPass = !/files? were found/.test(prettierOut) && !/error/.test(prettierOut);

// Dependency changes
const depsDiff = run('git diff main -- "package.json" "pnpm-lock.yaml" | head -20');
const depsChanged = depsDiff.trim() !== '';

// Heuristic LLM-focused scans
console.log('🔎 Running heuristic scans for LLM review areas...');
const srcFiles = run('git ls-files "src/**/*.{ts,tsx,js,jsx}"').split('\n').filter(Boolean);

let varNameFindings = [];
for (const f of srcFiles.slice(0, 200)) {
  try {
    const content = fs.readFileSync(f, 'utf8');
    const matches = content.match(/\b(?:const|let|var)\s+([a-zA-Z])\b/g);
    if (matches && matches.length > 0) varNameFindings.push(`${f}: ${matches.length} short var(s)`);
  } catch (e) {}
}

let unusedFindings = [];
try {
  const esLintUnused = run('pnpm exec eslint "src/**/*.{ts,tsx,js,jsx}" --rule "no-unused-vars: warn" --format json 2>/dev/null');
  if (esLintUnused && esLintUnused.trim().startsWith('[')) unusedFindings.push('ESLint unused-vars may have findings (run locally for details)');
} catch (e) {}

let migrationFindings = [];
const migrationFiles = run('git ls-files supabase/migrations/*.sql').split('\n').filter(Boolean);
for (const m of migrationFiles) {
  try {
    const txt = fs.readFileSync(m, 'utf8');
    if (/GRANT\s+ALL|service_role|SET ROLE|COPY\s+/i.test(txt)) migrationFindings.push(`${m}: suspicious SQL statements`);
  } catch (e) {}
}

let keyFindings = [];
const keyPatterns = ['VITE_SUPABASE', 'VITE_MAPBOX', 'service_role', 'sk_'];
for (const p of keyPatterns) {
  const found = searchPattern(p, '.');
  if (found && found.trim()) keyFindings.push(found.split('\n')[0]);
}

const folders = Array.from(new Set(changedFiles.map(f => f.split('/')[0]).filter(Boolean)));
const scopeScore = folders.length;

let supabaseAuthFindings = [];
const supabaseCallsRaw = searchPattern('supabase\\.', 'src');
const supabaseCalls = supabaseCallsRaw ? supabaseCallsRaw.split('\n').filter(Boolean) : [];
for (const line of supabaseCalls.slice(0, 200)) {
  if (!/RequireAuth|RequireAdmin/.test(line)) supabaseAuthFindings.push(line);
}

let duplicateFindings = [];
const funcNames = {};
for (const f of srcFiles.slice(0, 200)) {
  try {
    const txt = fs.readFileSync(f, 'utf8');
    const names = txt.match(/function\s+([a-zA-Z0-9_]+)/g) || [];
    for (const n of names) {
      const nm = n.replace('function ', '');
      funcNames[nm] = (funcNames[nm] || 0) + 1;
    }
  } catch (e) {}
}
for (const [k, v] of Object.entries(funcNames)) if (v > 1) duplicateFindings.push(`${k}: ${v} occurrences`);

let hookCandidates = [];
for (const f of srcFiles.slice(0, 200)) {
  try {
    const txt = fs.readFileSync(f, 'utf8');
    const count = (txt.match(/useEffect\s*\(/g) || []).length;
    if (count > 1) hookCandidates.push(`${f}: ${count} useEffect(s)`);
  } catch (e) {}
}

const autoReview = `### 🔍 Automated Pre-PR Review

#### 1️⃣ Git & Security Scan
  - **Branch commits**: ${(() => {
    const total = Number(run('git rev-list --count main..HEAD').trim() || 0);
    return maxCommits > 0 ? `${Math.min(total, maxCommits)} (showing ${Math.min(total, maxCommits)} of ${total})` : `${total}`;
  })()}
- **Files changed**: ${fileCount}
- **Secrets in diff**: ${secretsInDiff.length === 0 ? '✅ None detected' : '🔴 ' + secretsInDiff.join(', ')}
- **Secrets in history**: ${secretsInHistory.length === 0 ? '✅ Clean' : '⚠️ ' + secretsInHistory.join(', ')}

#### 2️⃣ Build & Tests (deterministic)
- **Build status**: ${buildStatus}
- **Test status**: ${testStatus}

#### 3️⃣ Quality Checks
- **Linting (ESLint)**: ${lintPass ? '✅ PASS' : '🔴 ISSUES'}
- **Type checking (TSC)**: ${tscPass ? '✅ PASS' : '🔴 ISSUES'}
- **Formatting (Prettier)**: ${prettierPass ? '✅ PASS' : '⚠️ NEEDS FORMATTING'}
- **Dependencies changed**: ${depsChanged ? '⚠️ CHANGED' : '✅ No changes'}

#### 4️⃣ Heuristic LLM-focused Findings (quick scan)
- Variable name issues: ${varNameFindings.length > 0 ? '\n  - ' + varNameFindings.slice(0,5).join('\n  - ') : 'None detected'}
- Unused artifact hints: ${unusedFindings.length > 0 ? '\n  - ' + unusedFindings.join('\n  - ') : 'None detected'}
- Migration issues: ${migrationFindings.length > 0 ? '\n  - ' + migrationFindings.join('\n  - ') : 'None detected'}
- Key exposure hints: ${keyFindings.length > 0 ? '\n  - ' + keyFindings.join('\n  - ') : 'None detected'}
- Supabase auth heuristics: ${supabaseAuthFindings.length > 0 ? '\n  - ' + supabaseAuthFindings.slice(0,5).join('\n  - ') : 'None detected'}
- Duplicate code hints: ${duplicateFindings.length > 0 ? '\n  - ' + duplicateFindings.slice(0,5).join('\n  - ') : 'None detected'}
- Hook extraction candidates: ${hookCandidates.length > 0 ? '\n  - ' + hookCandidates.slice(0,5).join('\n  - ') : 'None detected'}
- PR scope (folders touched): ${scopeScore} (${folders.join(', ')})

`;

let llmSection = '';
if (argv.llm || argv['llm-output']) {
  const raw = argv['llm-output'] && fs.existsSync(argv['llm-output']) ? fs.readFileSync(argv['llm-output'], 'utf8') : (argv['llm-output'] || '');
  llmSection = `### 🤖 LLM Review (non-blocking)

Focus: variable names, unused artifacts, SQL migration security, key exposure, PR scope, supabase auth, optimization, duplicates, hook extraction.

Raw LLM output:

${raw ? '```\n' + raw + '\n```' : '(no raw LLM output provided)'}
`;
}

const docsDir = path.resolve(process.cwd(), 'docs');
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir);
const filename = path.join(docsDir, `${argv.branch}-pre-pr.md`);

const content = `Branch: ${argv.branch}

## PR Title

${argv.title}

## PR Description

${argv.description}

## Linked issues

${argv.issues}

## LLM Review Summary

${autoReview}

${llmSection}

## Manual validation & test steps

${argv.tests}

## Checklist

- [ ] Code compiles
- [ ] Unit tests pass
- [ ] Integration tests (if applicable) pass
- [ ] No secrets committed
- [ ] RLS/security considerations reviewed

## Notes / Follow-ups

(none yet)
`;

fs.writeFileSync(filename, content, 'utf8');
console.log(`Wrote pre-PR draft: ${filename}`);
 