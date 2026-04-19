#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';

const INDEX_PATH = 'data/application-packs/INDEX.md';
const PACK_DIR = 'data/application-packs';
const OUTPUT_DIR = 'data/role-resumes';

const countArg = process.argv[2];
const topN = Number.isFinite(Number(countArg)) ? Math.max(1, Number(countArg)) : 10;

if (!existsSync(INDEX_PATH)) {
  console.error(`Missing ${INDEX_PATH}. Run npm run apply:packs first.`);
  process.exit(1);
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

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
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
  const company = md.match(/- Company:\s*(.+)/)?.[1]?.trim() || '';
  const role = md.match(/- Role:\s*(.+)/)?.[1]?.trim() || '';
  const score = md.match(/- Match Score:\s*(\d+)/)?.[1]?.trim() || '';
  const url = md.match(/- URL:\s*(https?:\/\/\S+)/)?.[1]?.trim() || '';
  const resume = md.match(/## Resume To Upload\s*-\s*(.+)/m)?.[1]?.trim() || 'cv.md';
  const answers = md.match(/## Exact Form Answers\n\n([\s\S]*?)\n## Email Draft/m)?.[1] || '';
  const emailDraft = md.match(/## Email Draft\n\n```text\n([\s\S]*?)\n```/m)?.[1] || '';
  const prioritizedBullets = (md.match(/## Prioritized Resume Bullets\n([\s\S]*?)\n## Exact Form Answers/)?.[1] || '')
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
  return { company, role, score, url, resume, answers, emailDraft, prioritizedBullets };
}

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
  const track = pickTrack(row.role, pack.resume);
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

${skills.map(s => `- ${s}`).join('\n')}

## Experience

### Lms Athena - AI/ML Intern
Roorkee, Uttarakhand | Nov 2025-Apr 2026

${bullets.map(b => `${b}`).join('\n')}

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

function main() {
  const index = readFileSync(INDEX_PATH, 'utf-8');
  const rows = parseIndex(index).slice(0, topN);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const outputIndex = [];
  outputIndex.push(`# Tailored Resumes (${new Date().toISOString().slice(0, 10)})`);
  outputIndex.push('');
  outputIndex.push(`Generated top ${rows.length} role-specific resumes from data/application-packs.`);
  outputIndex.push('');
  outputIndex.push('| # | Score | Company | Role | Resume | Pack |');
  outputIndex.push('|---|---:|---|---|---|---|');

  for (const row of rows) {
    const packPath = `${PACK_DIR}/${row.pack}`;
    if (!existsSync(packPath)) continue;
    const pack = parsePack(readFileSync(packPath, 'utf-8'));
    const resumeText = buildResume(row, pack);
    const filename = `${slugify(`${String(row.rank).padStart(2, '0')}-${row.company}-${row.role}`)}.md`;
    const filePath = `${OUTPUT_DIR}/${filename}`;
    writeFileSync(filePath, resumeText, 'utf-8');
    outputIndex.push(`| ${row.rank} | ${row.score} | ${row.company} | ${row.role.replace(/\|/g, '/')} | ${filename} | ${row.pack} |`);
  }

  const indexPath = `${OUTPUT_DIR}/INDEX.md`;
  writeFileSync(indexPath, `${outputIndex.join('\n')}\n`, 'utf-8');

  console.log(`Generated ${rows.length} tailored resumes in ${OUTPUT_DIR}`);
  console.log(`Index: ${indexPath}`);
}

main();
