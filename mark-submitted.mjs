#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';

const [, , packPath, statusArg = 'submitted', ...noteArgs] = process.argv;
if (!packPath) {
  console.error('Usage: node mark-submitted.mjs <pack-path> [status] [notes...]');
  process.exit(1);
}

if (!existsSync(packPath)) {
  console.error(`Pack not found: ${packPath}`);
  process.exit(1);
}

const SUBMISSIONS_PATH = 'data/submissions.tsv';
const PIPELINE_PATH = 'data/pipeline.md';

function parsePack(md) {
  const company = md.match(/- Company:\s*(.+)/)?.[1]?.trim() || '';
  const role = md.match(/- Role:\s*(.+)/)?.[1]?.trim() || '';
  const url = md.match(/- URL:\s*(https?:\/\/\S+)/)?.[1]?.trim() || '';
  const resume = md.match(/## Resume To Upload\s*-\s*(.+)/m)?.[1]?.trim() || '';

  if (!company || !role || !url) {
    throw new Error('Could not parse company/role/url from pack file.');
  }

  return { company, role, url, resume };
}

function addBusinessDays(dateStr, days) {
  const date = new Date(dateStr);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const d = date.getDay();
    if (d !== 0 && d !== 6) added += 1;
  }
  return date.toISOString().slice(0, 10);
}

function ensureHeader() {
  if (!existsSync(SUBMISSIONS_PATH)) {
    writeFileSync(
      SUBMISSIONS_PATH,
      'date\tcompany\trole\turl\tresume\tstatus\tfollowup_due\tnotes\n',
      'utf-8'
    );
  }
}

function markPipelineChecked(url) {
  if (!existsSync(PIPELINE_PATH)) return false;
  const text = readFileSync(PIPELINE_PATH, 'utf-8');
  const target = `- [ ] ${url} |`;
  if (!text.includes(target)) return false;
  const updated = text.replace(target, `- [x] ${url} |`);
  writeFileSync(PIPELINE_PATH, updated, 'utf-8');
  return true;
}

const packText = readFileSync(packPath, 'utf-8');
const { company, role, url, resume } = parsePack(packText);
const status = statusArg.toLowerCase();
const notes = noteArgs.join(' ').trim();

const today = new Date().toISOString().slice(0, 10);
const followupDue = addBusinessDays(today, 5);

ensureHeader();
appendFileSync(
  SUBMISSIONS_PATH,
  `${today}\t${company}\t${role}\t${url}\t${resume}\t${status}\t${followupDue}\t${notes}\n`,
  'utf-8'
);

const marked = markPipelineChecked(url);

console.log(`Logged submission: ${company} | ${role}`);
console.log(`Follow-up due: ${followupDue}`);
console.log(`Pipeline updated: ${marked ? 'yes' : 'no (no matching unchecked URL found)'}`);
