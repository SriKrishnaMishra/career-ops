#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const INDEX_PATH = 'data/application-packs/INDEX.md';
const PACK_DIR = 'data/application-packs';
const HTML_DIR = 'data/role-resumes-html';
const PDF_DIR = 'output/role-resumes';

const packArg = String(process.argv[2] || '').trim();
if (!packArg) {
  console.error('Usage: node regenerate-single-pack.mjs <pack-path>');
  process.exit(1);
}

function parseIndex(md) {
  const rows = [];
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (line.includes('|---')) continue;
    if (line.includes('| # | Score | Company |')) continue;

    const cols = line.split('|').map((c) => c.trim()).filter(Boolean);
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
  const get = (re) => md.match(re)?.[1]?.trim() || '';
  const bullets = (md.match(/## Prioritized Resume Bullets\n([\s\S]*?)\n## Exact Form Answers/)?.[1] || '')
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);

  return {
    company: get(/- Company:\s*(.+)/),
    role: get(/- Role:\s*(.+)/),
    score: Number(get(/- Match Score:\s*(\d+)/)) || 0,
    url: get(/- URL:\s*(https?:\/\/\S+)/),
    resumeToUpload: get(/## Resume To Upload\n-\s*(.+)/),
    tailoredResumeToUpload: get(/## Tailored Resume To Upload\n-\s*(.+)/),
    prioritizedBullets: bullets
  };
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markdownToHtml(md, title) {
  const lines = md.split('\n');
  let html = '';
  let inList = false;

  for (const line of lines) {
    if (line.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3>${esc(line.slice(4))}</h3>`;
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h2>${esc(line.slice(3))}</h2>`;
      continue;
    }
    if (line.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h1>${esc(line.slice(2))}</h1>`;
      continue;
    }
    if (line.startsWith('- ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${esc(line.slice(2))}</li>`;
      continue;
    }

    if (inList) { html += '</ul>'; inList = false; }
    if (line.trim().length === 0) html += '<div class="sp"></div>';
    else html += `<p>${esc(line)}</p>`;
  }

  if (inList) html += '</ul>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 0; }
    .page { max-width: 8.27in; margin: 0 auto; padding: 0.25in 0.2in; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    h2 { font-size: 15px; margin: 14px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    h3 { font-size: 13px; margin: 10px 0 4px; }
    p { font-size: 11px; line-height: 1.45; margin: 4px 0; }
    ul { margin: 4px 0 8px 18px; padding: 0; }
    li { font-size: 11px; line-height: 1.45; margin: 2px 0; }
    .sp { height: 6px; }
  </style>
</head>
<body>
  <div class="page">${html}</div>
</body>
</html>`;
}

const baseProfile = {
  name: 'Sri Krishna Mishra',
  phone: '+91 9905582516',
  email: 'srikrishnamishra006@gmail.com',
  location: 'India',
  links: ['LinkedIn', 'GitHub']
};

const experienceBlocks = {
  ai: [
    '- Built conversational AI systems using Hugging Face Transformers and LangChain.',
    '- Developed end-to-end API integrations and SQL-powered data pipelines.',
    '- Implemented a real-time AI avatar chatbot pipeline: STT -> LLM -> TTS -> lip-sync response.',
    '- Dockerized AI workflows for repeatable deployment and faster iteration.'
  ],
  vision: [
    '- Built face verification with Python, Flask, OpenCV, and TensorFlow for real-time identity matching.',
    '- Implemented real-time detection, feature extraction, and identity matching workflows.',
    '- Containerized the system with Docker and integrated model serving via REST APIs.'
  ],
  research: [
    '- Built retrieval-augmented conversational workflows and validated model behavior through iterative testing.',
    '- Authored machine learning research papers and translated research ideas into practical implementations.',
    '- Applied NLP and deep learning methods to context-aware production-like systems.'
  ],
  data: [
    '- Completed end-to-end data science workflow with scraping, preprocessing, and predictive modeling.',
    '- Used requests, BeautifulSoup, pandas, and MySQL to derive business-relevant insights.',
    '- Designed SQL-backed feature and inference support pipelines.'
  ],
  engineering: [
    '- Built and shipped practical AI features in cross-functional internship teams.',
    '- Used Git/GitHub workflows for collaboration, code review, and version control.',
    '- Contributed to product-facing engineering with backend APIs and integration logic.'
  ]
};

function pickTrack(role, suggestedResume) {
  if (suggestedResume && suggestedResume.includes('internship')) return 'internship';
  const lower = role.toLowerCase();
  if (lower.includes('intern') || lower.includes('co-op') || lower.includes('new grad') || lower.includes('associate')) return 'internship';
  return 'fulltime';
}

function buildBullets(role, pack) {
  const lower = role.toLowerCase();
  const blocks = [];
  if (lower.includes('vision') || lower.includes('computer vision')) blocks.push(...experienceBlocks.vision);
  if (lower.includes('research')) blocks.push(...experienceBlocks.research);
  if (lower.includes('data') || lower.includes('analytics')) blocks.push(...experienceBlocks.data);
  if (lower.includes('engineer') || lower.includes('software') || lower.includes('applied') || lower.includes('agent')) {
    blocks.push(...experienceBlocks.engineering);
  }
  blocks.push(...experienceBlocks.ai);

  const packBullets = (pack?.prioritizedBullets || []).filter(Boolean);
  const selected = [...packBullets, ...blocks];
  return [...new Set(selected)].slice(0, 7);
}

function buildSkills(role) {
  const lower = role.toLowerCase();
  const lines = [
    'Languages: Python, C++',
    'Frameworks: TensorFlow, PyTorch, LangChain, Flask, FastAPI',
    'AI/ML: NLP, Machine Learning, Deep Learning, Fine-Tuning',
    'Data: MySQL, ChromaDB, Pinecone',
    'MLOps/DevOps: Docker, MLOps Pipelines',
    'Tools: Git, GitHub, REST APIs, n8n'
  ];

  if (lower.includes('vision')) lines.splice(2, 0, 'Computer Vision: OpenCV, detection, feature extraction, matching');
  if (lower.includes('research')) lines.push('Research: experimentation, evaluation, iteration, paper writing');
  if (lower.includes('data') || lower.includes('analytics')) lines.push('Data: pandas, BeautifulSoup, scraping, predictive modeling');
  return lines;
}

function buildSummary(role, pack) {
  const lower = role.toLowerCase();
  const company = pack?.company || 'the target company';
  if (lower.includes('vision')) {
    return `AI/ML engineer with hands-on computer vision and multimodal pipeline experience, tailored for ${company}, including real-time face verification and LLM-powered systems.`;
  }
  if (lower.includes('research')) {
    return `Machine learning intern pursuing B.Tech in Computer Science and Engineering with hands-on experience building end-to-end ML pipelines and research-oriented workflows, aligned to ${company}.`;
  }
  if (lower.includes('data')) {
    return `AI/ML engineer with practical experience in data pipelines, predictive modeling, and Python-based backend integrations for ${company}.`;
  }
  return `Machine learning intern pursuing B.Tech in Computer Science and Engineering with hands-on experience building end-to-end ML and data pipelines, tailored for ${company}.`;
}

function buildResume(row, pack) {
  const bullets = buildBullets(row.role, pack);
  const skills = buildSkills(row.role);
  const summary = buildSummary(row.role, pack);
  const track = pickTrack(row.role, pack.resumeToUpload);
  const fitNotes = [
    `Selected application: ${row.company} - ${row.role}`,
    `ATS score target: ${pack.score}`,
    `Key resume focus: ${(pack.prioritizedBullets || []).slice(0, 3).join(' | ') || 'role-specific experience'}`
  ];

  return `# ${baseProfile.name}

${baseProfile.location} | ${baseProfile.phone} | ${baseProfile.email} | ${baseProfile.links.join(' | ')}

## Target Role

${row.company} - ${row.role}

## Professional Summary

${summary}

## Core Skills

${skills.map((s) => `- ${s}`).join('\n')}

## Experience

### Lms Athena - AI/ML Intern
Roorkee, Uttarakhand | Nov 2025-Apr 2026

${bullets.map((b) => `${b}`).join('\n')}

### Ceeras IT Services - Frontend Developer Intern
Remote | Feb 2025-Jun 2025

- Assisted in setup of manufacturing floor UI for palette inspection tracking.
- Coordinated with engineers and supported documentation and planning workflows.

## Projects

### AI Chatbot SaaS Platform

- Built a multi-tenant AI SaaS platform in Python for conversational chatbot deployment.
- Implemented retrieval-augmented response pipelines using LangChain and embeddings.

### Face Verification Authentication System

- Built a face verification authentication system using Python, Flask, OpenCV, and TensorFlow.
- Implemented real-time detection, feature extraction, and identity matching.

### Data Science Job Simulation - Forage

- Completed an end-to-end data science workflow for British Airways.
- Performed web scraping with requests and BeautifulSoup and cleaned data using pandas.
- Loaded and analyzed structured data in MySQL to uncover sentiment and usage patterns.

## Education

- B.Tech in Computer Science and Engineering, Quantum University (2022-2026), GPA: 7.61
- Intermediate (PCM), D.A.V Public School (2020-2021), Score: 79.80%

## Fit Notes

- Resume track: ${track}
- Suggested pack score: ${pack.score}
- Role URL: ${pack.url}
- ${fitNotes.join('\n- ')}
`;
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

function runAtsScore(url, resumePath) {
  try {
    const out = execFileSync(process.execPath, ['ats-score.mjs', url, resumePath], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const m = out.match(/ATS score:\s*(\d+)\/100\s*\(([^)]+)\)/i);
    if (!m) return { ok: false, score: null, band: 'error', details: 'No score parsed' };
    return {
      ok: true,
      score: Number(m[1]),
      band: m[2].toLowerCase(),
      details: ''
    };
  } catch (err) {
    const msg = err?.stderr?.toString?.() || err?.message || 'Unknown error';
    return { ok: false, score: null, band: 'error', details: msg.trim().split('\n')[0] };
  }
}

if (!existsSync(INDEX_PATH)) {
  console.error(`Missing ${INDEX_PATH}. Run npm run apply:packs first.`);
  process.exit(1);
}

const normalizedInput = packArg.replace(/\\/g, '/');
const packFile = normalizedInput.split('/').pop();
const packPath = normalizedInput.startsWith('data/application-packs/')
  ? normalizedInput
  : `data/application-packs/${packFile}`;

const indexRows = parseIndex(readFileSync(INDEX_PATH, 'utf-8'));
const row = indexRows.find((r) => r.pack === packFile);
if (!row) {
  console.error(`Pack not found in index: ${packArg}`);
  process.exit(1);
}

const absolutePackPath = path.join(PACK_DIR, row.pack);
if (!existsSync(absolutePackPath)) {
  console.error(`Pack file missing: ${absolutePackPath}`);
  process.exit(1);
}

const pack = parsePack(readFileSync(absolutePackPath, 'utf-8'));
const resumeText = buildResume(row, pack);

const tailoredResumePath = pack.tailoredResumeToUpload || `data/role-resumes/${row.pack.replace(/\.md$/i, '')}.md`;
mkdirSync(path.dirname(tailoredResumePath), { recursive: true });
writeFileSync(tailoredResumePath, resumeText, 'utf-8');

mkdirSync(HTML_DIR, { recursive: true });
mkdirSync(PDF_DIR, { recursive: true });

const htmlPath = path.join(HTML_DIR, `${path.basename(tailoredResumePath, '.md')}.html`);
const pdfPath = path.join(PDF_DIR, `${path.basename(tailoredResumePath, '.md')}.pdf`);
writeFileSync(htmlPath, markdownToHtml(resumeText, `${row.company} - ${row.role}`), 'utf-8');

execFileSync(process.execPath, ['generate-pdf.mjs', htmlPath, pdfPath, '--format=a4'], { stdio: 'ignore' });

const resumeForAts = existsSync(tailoredResumePath) ? tailoredResumePath : (pack.resumeToUpload || 'cv.md');
const ats = pack.url ? runAtsScore(pack.url, resumeForAts) : { ok: false, score: null, band: 'error', details: 'URL missing in pack' };
const maxRank = indexRows.reduce((m, r) => Math.max(m, r.rank), 1);
const priority = combinedPriority(ats.score, row.rank, maxRank);

const output = {
  ok: true,
  packPath,
  pack: row.pack,
  rank: row.rank,
  company: row.company,
  role: row.role,
  tailoredResumePath,
  pdfPath,
  ats: ats.score,
  band: ats.band,
  priority,
  atsDetails: ats.details
};

console.log(JSON.stringify(output));
