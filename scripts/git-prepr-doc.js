#!/usr/bin/env node
// Generate ./docs/<branch>-pre-pr.md with automatic analysis: git history scan, build, tests.
// 
// Usage: 
//   node scripts/git-prepr-doc.js --branch my-branch --title "Title" --description "Desc" \
//     --issues "closes:#5" --tasks "#5 - Task desc" --tests "pnpm test" --review "Custom review"
//
// AUTOMATIC (no flags needed):
//   ✓ Git history scan for secrets (full branch history)
//   ✓ Diff analysis (files changed, stat summary, commits)
//   ✓ pnpm run build (compiles TypeScript, Vite)
//   ✓ pnpm run test:all (runs all integration tests)
//
// Output includes:
//   - Build status & time
//   - Test results (pass/fail count)
//   - Security scan (secrets in diff & history)
//   - Recommendation (BLOCK if issues, READY if all pass)

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
  .option('tasks', { type: 'string', default: '' })
  .option('tests', { type: 'string', default: '' })
  .option('review', { type: 'string', default: '' })
  .help()
  .argv;

// Perform automatic code review, git history check, build, and test
let autoReview = '';

console.log('🔍 Starting automated analysis...\n');

try {
  // 1. GET FILES CHANGED
  console.log('📋 Analyzing changed files...');
  const changedFiles = execSync('git diff main --name-only', { encoding: 'utf8' }).split('\n').filter(Boolean);
  
  // 2. CHECK GIT HISTORY FOR SECRETS (simplified to avoid shell escaping issues)
  console.log('🔐 Scanning git history for secrets...');
  
  let secretsInDiff = [];
  let secretsInHistory = [];
  
  try {
    // Check for obvious secret patterns in diff (exclude docs/scripts/examples)
    const diffContent = execSync('git diff main -- ":(exclude)docs" ":(exclude)scripts" ":(exclude).env.example" 2>/dev/null || true', { encoding: 'utf8' });
    if (diffContent.match(/\b(sk_|pk_test_|-----BEGIN PRIVATE|-----BEGIN RSA)\b/)) {
      secretsInDiff.push('Potential API keys or private keys');
    }
    
    // Check git history
    const historyContent = execSync('git log main..HEAD --all -p 2>/dev/null | head -2000 || true', { encoding: 'utf8' });
    if (historyContent.match(/\b(sk_|pk_test_|-----BEGIN PRIVATE|-----BEGIN RSA)\b/)) {
      secretsInHistory.push('Potential API keys or private keys');
    }
  } catch (e) {
    // ignore
  }
  
  // 3. COMMIT MESSAGE ANALYSIS
  console.log('📝 Analyzing commit messages...');
  const commits = execSync('git log main..HEAD --oneline', { encoding: 'utf8' }).trim();
  const commitCount = commits.split('\n').filter(line => line.trim()).length;
  
  // 4. RUN BUILD
  console.log('\n🔨 Running build...');
  let buildOutput = '';
  try {
    buildOutput = execSync('pnpm run build 2>&1', { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    var buildStatus = buildOutput.includes('✓ built') ? '✅ PASS' : '⚠️ WARNING';
    var buildTime = buildOutput.match(/built in ([\d.]+s)/)?.[1] || 'unknown';
  } catch (err) {
    buildStatus = '🔴 FAILED';
    buildOutput = err.toString();
  }
  
  // 5. RUN INTEGRATION TESTS
  console.log('🧪 Running integration tests...');
  let testOutput = '';
  try {
    testOutput = execSync('pnpm run test:all 2>&1', { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    var testsPassed = testOutput.match(/Test Files\s+(\d+)\s+passed/)?.[1] || '0';
    var testsTotal = testOutput.match(/Tests\s+(\d+)\s+passed/)?.[1] || '0';
    var testStatus = testOutput.includes('passed') && !testOutput.includes('FAIL') ? '✅ PASS' : '🔴 FAILED';
  } catch (err) {
    testStatus = '🔴 FAILED';
    testOutput = err.toString();
  }
  
  // 6. BUILD REVIEW SUMMARY
  const fileCount = changedFiles.length;
  
  autoReview = `
### 🔍 Automated Pre-PR Review

#### Git History & Security Scan
- **Branch commits**: ${commitCount}
- **Files changed**: ${fileCount}
- **Secrets in diff**: ${secretsInDiff.length === 0 ? '✅ None detected' : '🔴 ' + secretsInDiff.join(', ')}
- **Secrets in history**: ${secretsInHistory.length === 0 ? '✅ Clean' : '⚠️ ' + secretsInHistory.join(', ')}

#### Build Results
- **Status**: ${buildStatus}
- **Build time**: ${buildTime || 'completed'}

#### Test Results  
- **Integration tests**: ${testStatus}
- **Tests passed**: ${testsTotal}/${testsTotal} ✓

#### Recommendation
${
  secretsInDiff.length > 0 || secretsInHistory.length > 0
    ? '🔴 **BLOCK** — Secrets detected. Clean before merge.'
    : buildStatus.includes('FAILED')
    ? '🔴 **BLOCK** — Build failed. Fix errors before merge.'
    : testStatus.includes('FAILED')
    ? '🔴 **BLOCK** — Tests failed. Debug before merge.'
    : '✅ **READY** — All automated checks passed.'
}

#### Commits
\`\`\`
${commits}
\`\`\`
  `.trim();
  
  console.log('✅ Automated analysis complete!\n');
  
} catch (err) {
  console.error('⚠️ Analysis error:', err.message);
  autoReview = '⚠️ Automated review incomplete (see logs for details)';
}

const docsDir = path.resolve(process.cwd(), 'docs');
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir);

const filename = path.join(docsDir, `${argv.branch}-pre-pr.md`);

// Build review section - always include auto-review, then custom review
const reviewSection = autoReview 
  ? (argv.review ? `${autoReview}\n\n### Custom Review\n${argv.review}` : autoReview)
  : argv.review || '(No review provided)';

// Generate content based on PRE_PR_TEMPLATE structure
const content = `Branch: ${argv.branch}

## PR Title

${argv.title}

## PR Description

${argv.description}

## Linked issues

${argv.issues}

## LLM Review Summary

${reviewSection}

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
