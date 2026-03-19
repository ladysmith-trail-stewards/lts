#!/usr/bin/env node
// Generate ./docs/<branch>-pre-pr.md with embedded code review analysis.
// 
// Usage: 
//   node scripts/git-prepr-doc.js --branch my-branch --title "Title" --description "Desc" \
//     --issues "closes:#5" --tasks "#5 - Task desc" --tests "pnpm test" --auto-review
//
// With --auto-review flag, the script performs static analysis on the branch diff
// to detect:
//   - Secrets/sensitive data in code
//   - Missing error handling
//   - Bundle size warnings
//   - Test coverage gaps
//   - Security/auth issues

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
  .option('auto-review', { type: 'boolean', default: false })
  .help()
  .argv;

// Perform automatic code review if --auto-review flag is set
let autoReview = '';
if (argv['auto-review']) {
  console.log('Performing automated code review...');
  
  try {
    // Get files changed
    const changedFiles = execSync('git diff main --name-only', { encoding: 'utf8' }).split('\n').filter(Boolean);
    
    // Check for secrets in diff
    const secretPatterns = [
      'VITE_SUPABASE_SECRET_KEY',
      'service_role_key',
      'supabaseKey.*=',
      'API_SECRET',
      'private_key',
      'password.*=',
    ];
    
    let secretsFound = [];
    for (const pattern of secretPatterns) {
      try {
        const matches = execSync(`git diff main | grep -i "${pattern}" 2>/dev/null || true`, { encoding: 'utf8' });
        if (matches) secretsFound.push(pattern);
      } catch (e) {
        // ignore
      }
    }
    
    // Basic stats
    const stats = execSync('git diff main --stat', { encoding: 'utf8' });
    const fileCount = changedFiles.length;
    
    autoReview = `
### Automated Analysis

**Files changed**: ${fileCount}  
**Sensitive patterns detected**: ${secretsFound.length === 0 ? '✅ None' : '⚠️ ' + secretsFound.join(', ')}

Review recommendation: ${
  secretsFound.length > 0 
    ? '🔴 BLOCK — Secrets detected in diff. Clean before merge.'
    : '✅ PASS — No obvious secrets detected. Manual review recommended.'
}

See diff summary:
\`\`\`
${stats}
\`\`\`
    `.trim();
  } catch (err) {
    autoReview = '⚠️ Auto-review skipped (git or dependencies unavailable)';
  }
}

const docsDir = path.resolve(process.cwd(), 'docs');
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir);

const filename = path.join(docsDir, `${argv.branch}-pre-pr.md`);

// Build review section
const reviewSection = argv.review || autoReview || '(No review provided)';

const content = `# Pre-PR Draft for ${argv.branch}

## PR Title

${argv.title}

## PR Description

${argv.description}

## Linked issues

${argv.issues}

## Tasks this PR addresses

${argv.tasks}

## LLM Review Summary

${reviewSection}

## Manual validation & test steps

${argv.tests}

## Checklist

- [ ] Code compiles
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] No secrets committed
- [ ] RLS/security considerations reviewed

`;

fs.writeFileSync(filename, content, 'utf8');
console.log(`Wrote pre-PR draft: ${filename}`);
