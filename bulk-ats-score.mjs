#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const INDEX_PATH = 'data/application-packs/INDEX.md';
const PACK_DIR = 'data/application-packs';
const OUTPUT_DIR = 'data/ats-scores';
const OUTPUT_PATH = `${OUTPUT_DIR}/BULK.md`;

const nArg = process.argv[2];
const topN = Number.isFinite(Number(nArg)) ? Math.max(1, Number(nArg)) : 10;

if (!existsSync(INDEX_PATH)) {
  console.error(`Missing ${INDEX_PATH}. Run npm run apply:packs first.`);
  process.exit(1);
}

function parseIndex(md) {
  const rows = [];
  for (const line of md.split('\n')) {
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

function parsePack(md) {
  const url = md.match(/- URL:\s*(https?:\/\/\S+)/)?.[1]?.trim() || '';
  const baseResume = md.match(/## Resume To Upload\s*-\s*(.+)/m)?.[1]?.trim() || 'cv.md';
  const tailoredResume = md.match(/## Tailored Resume To Upload\s*-\s*(.+)/m)?.[1]?.trim() || '';
  return { url, baseResume, tailoredResume };
}

function runAtsScore(url, resumePath) {
  try {
    const out = execFileSync('node', ['ats-score.mjs', url, resumePath], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const m = out.match(/ATS score:\s*(\d+)\/100\s*\(([^)]+)\)/i);
    const b = out.match(/Breakdown:\s*skills=(\d+)\s*must-have=(\d+)\s*experience=(\d+)\s*keyword=(\d+)/i);
    if (!m) return { ok: false, score: null, band: 'error', details: 'No score parsed', breakdown: null };
    return {
      ok: true,
      score: Number(m[1]),
      band: m[2].toLowerCase(),
      details: '',
      breakdown: b
        ? {
            skills: Number(b[1]),
            mustHave: Number(b[2]),
            experience: Number(b[3]),
            keyword: Number(b[4])
          }
        : null
    };
  } catch (err) {
    const msg = err?.stderr?.toString?.() || err?.message || 'Unknown error';
    return { ok: false, score: null, band: 'error', details: msg.trim().split('\n')[0], breakdown: null };
  }
}

function rankScore(rank, maxRank) {
  if (!Number.isFinite(rank) || !Number.isFinite(maxRank) || maxRank <= 1) return 100;
  return Math.max(0, Math.round(((maxRank - rank) / (maxRank - 1)) * 100));
}

function combinedPriority(ats, rank, maxRank) {
  const atsScore = Number.isFinite(ats) ? ats : 0;
  const rScore = rankScore(rank, maxRank);
  return Math.round(atsScore * 0.65 + rScore * 0.35);
}

function sortByPriorityDesc(a, b) {
  const pa = Number.isFinite(a.priority) ? a.priority : -1;
  const pb = Number.isFinite(b.priority) ? b.priority : -1;
  if (pb !== pa) return pb - pa;
  return a.rank - b.rank;
}

const indexRows = parseIndex(readFileSync(INDEX_PATH, 'utf-8')).slice(0, topN);
const results = [];
const maxRank = indexRows.reduce((m, r) => Math.max(m, r.rank), 1);

for (const row of indexRows) {
  const packPath = `${PACK_DIR}/${row.pack}`;
  if (!existsSync(packPath)) {
    results.push({ ...row, atsScore: null, band: 'error', resume: '-', url: '', details: 'Pack file missing', breakdown: null, priority: null, rankScore: rankScore(row.rank, maxRank) });
    continue;
  }

  const pack = parsePack(readFileSync(packPath, 'utf-8'));
  const resumeToUse = pack.tailoredResume && existsSync(pack.tailoredResume) ? pack.tailoredResume : pack.baseResume;

  if (!pack.url) {
    results.push({ ...row, atsScore: null, band: 'error', resume: resumeToUse, url: '', details: 'URL missing in pack', breakdown: null, priority: null, rankScore: rankScore(row.rank, maxRank) });
    continue;
  }

  const ats = runAtsScore(pack.url, resumeToUse);
  const rScore = rankScore(row.rank, maxRank);
  const priority = combinedPriority(ats.score, row.rank, maxRank);
  results.push({
    ...row,
    atsScore: ats.score,
    band: ats.band,
    resume: resumeToUse,
    url: pack.url,
    details: ats.details,
    breakdown: ats.breakdown,
    rankScore: rScore,
    priority
  });
}

results.sort(sortByPriorityDesc);

mkdirSync(OUTPUT_DIR, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const out = [];
out.push(`# Bulk ATS Scores (${today})`);
out.push('');
out.push(`Roles scored: ${results.length}`);
out.push('');
out.push('| Rank | ATS | Band | RankScore | Priority | Company | Role | Resume | Pack |');
out.push('|---:|---:|---|---:|---:|---|---|---|---|');
for (const r of results) {
  const scoreDisplay = Number.isFinite(r.atsScore) ? String(r.atsScore) : '-';
  const rankDisplay = Number.isFinite(r.rankScore) ? String(r.rankScore) : '-';
  const priorityDisplay = Number.isFinite(r.priority) ? String(r.priority) : '-';
  out.push(`| ${r.rank} | ${scoreDisplay} | ${r.band} | ${rankDisplay} | ${priorityDisplay} | ${r.company} | ${r.role.replace(/\|/g, '/')} | ${r.resume} | ${r.pack} |`);
}
out.push('');
out.push('## Priority Formula');
out.push('');
out.push('- Combined Priority = 65% ATS + 35% RankScore');
out.push('- RankScore maps better shortlist rank to higher score (0-100).');
out.push('');
out.push('## Weighted ATS Breakdown Sample');
out.push('');
const firstWithBreakdown = results.find(r => r.breakdown);
if (!firstWithBreakdown) {
  out.push('- No breakdown available in this run.');
} else {
  out.push(`- ${firstWithBreakdown.pack}: skills=${firstWithBreakdown.breakdown.skills}, must-have=${firstWithBreakdown.breakdown.mustHave}, experience=${firstWithBreakdown.breakdown.experience}, keyword=${firstWithBreakdown.breakdown.keyword}`);
}
out.push('');
out.push('## Errors');
out.push('');
const errors = results.filter(r => r.band === 'error');
if (errors.length === 0) {
  out.push('- None');
} else {
  for (const e of errors) {
    out.push(`- ${e.pack}: ${e.details}`);
  }
}
out.push('');
out.push('## Usage');
out.push('');
out.push('- Re-run with a larger batch: npm run ats:bulk -- 20');
out.push('- Individual report files are written by ats-score.mjs under data/ats-scores');
out.push('');

writeFileSync(OUTPUT_PATH, out.join('\n'), 'utf-8');
console.log(`Wrote ${OUTPUT_PATH}`);
