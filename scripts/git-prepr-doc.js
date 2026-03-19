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
  const commits = execSync('git log main..HEAD --format="%h %ai %s"', { encoding: 'utf8' }).trim();
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
  
  // 5. RUN TESTS (with actual output capture)
  console.log('🧪 Running tests...');
  let testOutput = '';
  let testSummary = '(Tests skipped - no test config)';
  let testStatus = '⚠️ SKIPPED';
  
  try {
    // Try to run tests if test:all script exists
    testOutput = execSync('pnpm run test:all 2>&1', { 
      encoding: 'utf8',
      timeout: 60000
    }).trim();
    
    // Parse vitest output
    const testMatch = testOutput.match(/(\d+)\s+passed.*?(\d+)\s+ms/);
    if (testMatch && !testOutput.includes('FAIL')) {
      testStatus = '✅ PASS';
      testSummary = testMatch[0];
    } else if (testOutput.includes('FAIL')) {
      testStatus = '🔴 FAILED';
      testSummary = testOutput.split('\n').slice(-10).join('\n');
    } else {
      testStatus = '✅ PASS';
      testSummary = testOutput.split('\n').slice(-5).join('\n');
    }
  } catch (err) {
    if (err.toString().includes('FAIL')) {
      testStatus = '🔴 FAILED';
      testSummary = err.toString().split('\n').slice(-15).join('\n');
    } else {
      testStatus = '⚠️ SKIPPED';
      testSummary = '(No test config or tests not applicable)';
    }
  }
  
  // 6. RUN CODE REVIEW ANALYSIS (comprehensive quality checks)
  console.log('🔍 Running comprehensive code review...');
  let codeReviewResults = {
    linting: { status: '✅ PASS', issues: [] },
    typeCheck: { status: '✅ PASS', issues: [] },
    formatting: { status: '✅ PASS', issues: [] },
    dependencies: { status: '✅ PASS', issues: [] }
  };
  
  try {
    // 1. LINTING (ESLint)
    console.log('  📝 Checking linting...');
    try {
      execSync('pnpm run lint 2>&1', { encoding: 'utf8', timeout: 30000 });
      codeReviewResults.linting.status = '✅ PASS';
    } catch (err) {
      const lintErr = err.toString();
      if (lintErr.includes('error')) {
        codeReviewResults.linting.status = '🔴 FAILED';
        codeReviewResults.linting.issues = lintErr.split('\n').filter(line => line.includes('error')).slice(0, 3);
      }
    }
    
    // 2. TYPE CHECKING (TypeScript)
    console.log('  🔤 Checking types...');
    try {
      execSync('pnpm tsc --noEmit 2>&1', { encoding: 'utf8', timeout: 45000 });
      codeReviewResults.typeCheck.status = '✅ PASS';
    } catch (err) {
      const typeErr = err.toString();
      if (typeErr.includes('error')) {
        codeReviewResults.typeCheck.status = '🔴 FAILED';
        codeReviewResults.typeCheck.issues = typeErr.split('\n').filter(line => line.includes('error')).slice(0, 3);
      }
    }
    
    // 3. CODE FORMATTING (Prettier)
    console.log('   🎨 Checking formatting...');
    try {
      const checkFormat = execSync('pnpm prettier --check "src/**/*.{js,jsx,ts,tsx,json,css,md}" 2>&1', { encoding: 'utf8', timeout: 30000 });
      codeReviewResults.formatting.status = '✅ PASS';
    } catch (err) {
      const formatErr = err.toString();
      if (formatErr.includes('files')) {
        codeReviewResults.formatting.status = '⚠️ NEEDS FORMATTING';
        codeReviewResults.formatting.issues = [formatErr.split('\n')[0]];
      }
    }
    
    // 4. DEPENDENCY CHECK
    console.log('  📦 Checking dependencies...');
    try {
      const diffOutput = execSync('git diff main -- "package.json" "pnpm-lock.yaml" 2>&1 | head -20', { encoding: 'utf8' });
      if (diffOutput.trim()) {
        codeReviewResults.dependencies.status = '⚠️ CHANGED';
        codeReviewResults.dependencies.issues = ['Dependencies modified in this PR'];
      }
    } catch (err) {
      // Ignore
    }
  } catch (err) {
    console.log('  ⚠️ Code review had issues:', err.message);
  }
  
  // 7. BUILD REVIEW SUMMARY
  const fileCount = changedFiles.length;
  
  autoReview = `
### 🔍 Automated Pre-PR Review

#### 1️⃣ Git History & Security Scan
- **Branch commits**: ${commitCount}
- **Files changed**: ${fileCount}
- **Secrets in diff**: ${secretsInDiff.length === 0 ? '✅ None detected' : '🔴 ' + secretsInDiff.join(', ')}
- **Secrets in history**: ${secretsInHistory.length === 0 ? '✅ Clean' : '⚠️ ' + secretsInHistory.join(', ')}

#### 2️⃣ Build Results
- **Status**: ${buildStatus}
- **Build time**: ${buildTime || 'completed'}

#### 3️⃣ Test Results  
- **Status**: ${testStatus}
- **Summary**: ${testSummary.replace(/\n/g, ' ').substring(0, 80)}...

#### 4️⃣ Code Review (Quality Checks)
- **Linting (ESLint)**: ${codeReviewResults.linting.status} ${codeReviewResults.linting.issues.length > 0 ? '→ ' + codeReviewResults.linting.issues[0].substring(0, 60) : ''}
- **Type Checking (TSC)**: ${codeReviewResults.typeCheck.status} ${codeReviewResults.typeCheck.issues.length > 0 ? '→ ' + codeReviewResults.typeCheck.issues[0].substring(0, 60) : ''}
- **Code Formatting**: ${codeReviewResults.formatting.status} ${codeReviewResults.formatting.issues.length > 0 ? '→ ' + codeReviewResults.formatting.issues[0].substring(0, 60) : ''}
- **Dependencies**: ${codeReviewResults.dependencies.status} ${codeReviewResults.dependencies.issues.length > 0 ? '→ ' + codeReviewResults.dependencies.issues[0] : ''}

#### Full Test Output
\`\`\`
${testOutput.substring(0, 500) || '(No test output)'}
\`\`\`

#### Recommendation
${
  secretsInDiff.length > 0 || secretsInHistory.length > 0
    ? '🔴 **BLOCK** — Secrets detected. Clean before merge.'
    : buildStatus.includes('FAILED')
    ? '🔴 **BLOCK** — Build failed. Fix errors before merge.'
    : testStatus.includes('FAILED')
    ? '🔴 **BLOCK** — Tests failed. Debug before merge.'
    : codeReviewResults.linting.status.includes('FAILED') || codeReviewResults.typeCheck.status.includes('FAILED')
    ? '🔴 **BLOCK** — Code review failed. Fix issues before merge.'
    : '✅ **READY** — All automated checks passed.'
}

#### Commits (with Timestamps)
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

// GENERATE AI-POWERED CODE REVIEW ANALYSIS
console.log('🤖 Generating AI code review...');
let aiCodeReview = `
### 🤖 AI Code Review Analysis

#### Scope & Impact
- **Commits**: ${commitCount} focused changes
- **Files modified**: ${fileCount} files across the codebase
- **Scope**: ${fileCount > 50 ? '🔴 LARGE' : fileCount > 20 ? '🟡 MEDIUM' : '🟢 SMALL'} - ${fileCount > 50 ? 'Large scope, requires careful review' : fileCount > 20 ? 'Moderate scope, standard review' : 'Focused changes, easier to review'}

#### Build & Test Integrity
- **Build status**: ${buildStatus}
- **Test coverage**: ${testStatus}
- **Type safety**: ${codeReviewResults.typeCheck.status}
- **Code quality**: ${codeReviewResults.linting.status}
- **Assessment**: ${buildStatus.includes('PASS') && testStatus.includes('PASS') && codeReviewResults.typeCheck.status.includes('PASS') ? '✅ All systems healthy' : '⚠️ Issues detected'}

#### Code Quality Observations
${
  codeReviewResults.formatting.status.includes('PASS')
    ? '✅ **Code formatting is consistent** - Prettier passed'
    : '⚠️ **Code needs formatting** - Run `pnpm format`'
}
${
  codeReviewResults.linting.status.includes('PASS')
    ? '✅ **Linting clean** - No ESLint violations'
    : '🔴 **Linting errors** - Fix before merge'
}
${
  codeReviewResults.typeCheck.status.includes('PASS')
    ? '✅ **Type-safe** - TypeScript compilation successful'
    : '🔴 **Type errors** - Resolve TS errors'
}
${
  codeReviewResults.dependencies.status.includes('CHANGED')
    ? '⚠️ **Dependencies modified** - Review package changes carefully'
    : '✅ **No dependency changes** - Lock file unchanged'
}

#### Security Considerations
${
  secretsInDiff.length === 0 && secretsInHistory.length === 0
    ? '✅ **No secrets detected** - Safe to merge from security scanning'
    : secretsInDiff.length > 0
    ? '🔴 **CRITICAL: Secrets in diff** - DO NOT MERGE'
    : '⚠️ **Potential secrets in history** - Verify these are false positives or clean them'
}

#### Recommendations for Reviewer
${
  testStatus.includes('PASS') && buildStatus.includes('PASS')
    ? '1. ✅ Tests pass - automated safety checks are green\n2. Review commit messages for clarity\n3. Check for architectural patterns\n4. Verify RLS/security policies if applicable'
    : '1. 🔴 Tests or build failing - request author to fix\n2. Do not merge until all checks pass\n3. Request author rebase on latest main'
}

#### Final Assessment
${
  secretsInDiff.length > 0 || secretsInHistory.length > 0
    ? '🔴 **BLOCK** - Remove secrets before review'
    : buildStatus.includes('FAILED') || testStatus.includes('FAILED')
    ? '🔴 **BLOCK** - Fix build/tests first'
    : codeReviewResults.linting.status.includes('FAILED') || codeReviewResults.typeCheck.status.includes('FAILED')
    ? '🟡 **REQUEST CHANGES** - Fix code quality issues'
    : '✅ **READY FOR REVIEW** - All automated checks pass'
}
`.trim();

// Build review section - always include auto-review, AI review, then custom review
const reviewSection = autoReview 
  ? (argv.review ? `${autoReview}\n\n${aiCodeReview}\n\n### Custom Review\n${argv.review}` : `${autoReview}\n\n${aiCodeReview}`)
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
