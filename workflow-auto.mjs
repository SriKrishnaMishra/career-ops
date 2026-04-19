#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

const arg = process.argv[2];
let topN = Number.isFinite(Number(arg)) ? Math.max(1, Number(arg)) : 10;

if ((arg || '').toLowerCase() === 'all') {
  const pipelinePath = 'data/pipeline.md';
  if (existsSync(pipelinePath)) {
    const text = readFileSync(pipelinePath, 'utf-8');
    const total = [...text.matchAll(/^- \[[ x]\] https?:\/\/\S+ \| [^|]+ \| .+$/gm)].length;
    topN = Math.max(1, total);
  }
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' });
}

run('node', ['rank-jobs.mjs']);
run('node', ['generate-application-packs.mjs', String(topN)]);
run('node', ['generate-tailored-resumes.mjs', String(topN)]);
run('node', ['bulk-ats-score.mjs', String(topN)]);
run('node', ['export-tailored-resume-pdfs.mjs', String(topN)]);
run('node', ['next-apply-batch.mjs', String(Math.min(5, topN))]);
run('node', ['followup-reminders.mjs']);
run('node', ['generate-daily-dashboard.mjs']);

console.log(`Workflow complete for top ${topN} roles.`);
