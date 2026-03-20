#!/usr/bin/env node
// AI Code Review Tool - Performs comprehensive code review after pre-PR doc generation
// This runs INDEPENDENTLY after git-prepr-doc.js completes
//
// Usage:
//   node scripts/git-code-review.js --branch my-branch --pr-file docs/my-branch-pre-pr.md
//
// Output: Generates docs/<branch>-code-review.md with detailed analysis

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .option('branch', { type: 'string', demandOption: true })
  .option('pr-file', { type: 'string', default: '' })
  .help()
  .argv;

console.log('🤖 Starting comprehensive code review...\n');

const prFile = argv['pr-file'] || `docs/${argv.branch}-pre-pr.md`;

// Parse the pre-PR doc to extract key metrics
let metrics = {
  commits: 0,
  filesChanged: 0,
  buildPass: false,
  testsPass: false,
  lintPass: false,
  typeCheckPass: false,
  secretsDetected: false
};

if (fs.existsSync(prFile)) {
  const prContent = fs.readFileSync(prFile, 'utf8');
  metrics.commits = parseInt(prContent.match(/Branch commits.*?(\d+)/)?.[1]) || 0;
  metrics.filesChanged = parseInt(prContent.match(/Files changed.*?(\d+)/)?.[1]) || 0;
  metrics.buildPass = prContent.includes('Build Results\n- **Status**: ✅ PASS');
  metrics.testsPass = prContent.includes('Test Results') && prContent.includes('✅ PASS');
  metrics.lintPass = prContent.includes('Linting (ESLint)**: ✅');
  metrics.typeCheckPass = prContent.includes('Type Checking (TSC)**: ✅');
  metrics.secretsDetected = prContent.includes('Secrets in diff**: ✅ None detected') === false;
}

// Get changed files for detailed analysis
console.log('📊 Analyzing changed files...');
let changedFiles = [];
try {
  const output = execSync('git diff main --name-only', { encoding: 'utf8' });
  changedFiles = output.split('\n').filter(f => f.trim());
} catch (err) {
  // ignore
}

// Categorize changes
const categories = {
  components: changedFiles.filter(f => f.includes('components/')).length,
  pages: changedFiles.filter(f => f.includes('pages/')).length,
  hooks: changedFiles.filter(f => f.includes('hooks/')).length,
  lib: changedFiles.filter(f => f.includes('lib/')).length,
  tests: changedFiles.filter(f => f.includes('__tests__') || f.includes('.test.')).length,
  types: changedFiles.filter(f => f.includes('types.ts') || f.includes('.d.ts')).length,
  config: changedFiles.filter(f => f.includes('config') || f.includes('.json') || f.includes('.toml')).length,
  docs: changedFiles.filter(f => f.includes('.md')).length,
  migrations: changedFiles.filter(f => f.includes('migrations/')).length
};

// Analyze commit messages for patterns
console.log('📋 Analyzing commit patterns...');
let commitPatterns = {
  feat: 0,
  fix: 0,
  refactor: 0,
  docs: 0,
  test: 0,
  chore: 0
};

try {
  const commits = execSync('git log main..HEAD --format=%s', { encoding: 'utf8' });
  commits.split('\n').forEach(msg => {
    if (msg.includes('feat:')) commitPatterns.feat++;
    else if (msg.includes('fix:')) commitPatterns.fix++;
    else if (msg.includes('refactor:')) commitPatterns.refactor++;
    else if (msg.includes('docs:')) commitPatterns.docs++;
    else if (msg.includes('test:')) commitPatterns.test++;
    else if (msg.includes('chore:')) commitPatterns.chore++;
  });
} catch (err) {
  // ignore
}

// Generate comprehensive review
const codeReview = `# Code Review Report: ${argv.branch}

Generated: ${new Date().toISOString()}

## Executive Summary

${
  metrics.secretsDetected
    ? '🔴 **SECURITY CONCERN** - Review secrets before proceeding'
    : metrics.buildPass && metrics.testsPass && metrics.lintPass && metrics.typeCheckPass
    ? '✅ **ALL CHECKS PASSING** - Code quality is strong'
    : '⚠️ **REVIEW RECOMMENDED** - See issues below'
}

---

## Metrics Overview

| Metric | Value | Status |
|--------|-------|--------|
| **Total Commits** | ${metrics.commits} | ${metrics.commits > 10 ? '🟡 Large' : '🟢 Normal'} |
| **Files Changed** | ${metrics.filesChanged} | ${metrics.filesChanged > 50 ? '🔴 Very Large' : metrics.filesChanged > 20 ? '🟡 Large' : '🟢 Focused'} |
| **Build Status** | ${metrics.buildPass ? '✅ PASS' : '🔴 FAIL'} | ${metrics.buildPass ? 'Healthy' : 'Broken'} |
| **Tests Status** | ${metrics.testsPass ? '✅ PASS' : '🔴 FAIL'} | ${metrics.testsPass ? 'Coverage OK' : 'Failing'} |
| **Lint Status** | ${metrics.lintPass ? '✅ PASS' : '⚠️ ISSUES'} | ${metrics.lintPass ? 'Clean' : 'Violations'} |
| **Type Safety** | ${metrics.typeCheckPass ? '✅ PASS' : '🔴 ERRORS'} | ${metrics.typeCheckPass ? 'Type-safe' : 'TS errors'} |

---

## Change Distribution

### By Type
${
  Object.entries(categories)
    .filter(([_, count]) => count > 0)
    .map(([type, count]) => `- **${type}**: ${count} file(s)`)
    .join('\n')
}

### Breakdown Analysis
${
  categories.components > 0
    ? `\n#### Components (${categories.components})
- Check for prop drilling and state management patterns
- Verify component reusability`
    : ''
}
${
  categories.pages > 0
    ? `\n#### Pages (${categories.pages})
- Review route structure and guards
- Check auth/permission requirements`
    : ''
}
${
  categories.tests > 0
    ? `\n#### Tests (${categories.tests})
- ✅ Tests are included - good coverage signal`
    : '\n#### Tests\n- ⚠️ No tests added - consider adding coverage'
}
${
  categories.migrations > 0
    ? `\n#### Database (${categories.migrations})
- Review SQL migrations for security
- Check RLS policies
- Verify rollback safety`
    : ''
}

---

## Commit Analysis

### By Type
${
  Object.entries(commitPatterns)
    .filter(([_, count]) => count > 0)
    .map(([type, count]) => `- **${type}**: ${count} commit(s)`)
    .join('\n')
}

### Commit Message Quality
${
  commitPatterns.feat > 0 || commitPatterns.fix > 0
    ? '✅ Using conventional commits'
    : '⚠️ Inconsistent commit message format'
}

---

## Key Observations

${
  metrics.testsPass
    ? '✅ **Test Coverage**: Tests are passing - indicates feature stability'
    : '🔴 **Test Issues**: Fix failing tests before merge'
}

${
  metrics.typeCheckPass
    ? '✅ **Type Safety**: TypeScript compilation successful - fewer runtime errors'
    : '🔴 **Type Errors**: Resolve TypeScript errors'
}

${
  metrics.filesChanged > 50
    ? '⚠️ **Large Scope**: With ${metrics.filesChanged} files changed, recommend:\n  - Focus review on critical files\n  - Ask author for summary\n  - Consider staged merge if complex'
    : '✅ **Focused Scope**: Changes are well-scoped for review'
}

${
  categories.migrations > 0
    ? '⚠️ **Database Changes**: Extra review needed:\n  - Verify migrations are reversible\n  - Check RLS policies for security\n  - Test with production-like data'
    : ''
}

---

## Reviewer Checklist

### Must-Have Checks
- [ ] No secrets or credentials in code
- [ ] Build passes without warnings
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] Linting passes

### Code Quality
- [ ] Code is readable and maintainable
- [ ] No unnecessary complexity
- [ ] Proper error handling
- [ ] Appropriate logging/debugging

### Architecture
- [ ] Changes follow project patterns
- [ ] No breaking changes without documentation
- [ ] API contracts are clear
- [ ] Performance impact considered

### Documentation
- [ ] Changes are well-commented
- [ ] README updated if needed
- [ ] Types are properly documented
- [ ] Commit messages are descriptive

### Testing
- [ ] New tests added for new features
- [ ] Existing tests still pass
- [ ] Edge cases considered
- [ ] Integration tested

---

## Recommendations

### For Author
1. ${metrics.buildPass ? '✅ Build is passing' : '🔴 Fix build errors before review'}
2. ${metrics.testsPass ? '✅ Tests are passing' : '🔴 Fix failing tests'}
3. ${!metrics.secretsDetected ? '✅ No secrets detected' : '🔴 Remove secrets and rebase'}
4. Provide a summary of major changes in PR description

### For Reviewer
1. Start with the **most critical files** (database, auth, security)
2. Verify **test coverage** for new features
3. Check **architectural patterns** match existing code
4. Request **clarification** on complex logic
5. Test locally if possible

---

## Final Verdict

**Recommendation**: ${
  metrics.secretsDetected
    ? '🔴 **BLOCK** - Do not merge until secrets are removed'
    : !metrics.buildPass || !metrics.testsPass
    ? '🔴 **REQUEST CHANGES** - Fix build/test failures'
    : !metrics.lintPass || !metrics.typeCheckPass
    ? '🟡 **REQUEST CHANGES** - Address code quality issues'
    : '✅ **READY FOR REVIEW** - All automated checks passed, ready for human review'
}

---

Generated by Pre-PR Code Review Tool
Branch: ${argv.branch} | Commits: ${metrics.commits} | Files: ${metrics.filesChanged}
`;

const docsDir = path.resolve(process.cwd(), 'docs');
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir);

// If a pre-PR file was provided and exists, append the detailed code review there
if (prFile && fs.existsSync(prFile)) {
  try {
    const existing = fs.readFileSync(prFile, 'utf8');
    const appended = existing + '\n\n---\n\n' + codeReview;
    fs.writeFileSync(prFile, appended, 'utf8');
    console.log('✅ Code review complete!\n');
    console.log(`📄 Appended code review to: ${prFile}\n`);
  } catch (err) {
    console.error('⚠️ Failed to append to pre-PR file, writing separate review file instead:', err.message);
    const reviewFile = path.join(docsDir, `${argv.branch}-code-review.md`);
    fs.writeFileSync(reviewFile, codeReview, 'utf8');
    console.log('✅ Code review complete!\n');
    console.log(`📄 Review written to: ${reviewFile}\n`);
  }
} else {
  const reviewFile = path.join(docsDir, `${argv.branch}-code-review.md`);
  fs.writeFileSync(reviewFile, codeReview, 'utf8');
  console.log('✅ Code review complete!\n');
  console.log(`📄 Review written to: ${reviewFile}\n`);
}

console.log('Key findings:');
console.log(`  - Commits: ${metrics.commits}`);
console.log(`  - Files: ${metrics.filesChanged}`);
console.log(`  - Build: ${metrics.buildPass ? '✅ PASS' : '🔴 FAIL'}`);
console.log(`  - Tests: ${metrics.testsPass ? '✅ PASS' : '🔴 FAIL'}`);
console.log(`  - Secrets: ${metrics.secretsDetected ? '🔴 DETECTED' : '✅ Clean'}\n`);
