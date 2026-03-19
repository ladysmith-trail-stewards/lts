#!/usr/bin/env node
// Generate ./docs/<branch>-commits.md summarizing commits and tasks.
// Usage: node scripts/git-commit-doc.js --branch my-branch --commits '[{"id":"abc123","message":"Add file A and tests","tasks":["#5 - Added File A"]}]'

import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .option('branch', { type: 'string', demandOption: true })
  .option('commits', { type: 'string', demandOption: true })
  .help()
  .argv;

const docsDir = path.resolve(process.cwd(), 'docs');
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir);

let commits; 
try {
  commits = JSON.parse(argv.commits);
} catch (e) {
  console.error('Invalid commits JSON');
  process.exit(1);
}

const filename = path.join(docsDir, `${argv.branch}-commits.md`);

let table = `# Commit summary for ${argv.branch}\n\n| Commit | Message (first 60) | Tasks |\n|--------|-------------------|-------|\n`;
for (const c of commits) {
  const short = c.id.slice(0,6);
  const msg = c.message.replace(/\n/g, ' ').slice(0,60);
  const tasks = (c.tasks || []).join(' ; ');
  table += `| ${short} | ${msg} | ${tasks} |\n`;
}

fs.writeFileSync(filename, table, 'utf8');
console.log(`Wrote commit summary: ${filename}`);
