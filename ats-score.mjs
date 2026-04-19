#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const source = process.argv[2];
const cvPath = process.argv[3] || 'cv.md';

if (!source) {
  console.error('Usage: node ats-score.mjs <job-url-or-text-file> [cv-path]');
  process.exit(1);
}
if (!existsSync(cvPath)) {
  console.error(`CV not found: ${cvPath}`);
  process.exit(1);
}

const stop = new Set([
  'the','and','for','with','from','that','this','you','your','our','are','will','have','has','not','role','job','team','work','experience','years','using','use','build','building','engineer','engineering','senior','intern','internship','apply','application','about','what','looking'
]);

const SKILL_TERMS = [
  'python', 'java', 'javascript', 'typescript', 'c++', 'sql', 'pytorch', 'tensorflow',
  'langchain', 'llm', 'nlp', 'machine learning', 'deep learning', 'computer vision',
  'docker', 'kubernetes', 'aws', 'gcp', 'azure', 'flask', 'fastapi', 'rest',
  'rag', 'vector', 'embeddings', 'transformer', 'transformers', 'pandas', 'numpy',
  'mysql', 'postgres', 'spark', 'airflow', 'mlops', 'git'
];

const MUST_HAVE_TERMS = [
  'required', 'must have', 'must', 'minimum', 'qualification', 'qualifications',
  'hands-on', 'production', 'ship', 'deployed', 'scalable', 'ownership',
  'problem solving', 'communication', 'collaboration', 'testing'
];

const EXPERIENCE_TERMS = [
  'intern', 'internship', 'entry level', 'new grad', 'junior', 'associate',
  'senior', 'staff', 'lead', 'principal', 'manager', 'research', 'applied',
  'years', '1+', '2+', '3+', '5+', '0-2'
];

const WEIGHTS = {
  skills: 0.5,
  mustHave: 0.3,
  experience: 0.2
};

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+\-\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => t.length > 2)
    .filter(t => !stop.has(t));
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadJobText(src) {
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { redirect: 'follow' });
    const html = await res.text();
    return stripHtml(html);
  }

  if (!existsSync(src)) {
    throw new Error(`File not found: ${src}`);
  }
  return readFileSync(src, 'utf-8');
}

function topKeywords(tokens, n = 60) {
  const map = new Map();
  for (const t of tokens) map.set(t, (map.get(t) || 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

function presentTerms(text, terms) {
  const lower = text.toLowerCase();
  return terms.filter((t) => lower.includes(t.toLowerCase()));
}

function ratioScore(jobTerms, cvTerms) {
  if (jobTerms.length === 0) return 0;
  const matched = jobTerms.filter((t) => cvTerms.includes(t));
  return {
    score: Math.round((matched.length / jobTerms.length) * 100),
    matched,
    missing: jobTerms.filter((t) => !cvTerms.includes(t)),
    total: jobTerms.length
  };
}

function score(jobText, cvText) {
  const jobTokens = tokenize(jobText);
  const cvTokens = new Set(tokenize(cvText));
  const top = topKeywords(jobTokens, 80);

  const matched = top.filter(k => cvTokens.has(k));
  const missing = top.filter(k => !cvTokens.has(k));

  const ratio = top.length === 0 ? 0 : matched.length / top.length;
  const keywordNumeric = Math.round(ratio * 100);

  const jobSkills = presentTerms(jobText, SKILL_TERMS);
  const cvSkills = presentTerms(cvText, SKILL_TERMS);
  const skillsPart = ratioScore(jobSkills, cvSkills);

  const jobMustHave = presentTerms(jobText, MUST_HAVE_TERMS);
  const cvMustHave = presentTerms(cvText, MUST_HAVE_TERMS);
  const mustHavePart = ratioScore(jobMustHave, cvMustHave);

  const jobExperience = presentTerms(jobText, EXPERIENCE_TERMS);
  const cvExperience = presentTerms(cvText, EXPERIENCE_TERMS);
  const experiencePart = ratioScore(jobExperience, cvExperience);

  const numeric = Math.round(
    skillsPart.score * WEIGHTS.skills +
    mustHavePart.score * WEIGHTS.mustHave +
    experiencePart.score * WEIGHTS.experience
  );

  let band = 'low';
  if (numeric >= 70) band = 'strong';
  else if (numeric >= 50) band = 'medium';

  return {
    numeric,
    band,
    top,
    matched,
    missing,
    keywordNumeric,
    weighted: {
      skills: skillsPart,
      mustHave: mustHavePart,
      experience: experiencePart
    }
  };
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

async function main() {
  const cvText = readFileSync(cvPath, 'utf-8');
  const jobText = await loadJobText(source);
  const result = score(jobText, cvText);

  const out = [];
  const today = new Date().toISOString().slice(0, 10);
  out.push(`# ATS Match Report (${today})`);
  out.push('');
  out.push(`Source: ${source}`);
  out.push(`Resume: ${cvPath}`);
  out.push('');
  out.push(`Score: ${result.numeric}/100 (${result.band})`);
  out.push(`Weighted breakdown: skills ${result.weighted.skills.score}, must-have ${result.weighted.mustHave.score}, experience ${result.weighted.experience.score}`);
  out.push(`Keyword overlap score (reference): ${result.keywordNumeric}/100`);
  out.push('');
  out.push('## Top Matched Keywords');
  out.push('');
  out.push(result.matched.slice(0, 25).map(k => `- ${k}`).join('\n') || '- None');
  out.push('');
  out.push('## Top Missing Keywords');
  out.push('');
  out.push(result.missing.slice(0, 25).map(k => `- ${k}`).join('\n') || '- None');
  out.push('');

  mkdirSync('data/ats-scores', { recursive: true });
  const file = `data/ats-scores/${slug(source)}.md`;
  writeFileSync(file, out.join('\n') + '\n', 'utf-8');

  console.log(`ATS score: ${result.numeric}/100 (${result.band})`);
  console.log(`Breakdown: skills=${result.weighted.skills.score} must-have=${result.weighted.mustHave.score} experience=${result.weighted.experience.score} keyword=${result.keywordNumeric}`);
  console.log(`Report: ${file}`);
}

main().catch(err => {
  console.error(err.message || String(err));
  process.exit(1);
});
