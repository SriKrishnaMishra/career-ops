#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';

const SUBMISSIONS_PATH = 'data/submissions.tsv';
const OUTPUT_PATH = 'data/followups.md';

if (!existsSync(SUBMISSIONS_PATH)) {
  const today = new Date().toISOString().slice(0, 10);
  const out = [
    `# Follow-up Reminders (${today})`,
    '',
    'No submissions log found yet.',
    '',
    'Create your first log entry after manual submit with:',
    '',
    '- npm run apply:submit -- <pack-path> submitted',
    ''
  ];
  writeFileSync(OUTPUT_PATH, out.join('\n'), 'utf-8');
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log('No submissions yet.');
  process.exit(0);
}

const rows = readFileSync(SUBMISSIONS_PATH, 'utf-8')
  .trim()
  .split('\n')
  .slice(1)
  .map(line => line.split('\t'))
  .filter(cols => cols.length >= 7)
  .map(cols => ({
    date: cols[0],
    company: cols[1],
    role: cols[2],
    url: cols[3],
    resume: cols[4],
    status: cols[5],
    followupDue: cols[6],
    notes: cols[7] || ''
  }));

const today = new Date().toISOString().slice(0, 10);
const actionable = rows.filter(r => !['rejected', 'offer-accepted', 'withdrawn'].includes(r.status));

const overdue = actionable.filter(r => r.followupDue < today);
const dueToday = actionable.filter(r => r.followupDue === today);
const upcoming = actionable.filter(r => r.followupDue > today);

const out = [];
out.push(`# Follow-up Reminders (${today})`);
out.push('');
out.push(`Total tracked submissions: ${rows.length}`);
out.push(`Actionable: ${actionable.length}`);
out.push('');

function addSection(title, list) {
  out.push(`## ${title}`);
  out.push('');
  if (list.length === 0) {
    out.push('- None');
    out.push('');
    return;
  }

  out.push('| Due | Company | Role | Status | URL |');
  out.push('|---|---|---|---|---|');
  for (const r of list) {
    out.push(`| ${r.followupDue} | ${r.company} | ${r.role.replace(/\|/g, '/')} | ${r.status} | ${r.url} |`);
  }
  out.push('');
}

addSection('Overdue', overdue);
addSection('Due Today', dueToday);
addSection('Upcoming', upcoming.slice(0, 30));

out.push('## Suggested Message');
out.push('');
out.push('Hello [Name], I recently applied for [Role] at [Company] and wanted to follow up on my application status. I remain very interested in the role and would be happy to provide any additional information. Thank you for your time.');
out.push('');

writeFileSync(OUTPUT_PATH, out.join('\n'), 'utf-8');
console.log(`Wrote ${OUTPUT_PATH}`);
console.log(`Overdue: ${overdue.length}, Due today: ${dueToday.length}, Upcoming: ${upcoming.length}`);
