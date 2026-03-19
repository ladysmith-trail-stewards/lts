#!/usr/bin/env node
// Generate ./docs/<branch>-pre-pr.md from metadata.
// Usage: node scripts/git-prepr-doc.js --branch my-branch --title "Title" --description "Desc" --issues "closes:#5,touches:#12" --tasks "#5 - Added File A; #6 - Updated API" --tests "pnpm test" --review "LLM summary"

import fs from 'fs';
import path from 'path';
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

const docsDir = path.resolve(process.cwd(), 'docs');
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir);

const filename = path.join(docsDir, `${argv.branch}-pre-pr.md`);

const content = `# Pre-PR Draft for ${argv.branch}\n\n## PR Title\n\n${argv.title}\n\n## PR Description\n\n${argv.description}\n\n## Linked issues\n\n${argv.issues}\n\n## Tasks this PR addresses\n\n${argv.tasks}\n\n## LLM Review Summary\n\n${argv.review}\n\n## Manual validation & test steps\n\n${argv.tests}\n\n## Checklist\n\n- [ ] Code compiles\n- [ ] Unit tests pass\n- [ ] Integration tests pass\n- [ ] No secrets committed\n- [ ] RLS/security considerations reviewed\n\n`;

fs.writeFileSync(filename, content, 'utf8');
console.log(`Wrote pre-PR draft: ${filename}`);
