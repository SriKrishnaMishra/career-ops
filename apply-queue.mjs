#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

const BATCH_PATH = 'data/next-apply-batch.md';

function parseBatch(md) {
  const rows = [];
  let inTable = false;

  for (const line of md.split('\n')) {
    if (line.startsWith('|') && line.includes('| # | Score | ATS | Priority |')) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith('|')) {
      if (rows.length > 0) break;
      continue;
    }
    if (line.includes('|---')) continue;

    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 8) continue;

    rows.push({
      rank: Number(cols[0]),
      score: Number(cols[1]),
      ats: cols[2],
      priority: cols[3],
      company: cols[4],
      role: cols[5],
      pack: cols[6],
      url: cols[7]
    });
  }

  return rows;
}

function usage() {
  console.log('Usage:');
  console.log('  node apply-queue.mjs                         # show queue');
  console.log('  node apply-queue.mjs show [queueIndex]       # show one role details');
  console.log('  node apply-queue.mjs submit [queueIndex] [status] [notes...]');
  console.log('');
  console.log('Examples:');
  console.log('  node apply-queue.mjs');
  console.log('  node apply-queue.mjs show 1');
  console.log('  node apply-queue.mjs submit 1 submitted');
  console.log('  node apply-queue.mjs submit 2 rejected "not eligible location"');
}

if (!existsSync(BATCH_PATH)) {
  console.error(`Missing ${BATCH_PATH}. Run npm run apply:next first.`);
  process.exit(1);
}

const rows = parseBatch(readFileSync(BATCH_PATH, 'utf-8'));
if (rows.length === 0) {
  console.log('Queue is empty. Run npm run workflow:auto -- 10 first.');
  process.exit(0);
}

const action = (process.argv[2] || 'list').toLowerCase();

function queueRow(idxArg) {
  const idx = Number.isFinite(Number(idxArg)) ? Math.max(1, Number(idxArg)) : 1;
  const row = rows[idx - 1];
  if (!row) {
    console.error(`Queue item ${idx} not found. Queue size: ${rows.length}`);
    process.exit(1);
  }
  return { idx, row };
}

if (action === 'list' || action === 'show' && !process.argv[3]) {
  console.log('Next apply queue:');
  rows.forEach((r, i) => {
    console.log(`${i + 1}. [priority=${r.priority} ats=${r.ats}] ${r.company} | ${r.role}`);
    console.log(`   Pack: ${r.pack}`);
    console.log(`   URL: ${r.url}`);
  });
  console.log('');
  console.log('Submit first item: npm run apply:submit:next -- 1 submitted');
  process.exit(0);
}

if (action === 'show') {
  const { idx, row } = queueRow(process.argv[3]);
  console.log(`Queue item ${idx}`);
  console.log(`Company: ${row.company}`);
  console.log(`Role: ${row.role}`);
  console.log(`ATS: ${row.ats}`);
  console.log(`Priority: ${row.priority}`);
  console.log(`Pack: ${row.pack}`);
  console.log(`URL: ${row.url}`);
  console.log(`Submit command: npm run apply:submit:next -- ${idx} submitted`);
  process.exit(0);
}

if (action === 'submit') {
  const { idx, row } = queueRow(process.argv[3]);
  const status = (process.argv[4] || 'submitted').toLowerCase();
  const notes = process.argv.slice(5);

  execFileSync('node', ['mark-submitted.mjs', row.pack, status, ...notes], { stdio: 'inherit' });
  execFileSync('node', ['next-apply-batch.mjs'], { stdio: 'inherit' });
  execFileSync('node', ['followup-reminders.mjs'], { stdio: 'inherit' });
  execFileSync('node', ['generate-daily-dashboard.mjs'], { stdio: 'inherit' });

  console.log(`Queue item ${idx} processed and dashboard refreshed.`);
  process.exit(0);
}

usage();
process.exit(1);
