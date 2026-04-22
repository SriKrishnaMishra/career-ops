#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'fs';

const SHORTLIST_PATH = 'data/shortlist-ranked.md';
const OUTPUT_DIR = 'data/application-packs';

const name = 'Sri Krishna Mishra';
const email = 'srikrishnamishra006@gmail.com';
const phone = '+91 9905582516';
const linkedin = 'LinkedIn';
const github = 'GitHub';
const years = '0-2';

const topNArg = process.argv[2];
const topN = Number.isFinite(Number(topNArg)) ? Math.max(1, Number(topNArg)) : 10;

const bulletLibrary = {
  core: [
    'Built conversational AI systems using Hugging Face Transformers, LangChain, and PyTorch.',
    'Developed end-to-end API integrations and SQL-powered data pipelines.',
    'Implemented a real-time AI avatar chatbot pipeline: STT -> LLM -> TTS -> lip-sync response.',
    'Dockerized AI workflows for repeatable deployment and faster iteration.'
  ],
  cv: [
    'Built face verification with Python, Flask, OpenCV, and TensorFlow for real-time identity matching.',
    'Integrated model-serving via REST APIs and containerized the stack with Docker.',
    'Worked with computer vision data flow from detection to feature extraction and matching.'
  ],
  research: [
    'Built retrieval-augmented conversational workflows and validated model behavior through iterative testing.',
    'Authored machine learning research papers and translated research ideas into practical implementations.',
    'Applied NLP and deep learning methods to context-aware production-like systems.'
  ],
  data: [
    'Completed end-to-end data science workflow with scraping, preprocessing, and predictive modeling.',
    'Used requests, BeautifulSoup, pandas, and MySQL to derive business-relevant insights.',
    'Designed SQL-backed feature and inference support pipelines.'
  ],
  engineering: [
    'Built and shipped practical AI features in cross-functional internship teams.',
    'Used Git/GitHub workflows for collaboration, code review, and version control.',
    'Contributed to product-facing engineering with backend APIs and integration logic.'
  ]
};

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function packSlug(row) {
  return slugify(`${String(row.rank).padStart(2, '0')}-${row.company}-${row.role}`);
}

function parseShortlistRows(markdown) {
  const rows = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    if (line.includes('|---')) continue;
    if (line.includes('| # | Score | Company |')) continue;

    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 6) continue;

    const rank = Number(cols[0]);
    const score = Number(cols[1]);
    const company = cols[2];
    const role = cols[3];
    const suggestedResume = cols[4];
    const url = cols[5];

    if (!Number.isFinite(rank) || !Number.isFinite(score)) continue;
    if (!url.startsWith('http')) continue;

    rows.push({ rank, score, company, role, suggestedResume, url });
  }

  return rows;
}

function buildRoleBullets(role) {
  const lower = role.toLowerCase();
  const result = [...bulletLibrary.core];

  if (lower.includes('vision')) result.push(...bulletLibrary.cv);
  if (lower.includes('research')) result.push(...bulletLibrary.research);
  if (lower.includes('data') || lower.includes('analytics')) result.push(...bulletLibrary.data);
  if (lower.includes('engineer') || lower.includes('software') || lower.includes('applied')) {
    result.push(...bulletLibrary.engineering);
  }

  // Unique and capped for readability.
  return [...new Set(result)].slice(0, 8);
}

function roleTheme(role) {
  const lower = role.toLowerCase();
  if (lower.includes('vision')) return 'vision';
  if (lower.includes('research')) return 'research';
  if (lower.includes('data') || lower.includes('analytics')) return 'data';
  if (lower.includes('applied') || lower.includes('engineer') || lower.includes('software')) return 'engineering';
  return 'ai';
}

function roleEvidencePhrase(theme) {
  const phrases = {
    vision: 'My face verification project with Python, Flask, OpenCV, and TensorFlow',
    research: 'My retrieval-augmented conversational workflow and evaluation work',
    data: 'My scraping, pandas, and MySQL data pipeline work',
    engineering: 'My API and Docker-based AI workflow work',
    ai: 'My LLM conversational workflows with Hugging Face Transformers and LangChain'
  };

  return phrases[theme] || phrases.ai;
}

function buildExcitesAnswer(company, role, bullets) {
  const theme = roleTheme(role);
  const anchor = roleEvidencePhrase(theme);

  const templates = {
    vision: `I am excited about the ${role} role at ${company} because it aligns with my hands-on computer vision work and my interest in shipping systems that perform reliably in real time. I have built face verification with Python, Flask, OpenCV, and TensorFlow, and I enjoy turning model outputs into practical products. ${anchor} is the kind of work I want to keep doing in a role where accuracy, latency, and user experience all matter.`,
    research: `I am excited about the ${role} role at ${company} because it matches my research-to-production mindset. I have worked on retrieval-augmented workflows, experiment-driven model validation, and LLM systems that need careful prompting and evaluation. ${anchor} is the kind of applied research execution I like most: making ideas measurable, testable, and useful.`,
    data: `I am excited about the ${role} role at ${company} because it sits at the intersection of data, ML, and product delivery. I have built scraping, preprocessing, and SQL-backed workflows that turn raw data into something a system can use. ${anchor} is especially appealing because I like building pipelines that stay practical, maintainable, and visible to users.`,
    engineering: `I am excited about the ${role} role at ${company} because it combines engineering quality with AI execution. I enjoy building end-to-end systems with APIs, Docker, and LLM workflows, then refining them until they are reliable enough to ship. ${anchor} is a strong fit for the kind of product-focused, iterative work I want to contribute to.`,
    ai: `I am excited about the ${role} role at ${company} because it matches how I like to work: turning AI ideas into reliable, usable systems. I have built conversational AI workflows with Hugging Face Transformers and LangChain, integrated SQL-backed APIs, and deployed Dockerized automation. ${anchor} is the kind of practical work I want to keep doing with strong engineering discipline.`
  };

  return templates[theme] || templates.ai;
}

function buildProudWorkAnswer(role, bullets) {
  const theme = roleTheme(role);
  const anchor = roleEvidencePhrase(theme);

  const templates = {
    vision: `I am most proud of my Face Verification Authentication project and the way it combined detection, feature extraction, and real-time decision making.\n\n- Built face verification with Python, Flask, OpenCV, and TensorFlow.\n- Integrated model serving and containerized the stack with Docker.\n- Focused on reliable behavior in real usage, not just offline accuracy.\n\nThis work shows the same approach as ${anchor}.`,
    research: `I am most proud of building retrieval-augmented conversational workflows and translating research ideas into practical systems.\n\n- Built LLM workflows with retrieval, prompt orchestration, and evaluation checks.\n- Applied NLP and deep learning methods to context-aware production-like systems.\n- Enjoyed validating behavior iteratively instead of relying on a single prompt.\n\nThis work shows the same approach as ${anchor}.`,
    data: `I am most proud of completing an end-to-end data science workflow that moved from raw data to useful outputs.\n\n- Used requests, BeautifulSoup, pandas, and MySQL in a practical pipeline.\n- Cleaned and transformed data so it could support analysis and prediction.\n- Focused on turning data work into something measurable and dependable.\n\nThis work shows the same approach as ${anchor}.`,
    engineering: `I am most proud of building practical AI features in cross-functional internship settings and shipping them in a reliable way.\n\n- Built multi-stage AI workflows with APIs and Dockerized deployment.\n- Used Git/GitHub collaboration to keep delivery structured and reviewable.\n- Balanced product speed with quality and maintainability.\n\nThis work shows the same approach as ${anchor}.`,
    ai: `I am most proud of building an AI Chatbot SaaS platform and a real-time AI avatar pipeline.\n\n- Built a multi-tenant Python platform for conversational chatbot deployment.\n- Implemented retrieval-augmented response workflows using LangChain and embeddings.\n- Built STT -> LLM -> TTS -> lip-sync response flow and Dockerized the system.\n\nThis work shows the same approach as ${anchor}.`
  };

  return templates[theme] || templates.ai;
}

function buildEmail(company, role, url) {
  return `Subject: Application for ${role} - ${name}\n\nHello ${company} Hiring Team,\n\nI am applying for the ${role} position. I have hands-on AI/ML internship experience building end-to-end model workflows, API integrations, and production-style deployment pipelines.\n\nIn my recent work, I built LLM-powered conversational systems with Hugging Face Transformers and LangChain, integrated SQL-backed data pipelines, and deployed Dockerized real-time AI workflows. I would be excited to contribute similar execution and product-focused ML engineering to ${company}.\n\nI have attached my resume and would value the chance to interview.\n\nRole link: ${url}\n\nBest regards,\n${name}\n${phone}\n${email}\nLinkedIn: ${linkedin}\nGitHub: ${github}`;
}

function buildPack(row) {
  const bullets = buildRoleBullets(row.role);
  const excite = buildExcitesAnswer(row.company, row.role, bullets);
  const proud = buildProudWorkAnswer(row.role, bullets);
  const emailText = buildEmail(row.company, row.role, row.url);
  const resumeToUse = row.suggestedResume || 'cv.md';
  const tailoredResume = `data/role-resumes/${packSlug(row)}.md`;

  return `# Submit-Now Pack\n\n## Role\n- Company: ${row.company}\n- Role: ${row.role}\n- Match Score: ${row.score}\n- URL: ${row.url}\n\n## Resume To Upload\n- ${resumeToUse}\n\n## Tailored Resume To Upload\n- ${tailoredResume}\n\n## Prioritized Resume Bullets\n${bullets.map(b => `- ${b}`).join('\n')}\n\n## Exact Form Answers\n\n### Name\n${name}\n\n### Email\n${email}\n\n### Phone\n${phone}\n\n### LinkedIn profile\n${linkedin}\n\n### GitHub\n${github}\n\n### Years of experience\n${years}\n\n### What excites you about this role?\n${excite}\n\n### What work of yours are you most proud of?\n${proud}\n\n## Email Draft\n\n\`\`\`text\n${emailText}\n\`\`\`\n\n## Quick Checklist\n1. Upload ${tailoredResume}\n2. Paste form answers\n3. Paste or send email draft\n4. Submit and update tracker status\n`;
}

function main() {
  const md = readFileSync(SHORTLIST_PATH, 'utf-8');
  const rows = parseShortlistRows(md).slice(0, topN);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const index = [];
  index.push(`# Application Packs (${new Date().toISOString().slice(0, 10)})`);
  index.push('');
  index.push(`Generated top ${rows.length} packs from ${SHORTLIST_PATH}.`);
  index.push('');
  index.push('| # | Score | Company | Role | Pack |');
  index.push('|---|---:|---|---|---|');

  for (const row of rows) {
    const slug = slugify(`${String(row.rank).padStart(2, '0')}-${row.company}-${row.role}`);
    const filename = `${slug}.md`;
    const filePath = `${OUTPUT_DIR}/${filename}`;

    writeFileSync(filePath, buildPack(row), 'utf-8');
    index.push(`| ${row.rank} | ${row.score} | ${row.company} | ${row.role.replace(/\|/g, '/')} | ${filename} |`);
  }

  const indexPath = `${OUTPUT_DIR}/INDEX.md`;
  writeFileSync(indexPath, `${index.join('\n')}\n`, 'utf-8');

  console.log(`Generated ${rows.length} packs in ${OUTPUT_DIR}`);
  console.log(`Index: ${indexPath}`);
}

main();
