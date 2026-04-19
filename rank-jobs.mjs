#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';

const PIPELINE_PATH = 'data/pipeline.md';
const CV_PATH = 'cv.md';
const OUTPUT_PATH = 'data/shortlist-ranked.md';

if (!existsSync(PIPELINE_PATH)) {
  console.error(`Missing ${PIPELINE_PATH}`);
  process.exit(1);
}

if (!existsSync(CV_PATH)) {
  console.error(`Missing ${CV_PATH}`);
  process.exit(1);
}

const stopWords = new Set([
  'and', 'or', 'the', 'a', 'an', 'for', 'to', 'of', 'in', 'on', 'with', 'at', 'by',
  'from', 'role', 'engineer', 'internship', 'intern', 'senior', 'staff', 'lead',
  'manager', 'principal', 'head', 'director', 'associate', 'new', 'grad', 'program',
  'summer', 'fall', 'spring', 'remote', 'hybrid', 'full', 'time'
]);

const preferredTerms = [
  'ai', 'ml', 'machine', 'learning', 'llm', 'nlp', 'applied', 'engineer', 'python',
  'data', 'model', 'inference', 'research', 'computer', 'vision', 'search', 'agent'
];

const earlyCareerBoostTerms = ['intern', 'internship', 'associate', 'co-op', 'new grad', 'graduate'];
const earlyCareerPenaltyTerms = ['senior', 'staff', 'principal', 'head', 'director', 'manager'];

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+\-\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => !stopWords.has(t));
}

function containsAny(text, terms) {
  const lower = text.toLowerCase();
  return terms.some(term => lower.includes(term));
}

function parsePipelineEntries(markdown) {
  const entries = [];
  const regex = /^- \[[ x]\] (https?:\/\/\S+) \| ([^|]+) \| (.+)$/gm;
  for (const m of markdown.matchAll(regex)) {
    entries.push({
      url: m[1].trim(),
      company: m[2].trim(),
      role: m[3].trim(),
      raw: m[0]
    });
  }
  return entries;
}

function scoreEntry(entry, cvTokensSet) {
  const roleTokens = tokenize(`${entry.company} ${entry.role}`);
  const overlap = roleTokens.filter(t => cvTokensSet.has(t));

  let score = overlap.length * 2;

  for (const term of preferredTerms) {
    if (entry.role.toLowerCase().includes(term)) score += 1;
  }

  if (containsAny(entry.role, earlyCareerBoostTerms)) score += 4;
  if (containsAny(entry.role, earlyCareerPenaltyTerms)) score -= 4;

  if (entry.role.toLowerCase().includes('india') || entry.company.toLowerCase().includes('india')) {
    score += 1;
  }

  const resumeTrack = containsAny(entry.role, earlyCareerBoostTerms) ? 'cv-internship.md' : 'cv-fulltime.md';

  return {
    ...entry,
    score,
    overlapCount: overlap.length,
    overlapKeywords: overlap.slice(0, 8),
    resumeTrack
  };
}

const pipelineMd = readFileSync(PIPELINE_PATH, 'utf-8');
const cvMd = readFileSync(CV_PATH, 'utf-8');

const entries = parsePipelineEntries(pipelineMd);
const cvTokensSet = new Set(tokenize(cvMd));

const ranked = entries
  .map(e => scoreEntry(e, cvTokensSet))
  .sort((a, b) => b.score - a.score)
  .slice(0, 40);

const today = new Date().toISOString().slice(0, 10);

const lines = [];
lines.push(`# Ranked Shortlist (${today})`);
lines.push('');
lines.push('Auto-generated from data/pipeline.md scored against cv.md.');
lines.push('');
lines.push('| # | Score | Company | Role | Suggested Resume | URL |');
lines.push('|---|---:|---|---|---|---|');

ranked.forEach((r, idx) => {
  lines.push(`| ${idx + 1} | ${r.score} | ${r.company} | ${r.role.replace(/\|/g, '/')} | ${r.resumeTrack} | ${r.url} |`);
});

lines.push('');
lines.push('## Notes');
lines.push('');
lines.push('- Higher score means better keyword overlap and better early-career fit.');
lines.push('- Use cv-internship.md for internship/new-grad tracks; cv-fulltime.md for others.');
lines.push('- Manually review role seniority and location before applying.');

writeFileSync(OUTPUT_PATH, lines.join('\n') + '\n', 'utf-8');

console.log(`Ranked ${entries.length} roles -> ${OUTPUT_PATH}`);
