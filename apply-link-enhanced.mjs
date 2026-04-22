#!/usr/bin/env node

/**
 * Apply Link - Enhanced version
 * Fixes: Accepts job URL from multiple sources (argument, clipboard, browser tab)
 * New: Integrates hybrid AI for resume generation
 */

import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { URL } from 'url';

const args = process.argv.slice(2);

function getArg(flag, fallback = '') {
  const i = args.indexOf(flag);
  if (i === -1) return fallback;
  return args[i + 1] || fallback;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (m?.[1]) return m[1].trim();
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) return stripHtml(h1[1]).trim();
  return 'AI/ML Role';
}

function normalizeRole(title) {
  return title
    .replace(/^job application for\s*/i, '')
    .replace(/\s*[\-|:]\s*(careers?|jobs?).*$/i, '')
    .replace(/\s*\|\s*.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function companyFromUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./, '');
    const first = host.split('.')[0] || 'Company';
    return first.charAt(0).toUpperCase() + first.slice(1);
  } catch {
    return 'Company';
  }
}

function chooseResume(role, track, explicitResume) {
  if (explicitResume) return explicitResume;
  if (track.includes('intern') || /intern|new grad|graduate|co-op/i.test(role)) {
    if (existsSync('cv-internship.md')) return 'cv-internship.md';
  }
  if (existsSync('cv-fulltime.md')) return 'cv-fulltime.md';
  return 'cv.md';
}

function ensurePipelineLine(url, company, role, category) {
  const path = 'data/pipeline.md';
  const line = `- [ ] ${url} | ${company} | ${role} [${category}]`;

  if (!existsSync(path)) {
    const text = '# Pipeline\n\n## Pendientes\n\n' + line + '\n';
    writeFileSync(path, text, 'utf-8');
    return { added: true, line };
  }

  const current = readFileSync(path, 'utf-8');
  if (current.includes(url)) return { added: false, line };

  const marker = '## Pendientes';
  const idx = current.indexOf(marker);
  if (idx === -1) {
    writeFileSync(path, current.trimEnd() + '\n\n## Pendientes\n\n' + line + '\n', 'utf-8');
    return { added: true, line };
  }

  const afterMarker = idx + marker.length;
  const nextSection = current.indexOf('\n## ', afterMarker);
  const insertAt = nextSection === -1 ? current.length : nextSection;
  const updated = current.slice(0, insertAt) + '\n' + line + '\n' + current.slice(insertAt);
  writeFileSync(path, updated, 'utf-8');
  return { added: true, line };
}

function markdownToHtml(md, title) {
  const esc = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const body = md.split('\n').map((line) => {
    if (line.startsWith('# ')) return `<h1>${esc(line.slice(2))}</h1>`;
    if (line.startsWith('## ')) return `<h2>${esc(line.slice(3))}</h2>`;
    if (line.startsWith('### ')) return `<h3>${esc(line.slice(4))}</h3>`;
    if (line.startsWith('- ')) return `<li>${esc(line.slice(2))}</li>`;
    if (line.trim() === '') return '<div class="sp"></div>';
    return `<p>${esc(line)}</p>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }
    .page { max-width: 8.27in; margin: 0 auto; padding: 0.25in 0.2in; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    h2 { font-size: 15px; margin: 14px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    h3 { font-size: 13px; margin: 10px 0 4px; }
    p { font-size: 11px; line-height: 1.45; margin: 4px 0; }
    li { font-size: 11px; line-height: 1.45; margin: 2px 0 2px 18px; }
    .sp { height: 6px; }
  </style>
</head>
<body>
  <div class="page">${body}</div>
</body>
</html>`;
}

/**
 * TRY TO GET URL FROM MULTIPLE SOURCES
 * 1. Command line argument
 * 2. Clipboard
 * 3. Extension message (will come from service worker)
 */
function getJobUrl() {
  // 1. Check if passed as argument
  let url = args.find(a => /^https?:\/\//i.test(a));
  if (url) return url;
  
  // 2. Try to get from clipboard
  try {
    const clipResult = spawnSync('xclip', ['-selection', 'clipboard', '-o'], {
      encoding: 'utf-8',
      timeout: 1000
    });
    
    if (clipResult.status === 0 && clipResult.stdout) {
      const clipboardText = clipResult.stdout.trim();
      if (/^https?:\/\//i.test(clipboardText)) {
        console.log('📋 Using URL from clipboard');
        return clipboardText;
      }
    }
  } catch (e) {
    // Clipboard not available or command failed
  }
  
  // 3. If running in browser context, would get from extension
  // This would be handled by the extension service worker
  
  return null;
}

/**
 * Show helpful error message with available options
 */
function showUsageError() {
  console.error('\n❌ Error: Could not find job URL\n');
  console.error('Usage options:\n');
  console.error('1. Command line argument:');
  console.error('   npm run apply-link "https://careers.capgemini.com/job/..."\n');
  console.error('2. Copy URL to clipboard, then run:');
  console.error('   npm run apply-link\n');
  console.error('3. From browser extension:');
  console.error('   - Open the job page in your browser');
  console.error('   - Click Career-Ops extension');
  console.error('   - Click "Add Current Job to Pipeline"\n');
  process.exit(1);
}

async function main() {
  const url = getJobUrl();
  
  if (!url) {
    showUsageError();
  }

  try {
    console.log('\n🔗 Processing job URL...');
    console.log(`URL: ${url.substring(0, 80)}...\n`);

    const category = getArg('--category', 'ai/ml');
    const skillsRaw = getArg('--skills', '');
    const extraSkills = skillsRaw.split(',').map(s => s.trim()).filter(Boolean);
    const companyOverride = getArg('--company', '');
    const resumeOverride = getArg('--resume', '');
    const useAI = !args.includes('--no-ai'); // Default to using AI

    // Fetch job page
    console.log('📄 Fetching job page...');
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Failed to fetch URL: HTTP ${res.status}`);
    const html = await res.text();
    const text = stripHtml(html);
    const title = parseTitle(html);
    const role = normalizeRole(title);
    const company = companyOverride || companyFromUrl(url);

    const resumePath = chooseResume(role, category, resumeOverride);
    if (!existsSync(resumePath)) {
      throw new Error(`Resume not found: ${resumePath}`);
    }

    const lineResult = ensurePipelineLine(url, company, role, category);

    const slug = slugify(`${company}-${role}`);
    mkdirSync('data/jd-cache', { recursive: true });
    mkdirSync('data/quick-apply', { recursive: true });
    mkdirSync('data/role-resumes', { recursive: true });
    mkdirSync('data/role-resumes-html', { recursive: true });
    mkdirSync('output/role-resumes', { recursive: true });

    // Save job description
    const jdPath = `data/jd-cache/${slug}.txt`;
    const skillsHint = extraSkills.length ? `\n\nPreferred skills: ${extraSkills.join(', ')}` : '';
    writeFileSync(jdPath, `${role}\n\n${text}${skillsHint}\n`, 'utf-8');

    // Score ATS match
    console.log('📊 Calculating ATS score...');
    const atsOutput = execFileSync('node', ['ats-score.mjs', jdPath, resumePath], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const scoreMatch = atsOutput.match(/ATS score:\s*(\d+)\/100\s*\(([^)]+)\)/i);
    const reportMatch = atsOutput.match(/Report:\s*(\S+)/i);
    const atsScore = scoreMatch ? Number(scoreMatch[1]) : 0;
    const atsBand = scoreMatch ? scoreMatch[2].toLowerCase() : 'unknown';
    const reportPath = reportMatch ? reportMatch[1] : '';

    // Generate tailored resume
    console.log('✍️  Generating tailored resume...');
    const baseResume = readFileSync(resumePath, 'utf-8');
    
    let tailoredResume = `# Tailored Resume\n\n## Role\n- Company: ${company}\n- Role: ${role}\n- URL: ${url}\n- Category: ${category}\n- ATS Score: ${atsScore}/100 (${atsBand})\n\n## Added Skills To Emphasize\n${extraSkills.length ? extraSkills.map(s => `- ${s}`).join('\n') : '- None'}\n\n## Base Resume Content\n\n${baseResume}`;

    // Try to use AI for resume tailoring if available
    if (useAI) {
      try {
        console.log('🤖 Enhancing resume with AI...');
        const aiEnhanced = await tryEnhanceWithAI(text, baseResume, role, company);
        if (aiEnhanced) {
          tailoredResume = aiEnhanced;
          console.log('✅ AI enhancement successful');
        }
      } catch (e) {
        console.warn('⚠️  AI enhancement skipped:', e.message);
        // Continue with regular tailored resume
      }
    }

    const tailoredResumePath = `data/role-resumes/${slug}.md`;
    writeFileSync(tailoredResumePath, tailoredResume, 'utf-8');

    // Generate PDF
    console.log('📑 Generating PDF...');
    const htmlPath = `data/role-resumes-html/${slug}.html`;
    const pdfPath = `output/role-resumes/${slug}.pdf`;
    writeFileSync(htmlPath, markdownToHtml(tailoredResume, `${company} - ${role}`), 'utf-8');
    execFileSync('node', ['generate-pdf.mjs', htmlPath, pdfPath, '--format=a4'], { stdio: 'ignore' });

    // Create quick apply pack
    const packPath = `data/quick-apply/${slug}.md`;
    const pack = `# Quick Apply Pack\n\n## Role\n- Company: ${company}\n- Role: ${role}\n- URL: ${url}\n- Category: ${category}\n\n## ATS Match\n- Score: ${atsScore}/100 (${atsBand})\n- Report: ${reportPath || 'N/A'}\n\n## Resume To Upload\n- ${tailoredResumePath}\n\n## PDF Resume To Upload\n- ${pdfPath}\n\n## Resume Files\n- Base Resume: ${resumePath}\n- Tailored Resume: ${tailoredResumePath}\n- PDF Resume: ${pdfPath}\n\n## Skills Added\n${extraSkills.length ? extraSkills.map(s => `- ${s}`).join('\n') : '- None'}\n\n## Form Draft\n- Name: Sri Krishna Mishra\n- Email: srikrishnamishra006@gmail.com\n- Phone: +91 9905582516\n- LinkedIn: LinkedIn\n- GitHub: GitHub\n\n## Final Steps\n1. Open the URL and login.\n2. Upload ${pdfPath}.\n3. Paste details from this pack.\n4. Submit (manual captcha/login if required).\n5. Log it: npm run apply:submit -- ${packPath} submitted\n`;
    writeFileSync(packPath, pack, 'utf-8');

    // Success output
    console.log('\n✅ Success!\n');
    console.log('📋 Pipeline updated:', lineResult.added ? '✅ Added' : '⚠️  Already existed');
    console.log(`📊 ATS Score: ${atsScore}/100 (${atsBand})`);
    console.log(`📦 Quick pack: ${packPath}`);
    console.log(`📄 Tailored resume: ${tailoredResumePath}`);
    console.log(`📑 PDF: ${pdfPath}`);
    console.log('\n🎯 Next: Open extension and click "Start Automatic Application"\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message, '\n');
    process.exit(1);
  }
}

/**
 * Try to enhance resume using hybrid AI
 * Falls back gracefully if AI not available
 */
async function tryEnhanceWithAI(jobDescription, baseResume, role, company) {
  try {
    // Try to dynamically import hybrid AI (will fail gracefully if not available)
    const module = await import('./hybrid-ai.mjs');
    const HybridAIEngine = module.default;
    
    if (!HybridAIEngine) return null;
    
    const ai = new HybridAIEngine();
    
    // Check if AI is actually available
    const capabilities = ai.getCapabilities();
    if (!capabilities.ollama && !capabilities.geminiNano) {
      return null; // No AI available
    }

    // Generate with AI
    const profile = {
      name: 'Sri Krishna Mishra',
      email: 'srikrishnamishra006@gmail.com',
      phone: '+91 9905582516',
      location: 'India'
    };

    const aiResume = await ai.generateTailoredResume(jobDescription, profile);
    return aiResume;
    
  } catch (e) {
    // AI module not available or generation failed
    return null;
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
