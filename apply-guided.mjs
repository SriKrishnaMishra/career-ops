#!/usr/bin/env node

import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output, platform } from 'process';
import { execFileSync, spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';

const BATCH_PATH = 'data/next-apply-batch.md';
const SUBMISSIONS_PATH = 'data/submissions.tsv';

function parseArgs(argv) {
  const args = { minPriority: 55 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--min-priority') {
      const v = Number(argv[i + 1]);
      if (Number.isFinite(v)) args.minPriority = v;
      i += 1;
    }
  }
  return args;
}

function parseBatch(md) {
  const rows = [];
  let inTable = false;

  for (const line of md.split('\n')) {
    if (line.startsWith('|') && line.includes('| # | Score | ATS | Priority |')) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith('|')) {
      if (rows.length > 0) break;
      continue;
    }
    if (line.includes('|---')) continue;

    const cols = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cols.length < 8) continue;

    rows.push({
      rank: Number(cols[0]),
      score: Number(cols[1]),
      ats: cols[2],
      priority: Number(cols[3]),
      company: cols[4],
      role: cols[5],
      pack: cols[6],
      url: cols[7]
    });
  }

  return rows;
}

function openPath(target) {
  if (!target) return;
  try {
    if (platform === 'darwin') {
      spawn('open', [target], { detached: true, stdio: 'ignore' }).unref();
      return;
    }
    if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore' }).unref();
      return;
    }
    spawn('xdg-open', [target], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // keep guided flow running even if opener is unavailable
  }
}

function refreshArtifacts() {
  execFileSync('node', ['next-apply-batch.mjs'], { stdio: 'inherit' });
  execFileSync('node', ['followup-reminders.mjs'], { stdio: 'inherit' });
  execFileSync('node', ['generate-daily-dashboard.mjs'], { stdio: 'inherit' });
}

function loadQueue() {
  if (!existsSync(BATCH_PATH)) {
    throw new Error(`Missing ${BATCH_PATH}. Run npm run apply:next first.`);
  }
  const rows = parseBatch(readFileSync(BATCH_PATH, 'utf-8'));
  if (rows.length === 0) {
    throw new Error('Queue is empty. Run npm run workflow:auto -- 10 first.');
  }
  return rows;
}

function parseSubmissions() {
  if (!existsSync(SUBMISSIONS_PATH)) return [];
  return readFileSync(SUBMISSIONS_PATH, 'utf-8')
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => line.split('\t'))
    .filter((cols) => cols.length >= 7)
    .map((cols) => ({
      date: cols[0],
      status: (cols[5] || '').toLowerCase(),
      followupDue: cols[6]
    }));
}

function actionable(status) {
  return !['rejected', 'offer-accepted', 'withdrawn'].includes(status);
}

function getStats(queue) {
  const today = new Date().toISOString().slice(0, 10);
  const submissions = parseSubmissions();
  const appliedToday = submissions.filter((s) => s.date === today && s.status === 'submitted').length;
  const followupsDue = submissions.filter((s) => actionable(s.status) && s.followupDue <= today).length;
  return {
    appliedToday,
    pending: queue.length,
    followupsDue
  };
}

function printPanel(queue, minPriority, lowPrioritySkippedTotal) {
  const stats = getStats(queue);
  console.log('============================================================');
  console.log('Daily Summary');
  console.log(`Applied today: ${stats.appliedToday} | Pending queue: ${stats.pending} | Follow-ups due: ${stats.followupsDue}`);
  console.log(`Auto-skip priority threshold: ${minPriority} | Low-priority skipped this run: ${lowPrioritySkippedTotal}`);
  console.log('Hotkeys: [Enter]=submitted  [k]=skip  [r]=rejected  [o]=open links  [q]=quit');
  console.log('============================================================');
}

async function main() {
  const { minPriority } = parseArgs(process.argv.slice(2));
  const rl = createInterface({ input, output });

  console.log('Guided Apply Mode');
  console.log('One UI flow: you login manually on each portal, then use hotkeys to finish tracking.');
  console.log('Final submit remains manual by design (login/captcha/portal checks).');
  console.log('');

  let rawQueue = loadQueue();
  let lowPrioritySkippedTotal = 0;

  let queue = rawQueue.filter((r) => {
    if (!Number.isFinite(r.priority)) return true;
    return r.priority >= minPriority;
  });
  lowPrioritySkippedTotal = rawQueue.length - queue.length;

  if (queue.length === 0) {
    rl.close();
    console.log(`No roles above priority threshold ${minPriority}.`);
    console.log('Tip: lower threshold, e.g. npm run apply:guided -- --min-priority 45');
    return;
  }

  while (queue.length > 0) {
    const current = queue[0];

    printPanel(queue, minPriority, lowPrioritySkippedTotal);

    console.log(`Now applying: ${current.company} | ${current.role}`);
    const pr = Number.isFinite(current.priority) ? current.priority : '-';
    console.log(`ATS=${current.ats} Priority=${pr} Rank=${current.rank}`);
    console.log(`Pack: ${current.pack}`);
    console.log(`URL: ${current.url}`);

    // Open once by default to support manual login and form fill.
    if (current.url || current.pack) {
      openPath(current.url);
      openPath(current.pack);
      console.log('Opened URL and pack file in your system apps.');
    }

    let action = '__pending__';
    while (!['', 'k', 'r', 'o', 'q', 'submitted', 'skip', 'rejected', 'open', 'quit'].includes(action)) {
      action = (await rl.question('Action [Enter/k/r/o/q]: ')).trim().toLowerCase();
    }

    if (action === 'q' || action === 'quit') {
      break;
    }

    if (action === 'o' || action === 'open') {
      openPath(current.url);
      openPath(current.pack);
      console.log('Re-opened URL and pack.');
      console.log('');
      continue;
    }

    if (action === 'k' || action === 'skip') {
      console.log('Skipped this role for now.');
      queue = queue.slice(1).concat(current);
      console.log('');
      continue;
    }

    let status = 'submitted';
    if (action === 'r' || action === 'rejected') status = 'rejected';

    const notes = (await rl.question('Optional notes (or press Enter): ')).trim();
    const args = ['mark-submitted.mjs', current.pack, status];
    if (notes) args.push(notes);

    execFileSync('node', args, { stdio: 'inherit' });
    refreshArtifacts();

    console.log('Saved status and refreshed next batch/dashboard.');
    console.log('');

    rawQueue = loadQueue();
    queue = rawQueue.filter((r) => {
      if (!Number.isFinite(r.priority)) return true;
      return r.priority >= minPriority;
    });
    lowPrioritySkippedTotal = rawQueue.length - queue.length;
  }

  rl.close();
  console.log('Guided apply ended.');
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
