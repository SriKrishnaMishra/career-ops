#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const INDEX_PATH = 'data/role-resumes/INDEX.md';
const RESUME_DIR = 'data/role-resumes';
const HTML_DIR = 'data/role-resumes-html';
const PDF_DIR = 'output/role-resumes';

const nArg = process.argv[2];
const topN = Number.isFinite(Number(nArg)) ? Math.max(1, Number(nArg)) : 10;

if (!existsSync(INDEX_PATH)) {
  console.error(`Missing ${INDEX_PATH}. Run npm run apply:tailor first.`);
  process.exit(1);
}

function parseIndex(md) {
  const rows = [];
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (line.includes('|---')) continue;
    if (line.includes('| # | Score | Company |')) continue;

    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 6) continue;

    const rank = Number(cols[0]);
    const score = Number(cols[1]);
    const company = cols[2];
    const role = cols[3];
    const resume = cols[4];
    if (!Number.isFinite(rank) || !Number.isFinite(score)) continue;
    rows.push({ rank, score, company, role, resume });
  }
  return rows;
}

function esc(s) {
  return s
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
    if (line.trim().length === 0) {
      html += '<div class="sp"></div>';
    } else {
      html += `<p>${esc(line)}</p>`;
    }
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
  <div class="page">
    ${html}
  </div>
</body>
</html>`;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

mkdirSync(HTML_DIR, { recursive: true });
mkdirSync(PDF_DIR, { recursive: true });

const rows = parseIndex(readFileSync(INDEX_PATH, 'utf-8')).slice(0, topN);
let exported = 0;

for (const row of rows) {
  const mdPath = `${RESUME_DIR}/${row.resume}`;
  if (!existsSync(mdPath)) continue;

  const md = readFileSync(mdPath, 'utf-8');
  const base = `${String(row.rank).padStart(2, '0')}-${slugify(`${row.company}-${row.role}`)}`;
  const htmlPath = `${HTML_DIR}/${base}.html`;
  const pdfPath = `${PDF_DIR}/${base}.pdf`;

  writeFileSync(htmlPath, markdownToHtml(md, `${row.company} - ${row.role}`), 'utf-8');

  execFileSync('node', ['generate-pdf.mjs', htmlPath, pdfPath, '--format=a4'], { stdio: 'ignore' });
  exported += 1;
}

console.log(`Exported ${exported} tailored resume PDFs to ${PDF_DIR}`);
