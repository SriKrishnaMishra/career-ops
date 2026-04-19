#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';

const BATCH_PATH = 'data/next-apply-batch.md';
const BULK_PATH = 'data/ats-scores/BULK.md';
const OUTPUT_PATH = 'data/daily-dashboard.md';

function parseTable(md, headerHint) {
  const rows = [];
  let active = false;
  for (const line of md.split('\n')) {
    if (line.startsWith('|') && line.includes(headerHint)) {
      active = true;
      continue;
    }
    if (!active) continue;
    if (!line.startsWith('|')) {
      if (rows.length > 0) break;
      continue;
    }
    if (line.includes('|---')) continue;

    const cols = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cols.length > 0) rows.push(cols);
  }
  return rows;
}

function parseNextBatch(md) {
  const table = parseTable(md, '| # | Score | ATS | Priority |');
  return table.map((c) => ({
    rank: Number(c[0]),
    score: Number(c[1]),
    ats: c[2],
    priority: c[3],
    company: c[4],
    role: c[5],
    pack: c[6],
    url: c[7]
  }));
}

function parseBulk(md) {
  const table = parseTable(md, '| Rank | ATS | Band | RankScore | Priority |');
  return table.map((c) => ({
    rank: Number(c[0]),
    ats: c[1],
    band: c[2],
    rankScore: c[3],
    priority: c[4],
    company: c[5],
    role: c[6],
    resume: c[7],
    pack: c[8]
  }));
}

function pdfFromPackPath(packPath) {
  const name = (packPath || '').split('/').pop()?.replace(/\.md$/i, '') || '';
  return name ? `output/role-resumes/${name}.pdf` : '';
}

const today = new Date().toISOString().slice(0, 10);
const batchRows = existsSync(BATCH_PATH) ? parseNextBatch(readFileSync(BATCH_PATH, 'utf-8')) : [];
const bulkRows = existsSync(BULK_PATH) ? parseBulk(readFileSync(BULK_PATH, 'utf-8')) : [];

const lines = [];
lines.push(`# Daily Job Dashboard (${today})`);
lines.push('');
lines.push('## Top Apply Queue (ATS + Rank Priority)');
lines.push('');

if (batchRows.length === 0) {
  lines.push('- No queued roles found. Run npm run workflow:auto -- 10 first.');
} else {
  lines.push('| Rank | Score | ATS | Priority | Company | Role | Pack |');
  lines.push('|---:|---:|---:|---:|---|---|---|');
  for (const r of batchRows) {
    lines.push(`| ${r.rank} | ${r.score} | ${r.ats} | ${r.priority} | ${r.company} | ${r.role.replace(/\|/g, '/')} | ${r.pack} |`);
  }
}

lines.push('');
lines.push('## PDF Files To Upload Today');
lines.push('');
if (batchRows.length === 0) {
  lines.push('- No PDFs yet.');
} else {
  for (const r of batchRows) {
    const pdf = pdfFromPackPath(r.pack);
    lines.push(`- ${pdf}`);
  }
}

lines.push('');
lines.push('## ATS Leaderboard');
lines.push('');
if (bulkRows.length === 0) {
  lines.push('- No ATS leaderboard found. Run npm run ats:bulk -- 10.');
} else {
  lines.push('| Rank | ATS | Band | Priority | Company | Role |');
  lines.push('|---:|---:|---|---:|---|---|');
  for (const r of bulkRows.slice(0, 10)) {
    lines.push(`| ${r.rank} | ${r.ats} | ${r.band} | ${r.priority} | ${r.company} | ${r.role.replace(/\|/g, '/')} |`);
  }
}

lines.push('');
lines.push('## Apply Checklist');
lines.push('');
lines.push('- Fast mode: npm run apply:guided');
lines.push('- Browser UI: npm run extension:serve, then load chrome-extension/ in Chrome');
lines.push('- Auto-skip low-priority (default): priority < 55');
lines.push('- Tune threshold: npm run apply:guided -- --min-priority 45');
lines.push('- Hotkeys in guided mode: Enter=submitted, k=skip, r=rejected, o=open, q=quit');
lines.push('');
if (batchRows.length === 0) {
  lines.push('- [ ] Run workflow: npm run workflow:auto -- 10');
} else {
  for (const [i, r] of batchRows.entries()) {
    const pdf = pdfFromPackPath(r.pack);
    lines.push(`- [ ] ${r.company} - ${r.role}`);
    lines.push(`  Queue: ${i + 1}`);
    lines.push(`  Pack: ${r.pack}`);
    lines.push(`  PDF: ${pdf}`);
    lines.push(`  URL: ${r.url}`);
    lines.push(`  Submit log: npm run apply:submit:next -- ${i + 1} submitted`);
  }
}

writeFileSync(OUTPUT_PATH, lines.join('\n') + '\n', 'utf-8');
console.log(`Wrote ${OUTPUT_PATH}`);
