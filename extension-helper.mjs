#!/usr/bin/env node

import http from 'http';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;
const PORT = Number(process.env.CAREER_OPS_EXTENSION_PORT || 3030);
const DEFAULT_MIN_PRIORITY = Number(process.env.CAREER_OPS_MIN_PRIORITY || 55);
const REFRESH_COOLDOWN_MS = {
  queue: Number(process.env.CAREER_OPS_QUEUE_REFRESH_COOLDOWN_MS || 2 * 60 * 1000),
  search: Number(process.env.CAREER_OPS_SEARCH_REFRESH_COOLDOWN_MS || 15 * 60 * 1000)
};

const refreshState = {
  queue: { at: 0, stats: null },
  search: { at: 0, stats: null }
};

const SUBMISSIONS_PATH = path.join(ROOT, 'data/submissions.tsv');
const NEXT_BATCH_PATH = path.join(ROOT, 'data/next-apply-batch.md');
const FOLLOWUPS_PATH = path.join(ROOT, 'data/followups.md');
const DASHBOARD_PATH = path.join(ROOT, 'data/daily-dashboard.md');
const APPLICATION_INDEX_PATH = path.join(ROOT, 'data/application-packs/INDEX.md');
const BULK_ATS_PATH = path.join(ROOT, 'data/ats-scores/BULK.md');

const PROFILE = {
  name: 'Sri Krishna Mishra',
  email: 'srikrishnamishra006@gmail.com',
  phone: '+91 9905582516',
  location: 'India',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  years: '0-2'
};

function json(res, code, payload) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function text(res, code, payload, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(code, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

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

function parseNextBatch(minPriority = DEFAULT_MIN_PRIORITY) {
  if (!existsSync(NEXT_BATCH_PATH)) return [];
  const rows = parseTable(readFileSync(NEXT_BATCH_PATH, 'utf-8'), '| # | Score | ATS | Priority |');
  return rows.map((c) => ({
    rank: Number(c[0]),
    score: Number(c[1]),
    ats: Number(c[2]),
    priority: Number(c[3]),
    company: c[4],
    role: c[5],
    packPath: c[6],
    url: c[7]
  })).filter((row) => Number.isFinite(row.priority) ? row.priority >= minPriority : true);
}

function parseSubmissions() {
  if (!existsSync(SUBMISSIONS_PATH)) return [];
  const lines = readFileSync(SUBMISSIONS_PATH, 'utf-8').trim().split('\n').slice(1);
  return lines.map((line) => line.split('\t')).filter((cols) => cols.length >= 7).map((cols) => ({
    date: cols[0],
    company: cols[1],
    role: cols[2],
    url: cols[3],
    resume: cols[4],
    status: cols[5],
    followupDue: cols[6],
    notes: cols[7] || ''
  }));
}

function loadSubmittedUrls() {
  return new Set(parseSubmissions().map((row) => row.url).filter(Boolean));
}

function parseApplicationIndex() {
  if (!existsSync(APPLICATION_INDEX_PATH)) return [];
  const rows = [];
  const md = readFileSync(APPLICATION_INDEX_PATH, 'utf-8');
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
    if (!Number.isFinite(rank) || !Number.isFinite(score) || !pack) continue;

    rows.push({ rank, score, company, role, pack });
  }
  return rows;
}

function parseBulkAtsMap() {
  if (!existsSync(BULK_ATS_PATH)) return new Map();
  const md = readFileSync(BULK_ATS_PATH, 'utf-8');
  const map = new Map();

  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (line.includes('|---')) continue;
    if (line.includes('| Rank | ATS | Band |')) continue;

    const cols = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cols.length < 9) continue;

    const ats = Number(cols[1]);
    const priority = Number(cols[4]);
    const pack = cols[8];
    if (!pack) continue;

    map.set(pack, {
      ats: Number.isFinite(ats) ? ats : null,
      priority: Number.isFinite(priority) ? priority : null
    });
  }
  return map;
}

function getPackUrl(packPath) {
  const absolute = path.isAbsolute(packPath) ? packPath : path.join(ROOT, packPath);
  if (!existsSync(absolute)) return '';
  const txt = readFileSync(absolute, 'utf-8');
  return txt.match(/- URL:\s*(https?:\/\/\S+)/)?.[1] || '';
}

function applicationsState(minPriority = 0, limit = 300, includeSubmitted = true) {
  const submittedUrls = loadSubmittedUrls();
  const atsMap = parseBulkAtsMap();
  const rows = parseApplicationIndex();

  const mapped = rows
    .map((row) => {
      const packPath = `data/application-packs/${row.pack}`;
      const absolutePack = path.join(ROOT, packPath);
      const parsedPack = existsSync(absolutePack) ? parsePack(readFileSync(absolutePack, 'utf-8')) : {};
      const url = getPackUrl(packPath);
      const atsMeta = atsMap.get(row.pack) || {};
      const priority = Number.isFinite(atsMeta.priority) ? atsMeta.priority : null;
      const submitted = submittedUrls.has(url);
      return {
        rank: row.rank,
        score: row.score,
        company: row.company,
        role: row.role,
        packPath,
        url,
        ats: Number.isFinite(atsMeta.ats) ? atsMeta.ats : null,
        priority,
        submitted,
        pdfPath: derivePdfPath(packPath, parsedPack),
        resumeToUpload: parsedPack.resumeToUpload || '',
        tailoredResumeToUpload: parsedPack.tailoredResumeToUpload || ''
      };
    })
    .filter((row) => includeSubmitted ? true : !row.submitted)
    .filter((row) => (Number.isFinite(row.priority) ? row.priority >= minPriority : true))
    .sort((a, b) => {
      const pa = Number.isFinite(a.priority) ? a.priority : -1;
      const pb = Number.isFinite(b.priority) ? b.priority : -1;
      if (pb !== pa) return pb - pa;
      return a.rank - b.rank;
    });

  return mapped.slice(0, Math.max(1, Number(limit) || 300));
}

function findPackRowByPath(packPath) {
  const normalizedInput = String(packPath || '').replace(/\\/g, '/').trim();
  if (!normalizedInput) return null;
  const fileName = normalizedInput.split('/').pop() || normalizedInput;
  const rows = parseApplicationIndex();
  return rows.find((row) => row.pack === fileName || `data/application-packs/${row.pack}` === normalizedInput) || null;
}

function regenerateRoleArtifacts(packPath) {
  const row = findPackRowByPath(packPath);
  if (!row) {
    throw new Error('Pack not found in data/application-packs/INDEX.md. Run Prepare queue first.');
  }

  const output = execFileSync(process.execPath, [path.join(ROOT, 'regenerate-single-pack.mjs'), packPath], {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let parsed = null;
  try {
    parsed = JSON.parse(String(output || '').trim());
  } catch {
    throw new Error('Single-pack regenerate returned invalid output.');
  }

  return {
    rank: row.rank,
    topN: 1,
    pack: row.pack,
    ...parsed
  };
}

function parsePack(md) {
  const get = (re) => md.match(re)?.[1]?.trim() || '';
  const roleBlock = md.match(/## Role\n([\s\S]*?)\n## Resume To Upload/);
  const roleLines = roleBlock ? roleBlock[1].split('\n').map((line) => line.trim()).filter(Boolean) : [];
  const exactBlock = md.match(/## Exact Form Answers\n\n([\s\S]*?)\n## Email Draft/);
  const emailBlock = md.match(/## Email Draft\n\n```text\n([\s\S]*?)\n```/);
  const answerMap = {};

  if (exactBlock?.[1]) {
    const sections = exactBlock[1].split('\n### ').filter(Boolean);
    for (const section of sections) {
      const normalized = section.replace(/^### /, '');
      const [heading, ...rest] = normalized.split('\n');
      answerMap[heading.trim().toLowerCase()] = rest.join('\n').trim();
    }
  }

  if (Object.keys(answerMap).length === 0) {
    const formDraftBlock = md.match(/## Form Draft\n([\s\S]*?)(\n## |$)/);
    const lines = formDraftBlock?.[1]?.split('\n') || [];
    for (const line of lines) {
      const match = line.match(/^-\s*([^:]+):\s*(.+)$/);
      if (!match) continue;
      const key = match[1].trim().toLowerCase();
      const value = match[2].trim();
      if (key && value) answerMap[key] = value;
    }
  }

  return {
    company: get(/- Company:\s*(.+)/),
    role: get(/- Role:\s*(.+)/),
    matchScore: get(/- Match Score:\s*(\d+)/),
    url: get(/- URL:\s*(https?:\/\/\S+)/),
    resumeToUpload: get(/## Resume To Upload\n-\s*(.+)/),
    tailoredResumeToUpload: get(/## Tailored Resume To Upload\n-\s*(.+)/),
    prioritizedBullets: (md.match(/## Prioritized Resume Bullets\n([\s\S]*?)\n## Exact Form Answers/)?.[1] || '').trim(),
    exactAnswers: answerMap,
    formAnswers: answerMap,
    emailDraft: emailBlock?.[1]?.trim() || '',
    quickChecklist: (md.match(/## Quick Checklist\n([\s\S]*)$/)?.[1] || '').trim(),
    roleLines
  };
}

function derivePdfPath(packPath, pack) {
  if (pack.tailoredResumeToUpload) {
    const tail = pack.tailoredResumeToUpload.split('/').pop().replace(/\.md$/i, '.pdf');
    return `output/role-resumes/${tail}`;
  }
  const slug = packPath.split('/').pop()?.replace(/\.md$/i, '') || slugify(`${pack.company}-${pack.role}`);
  return `output/role-resumes/${slug}.pdf`;
}

function queueState(minPriority = DEFAULT_MIN_PRIORITY) {
  return parseNextBatch(minPriority).map((row) => {
    const packPath = path.join(ROOT, row.packPath);
    const pack = existsSync(packPath) ? parsePack(readFileSync(packPath, 'utf-8')) : {};
    return {
      ...row,
      packPath: row.packPath,
      pack: packPath,
      pdfPath: derivePdfPath(row.packPath, pack),
      formAnswers: pack.exactAnswers || {},
      emailDraft: pack.emailDraft || '',
      resumeToUpload: pack.resumeToUpload || '',
      tailoredResumeToUpload: pack.tailoredResumeToUpload || ''
    };
  });
}

function getStats(minPriority = DEFAULT_MIN_PRIORITY) {
  const today = new Date().toISOString().slice(0, 10);
  const submissions = parseSubmissions();
  const actionable = submissions.filter((r) => !['rejected', 'offer-accepted', 'withdrawn'].includes((r.status || '').toLowerCase()));
  const dueToday = actionable.filter((r) => r.followupDue === today).length;
  const overdue = actionable.filter((r) => r.followupDue < today).length;
  const queue = queueState(minPriority);

  return {
    today,
    appliedToday: submissions.filter((r) => r.date === today && r.status === 'submitted').length,
    pending: queue.length,
    followupsDue: dueToday + overdue,
    overdueFollowups: overdue,
    dueTodayFollowups: dueToday,
    totalSubmitted: submissions.length,
    threshold: minPriority
  };
}

function openFileInShell(target) {
  if (!target) return { ok: false, error: 'Missing target' };
  const platform = process.platform;
  if (platform === 'darwin') {
    execFileSync('open', [target], { stdio: 'ignore' });
    return { ok: true };
  }
  if (platform === 'win32') {
    execFileSync('cmd', ['/c', 'start', '', target], { stdio: 'ignore' });
    return { ok: true };
  }
  execFileSync('xdg-open', [target], { stdio: 'ignore' });
  return { ok: true };
}

function runWorkflow(count = 10) {
  execFileSync(process.execPath, [path.join(ROOT, 'workflow-auto.mjs'), String(count)], {
    cwd: ROOT,
    stdio: 'inherit'
  });
}

function runQueueRefresh(count = 10) {
  const topN = Number.isFinite(Number(count)) ? Math.max(1, Number(count)) : 10;
  execFileSync(process.execPath, [path.join(ROOT, 'rank-jobs.mjs')], { cwd: ROOT, stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(ROOT, 'generate-application-packs.mjs'), String(topN)], { cwd: ROOT, stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(ROOT, 'generate-tailored-resumes.mjs'), String(topN)], { cwd: ROOT, stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(ROOT, 'bulk-ats-score.mjs'), String(topN)], { cwd: ROOT, stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(ROOT, 'export-tailored-resume-pdfs.mjs'), String(topN)], { cwd: ROOT, stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(ROOT, 'next-apply-batch.mjs'), String(Math.min(5, topN))], { cwd: ROOT, stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(ROOT, 'followup-reminders.mjs')], { cwd: ROOT, stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(ROOT, 'generate-daily-dashboard.mjs')], { cwd: ROOT, stdio: 'inherit' });
}

function runSearchRefresh(count = 10) {
  execFileSync(process.execPath, [path.join(ROOT, 'scan.mjs')], { cwd: ROOT, stdio: 'inherit' });
  runQueueRefresh(count);
}

async function handleMark(body, res) {
  const packPath = body.packPath || body.pack || body.path;
  if (!packPath) {
    return json(res, 400, { ok: false, error: 'packPath is required' });
  }
  const status = body.status || 'submitted';
  const notes = body.notes ? [String(body.notes)] : [];
  execFileSync(process.execPath, [path.join(ROOT, 'mark-submitted.mjs'), packPath, status, ...notes], {
    cwd: ROOT,
    stdio: 'inherit'
  });
  execFileSync(process.execPath, [path.join(ROOT, 'next-apply-batch.mjs')], { cwd: ROOT, stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(ROOT, 'followup-reminders.mjs')], { cwd: ROOT, stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(ROOT, 'generate-daily-dashboard.mjs')], { cwd: ROOT, stdio: 'inherit' });
  json(res, 200, { ok: true, stats: getStats() });
}

async function handlePrepare(body, res) {
  const count = Number.isFinite(Number(body.count)) ? Math.max(1, Number(body.count)) : 10;
  runWorkflow(count);
  json(res, 200, { ok: true, stats: getStats() });
}

async function handleRefresh(body, res) {
  const count = Number.isFinite(Number(body.count)) ? Math.max(1, Number(body.count)) : 10;
  const mode = String(body.mode || 'queue').toLowerCase();
  const force = String(body.force || '').toLowerCase() === 'true' || body.force === true;
  const cooldownMs = REFRESH_COOLDOWN_MS[mode] || REFRESH_COOLDOWN_MS.queue;
  const cache = refreshState[mode] || refreshState.queue;
  const now = Date.now();

  if (!force && cache.at && (now - cache.at) < cooldownMs) {
    return json(res, 200, {
      ok: true,
      mode,
      skipped: true,
      cooldownMs,
      elapsedMs: now - cache.at,
      stats: cache.stats || getStats()
    });
  }

  if (mode === 'search') {
    runSearchRefresh(count);
    const stats = getStats();
    cache.at = now;
    cache.stats = stats;
    return json(res, 200, { ok: true, mode: 'search', stats });
  }

  runQueueRefresh(count);
  const stats = getStats();
  cache.at = now;
  cache.stats = stats;
  return json(res, 200, { ok: true, mode: 'queue', stats });
}

async function handleRegenerateRole(body, res) {
  const packPath = body.packPath || body.path;
  if (!packPath) {
    return json(res, 400, { ok: false, error: 'packPath is required' });
  }
  const result = regenerateRoleArtifacts(packPath);
  return json(res, 200, {
    ok: true,
    ...result,
    stats: getStats()
  });
}

async function handleApplyLink(body, res) {
  const rawUrl = String(body.url || '').trim();
  if (!/^https?:\/\//i.test(rawUrl)) {
    return json(res, 400, { ok: false, error: 'url is required and must start with http:// or https://' });
  }

  const args = [path.join(ROOT, 'apply-link.mjs'), rawUrl];
  const category = String(body.category || '').trim();
  const skills = String(body.skills || '').trim();
  const company = String(body.company || '').trim();
  const resume = String(body.resume || '').trim();

  if (category) args.push('--category', category);
  if (skills) args.push('--skills', skills);
  if (company) args.push('--company', company);
  if (resume) args.push('--resume', resume);

  const output = execFileSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const packMatch = output.match(/Quick pack:\s*(\S+)/i);
  const pdfMatch = output.match(/PDF:\s*(\S+)/i);
  const atsMatch = output.match(/ATS:\s*(\d+)\/100\s*\(([^)]+)\)/i);
  const packPath = packMatch?.[1]?.trim();
  if (!packPath) {
    return json(res, 500, { ok: false, error: 'Quick apply pack was not generated.' });
  }

  const absolute = path.isAbsolute(packPath) ? packPath : path.join(ROOT, packPath);
  if (!existsSync(absolute)) {
    return json(res, 500, { ok: false, error: `Generated pack not found: ${packPath}` });
  }

  const pack = parsePack(readFileSync(absolute, 'utf-8'));
  const item = {
    rank: 0,
    score: Number(pack.matchScore) || null,
    company: pack.company || 'Unknown Company',
    role: pack.role || 'Unknown Role',
    packPath,
    url: pack.url || rawUrl,
    ats: atsMatch ? Number(atsMatch[1]) : null,
    priority: null,
    submitted: false,
    pdfPath: pdfMatch?.[1]?.trim() || derivePdfPath(packPath, pack),
    resumeToUpload: pack.resumeToUpload || '',
    tailoredResumeToUpload: pack.tailoredResumeToUpload || ''
  };

  return json(res, 200, {
    ok: true,
    item,
    output,
    stats: getStats()
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
      });
      return res.end();
    }

    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, { ok: true, port: PORT });
    }

    if (req.method === 'GET' && url.pathname === '/api/profile') {
      return json(res, 200, { ok: true, profile: PROFILE });
    }

    if (req.method === 'GET' && url.pathname === '/api/stats') {
      const minPriority = Number(url.searchParams.get('minPriority') || DEFAULT_MIN_PRIORITY);
      return json(res, 200, { ok: true, ...getStats(minPriority) });
    }

    if (req.method === 'GET' && url.pathname === '/api/queue') {
      const minPriority = Number(url.searchParams.get('minPriority') || DEFAULT_MIN_PRIORITY);
      const limit = Number.isFinite(Number(url.searchParams.get('limit'))) ? Math.max(1, Number(url.searchParams.get('limit'))) : 5;
      return json(res, 200, { ok: true, items: queueState(minPriority).slice(0, limit) });
    }

    if (req.method === 'GET' && url.pathname === '/api/current') {
      const minPriority = Number(url.searchParams.get('minPriority') || DEFAULT_MIN_PRIORITY);
      const queueItem = queueState(minPriority)[0] || null;
      if (queueItem) {
        return json(res, 200, { ok: true, item: queueItem });
      }

      // Keep extension actions usable even when next-apply-batch has no matching rows.
      const pendingApp = applicationsState(minPriority, 1, false)[0]
        || applicationsState(0, 1, false)[0]
        || applicationsState(0, 1, true)[0]
        || null;
      return json(res, 200, { ok: true, item: pendingApp });
    }

    if (req.method === 'GET' && url.pathname === '/api/applications') {
      const minPriority = Number(url.searchParams.get('minPriority') || 0);
      const limit = Number.isFinite(Number(url.searchParams.get('limit'))) ? Math.max(1, Number(url.searchParams.get('limit'))) : 300;
      const includeSubmitted = String(url.searchParams.get('includeSubmitted') || 'true').toLowerCase() !== 'false';
      return json(res, 200, {
        ok: true,
        items: applicationsState(minPriority, limit, includeSubmitted)
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/pack') {
      const packPath = url.searchParams.get('path') || '';
      if (!packPath) return json(res, 400, { ok: false, error: 'path is required' });
      const absolute = path.isAbsolute(packPath) ? packPath : path.join(ROOT, packPath);
      if (!existsSync(absolute)) return json(res, 404, { ok: false, error: 'Pack not found' });
      const pack = parsePack(readFileSync(absolute, 'utf-8'));
      const pdfPath = derivePdfPath(packPath, pack);
      return json(res, 200, {
        ok: true,
        packPath,
        pdfPath,
        ...pack,
        profile: PROFILE
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/pdf') {
      const pdfPath = url.searchParams.get('path') || '';
      if (!pdfPath) return json(res, 400, { ok: false, error: 'path is required' });
      const absolute = path.isAbsolute(pdfPath) ? pdfPath : path.join(ROOT, pdfPath);
      if (!existsSync(absolute)) return json(res, 404, { ok: false, error: 'PDF not found' });
      const buf = readFileSync(absolute);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${path.basename(absolute)}"`,
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(buf);
    }

    if (req.method === 'POST' && url.pathname === '/api/mark') {
      const body = await readJson(req);
      return handleMark(body, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/prepare') {
      const body = await readJson(req);
      return handlePrepare(body, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/refresh') {
      const body = await readJson(req);
      return handleRefresh(body, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/regenerate-role') {
      const body = await readJson(req);
      return handleRegenerateRole(body, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/apply-link') {
      const body = await readJson(req);
      return handleApplyLink(body, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/open') {
      const body = await readJson(req);
      const result = openFileInShell(body.path || body.target || '');
      return json(res, result.ok ? 200 : 400, result.ok ? { ok: true } : { ok: false, error: result.error });
    }

    if (req.method === 'GET' && url.pathname === '/') {
      return text(
        res,
        200,
        'Career Ops extension helper is running. Open the Chrome extension side panel.',
        'text/plain; charset=utf-8'
      );
    }

    return json(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    return json(res, 500, { ok: false, error: err?.message || String(err) });
  }
});

async function handleListenError(err) {
  if (err?.code !== 'EADDRINUSE') {
    console.error(err?.message || String(err));
    process.exit(1);
  }

  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/api/health`, { cache: 'no-store' });
    const data = response.ok ? await response.json().catch(() => null) : null;
    if (data?.ok) {
      console.log(`Career Ops extension helper already running at http://127.0.0.1:${PORT}`);
      process.exit(0);
    }
  } catch {
    // Fall through to the user-facing error below.
  }

  console.error(`Port ${PORT} is already in use. Stop the existing Career Ops helper or set CAREER_OPS_EXTENSION_PORT to use another port.`);
  process.exit(1);
}

server.on('error', (err) => {
  handleListenError(err).catch((startupErr) => {
    console.error(startupErr?.message || String(startupErr));
    process.exit(1);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Career Ops extension helper running at http://127.0.0.1:${PORT}`);
});
