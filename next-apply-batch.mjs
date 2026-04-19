#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';

const INDEX_PATH = 'data/application-packs/INDEX.md';
const BULK_ATS_PATH = 'data/ats-scores/BULK.md';
const SUBMISSIONS_PATH = 'data/submissions.tsv';
const OUTPUT_PATH = 'data/next-apply-batch.md';

const n = Number.isFinite(Number(process.argv[2])) ? Math.max(1, Number(process.argv[2])) : 5;

if (!existsSync(INDEX_PATH)) {
  console.error(`Missing ${INDEX_PATH}. Run npm run apply:packs first.`);
  process.exit(1);
}

function loadSubmittedUrls() {
  if (!existsSync(SUBMISSIONS_PATH)) return new Set();
  return new Set(
    readFileSync(SUBMISSIONS_PATH, 'utf-8')
      .trim()
      .split('\n')
      .slice(1)
      .map(l => l.split('\t')[3])
      .filter(Boolean)
  );
}

function parseIndex(md) {
  const rows = [];
  const lines = md.split('\n');
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    if (line.includes('|---')) continue;
    if (line.includes('| # | Score | Company |')) continue;
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 5) continue;
    const rank = Number(cols[0]);
    const score = Number(cols[1]);
    const company = cols[2];
    const role = cols[3];
    const pack = cols[4];
    if (!Number.isFinite(rank) || !Number.isFinite(score)) continue;
    rows.push({ rank, score, company, role, pack });
  }
  return rows;
}

function parseBulkAts(md) {
  const map = new Map();
  const lines = md.split('\n');
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    if (line.includes('|---')) continue;
    if (line.includes('| Rank | ATS | Band |')) continue;

    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 9) continue;

    const rank = Number(cols[0]);
    const ats = Number(cols[1]);
    const band = cols[2];
    const rankScore = Number(cols[3]);
    const priority = Number(cols[4]);
    const pack = cols[8];
    if (!pack) continue;

    map.set(pack, {
      rank,
      ats: Number.isFinite(ats) ? ats : null,
      band,
      rankScore: Number.isFinite(rankScore) ? rankScore : null,
      priority: Number.isFinite(priority) ? priority : null
    });
  }
  return map;
}

function getPackUrl(packPath) {
  if (!existsSync(packPath)) return '';
  const txt = readFileSync(packPath, 'utf-8');
  return txt.match(/- URL:\s*(https?:\/\/\S+)/)?.[1] || '';
}

const submitted = loadSubmittedUrls();
const rows = parseIndex(readFileSync(INDEX_PATH, 'utf-8'));
const atsMap = existsSync(BULK_ATS_PATH)
  ? parseBulkAts(readFileSync(BULK_ATS_PATH, 'utf-8'))
  : new Map();

const candidates = rows
  .map(r => {
    const path = `data/application-packs/${r.pack}`;
    const url = getPackUrl(path);
    const atsMeta = atsMap.get(r.pack) || {};
    return {
      ...r,
      path,
      url,
      alreadySubmitted: submitted.has(url),
      ats: atsMeta.ats,
      band: atsMeta.band || '-',
      rankScore: atsMeta.rankScore,
      priority: atsMeta.priority
    };
  })
  .filter(r => !r.alreadySubmitted)
  .sort((a, b) => {
    const pa = Number.isFinite(a.priority) ? a.priority : -1;
    const pb = Number.isFinite(b.priority) ? b.priority : -1;
    if (pb !== pa) return pb - pa;
    return a.rank - b.rank;
  })
  .slice(0, n);

const out = [];
const today = new Date().toISOString().slice(0, 10);
out.push(`# Next Apply Batch (${today})`);
out.push('');
out.push(`Requested: ${n} roles`);
out.push(`Ready: ${candidates.length} roles`);
out.push('');
out.push('| # | Score | ATS | Priority | Company | Role | Pack | URL |');
out.push('|---|---:|---:|---:|---|---|---|---|');
for (const c of candidates) {
  const atsDisplay = Number.isFinite(c.ats) ? String(c.ats) : '-';
  const priorityDisplay = Number.isFinite(c.priority) ? String(c.priority) : '-';
  out.push(`| ${c.rank} | ${c.score} | ${atsDisplay} | ${priorityDisplay} | ${c.company} | ${c.role.replace(/\|/g, '/')} | ${c.path} | ${c.url} |`);
}
out.push('');
out.push('## Steps');
out.push('');
out.push('1. Open each pack file in order.');
out.push('2. Complete portal form and submit manually after login/captcha.');
out.push('3. Mark submitted by queue index: npm run apply:submit:next -- 1 submitted');
out.push('4. Regenerate follow-ups using: npm run apply:followups');
out.push('5. Or use the browser UI: npm run extension:serve, then load chrome-extension/ in Chrome');

writeFileSync(OUTPUT_PATH, out.join('\n') + '\n', 'utf-8');
console.log(`Wrote ${OUTPUT_PATH}`);
