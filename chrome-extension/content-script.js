const HELPERS = ['http://127.0.0.1:3030', 'http://localhost:3030'];

async function helperFetch(path, options = {}) {
  let lastError = null;
  for (const base of HELPERS) {
    try {
      return await fetch(`${base}${path}`, { cache: 'no-store', ...options });
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(lastError?.message || 'Cannot reach helper server');
}

async function helperJson(path, options = {}) {
  const res = await helperFetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function portalName() {
  const host = window.location.hostname.toLowerCase();
  if (host.includes('ashbyhq.com')) return 'ashby';
  if (host.includes('greenhouse.io')) return 'greenhouse';
  if (host.includes('lever.co') || host.includes('jobs.lever.co')) return 'lever';
  return 'generic';
}

function isUsableField(field) {
  if (!field || field.disabled || field.readOnly) return false;
  const type = (field.type || '').toLowerCase();
  if (type === 'hidden') return false;
  return true;
}

function setNativeValue(el, value) {
  const proto = Object.getPrototypeOf(el);
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
    || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
    || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function normalizeKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function labelTextFor(el) {
  const aria = [el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('name'), el.id].filter(Boolean).join(' ');
  const label = el.labels && el.labels.length ? Array.from(el.labels).map((node) => node.textContent || '').join(' ') : '';
  const surrounding = el.closest('label, div, section, fieldset, .field, [data-testid]')?.textContent || '';
  return `${aria} ${label} ${surrounding}`.toLowerCase();
}

function matchFieldKey(text) {
  const t = text.toLowerCase();
  if (/(first name|given name|forename|fname)/.test(t)) return 'first name';
  if (/(last name|surname|lname|family name)/.test(t)) return 'last name';
  if (/(full name|your name|candidate name|name\b)/.test(t)) return 'name';
  if (/(email|e-mail)/.test(t)) return 'email';
  if (/(phone|mobile|telephone|contact number|cell)/.test(t)) return 'phone';
  if (/(resume|cv|curriculum vitae)/.test(t)) return 'resume';
  if (/(linkedin)/.test(t)) return 'linkedin profile';
  if (/(github|git hub)/.test(t)) return 'github';
  if (/(website|portfolio|personal site)/.test(t)) return 'website';
  if (/(years of experience|experience years|years? experience)/.test(t)) return 'years of experience';
  if (/(what excites you|why .*role|why us|motivat)/.test(t)) return 'what excites you about this role?';
  if (/(proud of|most proud|achievement|project you are proud)/.test(t)) return 'what work of yours are you most proud of?';
  if (/(location|country|where do you live|based in)/.test(t)) return 'location';
  if (/(authorization to work|authori[sz]ation to work|authorized to work|work authorization)/.test(t)) return 'work authorization';
  if (/(what languages are you fluent in|languages are you fluent)/.test(t)) return 'what languages are you fluent in?';
  if (/(most complex llm project|complex llm project|few llm experiment|ai project)/.test(t)) return 'what is your most complex llm project?';
  if (/(optimize for in life)/.test(t)) return 'what do you optimize for in life?';
  if (/(how intensely do you like working|intensely do you like working)/.test(t)) return 'how intensely do you like working?';
  if (/(what should we know about you)/.test(t)) return 'what should we know about you?';
  return '';
}

function buildAnswerEntries(answers) {
  return Object.entries(answers || {}).map(([key, value]) => ({
    rawKey: key,
    key: normalizeKey(key),
    value: String(value || '').trim()
  })).filter((entry) => entry.value);
}

function tokenizeNormalized(text) {
  return normalizeKey(text)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function overlapScore(a, b) {
  const setA = new Set(tokenizeNormalized(a));
  const setB = new Set(tokenizeNormalized(b));
  if (!setA.size || !setB.size) return 0;
  let hits = 0;
  for (const token of setA) {
    if (setB.has(token)) hits += 1;
  }
  return hits / Math.max(setA.size, setB.size);
}

function findAnswerByQuestionText(question, answerEntries) {
  const normalizedQuestion = normalizeKey(question);
  if (!normalizedQuestion || normalizedQuestion.length < 4) return '';

  const direct = answerEntries.find((entry) => normalizedQuestion === entry.key);
  if (direct) return direct.value;

  const overlap = answerEntries
    .filter((entry) => normalizedQuestion.includes(entry.key) || entry.key.includes(normalizedQuestion))
    .sort((a, b) => b.key.length - a.key.length)[0];
  if (overlap) return overlap.value;

  const semantic = answerEntries
    .map((entry) => ({
      entry,
      score: overlapScore(normalizedQuestion, entry.key)
    }))
    .filter((item) => item.score >= 0.25)
    .sort((a, b) => b.score - a.score)[0];
  if (semantic) return semantic.entry.value;

  return '';
}

function compactAnswer(text, maxChars = 650) {
  const cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars - 1).trim()}…`;
}

function composeUnknownQuestionAnswer(questionText, profile, answers, answerEntries) {
  const q = String(questionText || '').trim();
  if (!q) return '';

  const bestKnown = findAnswerByQuestionText(q, answerEntries);
  if (bestKnown) return compactAnswer(bestKnown);

  const name = String(profile?.name || '').trim() || 'I';
  const roleContext = String(profile?.targetRole || profile?.headline || '').trim();
  const proudWork = answers?.['what work of yours are you most proud of?'] || '';
  const motivation = answers?.['what excites you about this role?'] || '';

  const normalized = normalizeKey(q);
  if (/challenge|difficult|complex|problem|debug|incident|failure/.test(normalized)) {
    return compactAnswer(`${name} approach complex problems by breaking them into measurable milestones, validating assumptions quickly, and iterating with feedback loops until quality and reliability targets are met.`);
  }
  if (/team|collaborat|stakeholder|communicat|cross functional/.test(normalized)) {
    return compactAnswer(`${name} work best in collaborative teams with clear ownership, fast communication, and shared quality standards. I proactively document decisions and align execution with product outcomes.`);
  }
  if (/why|motivat|interest|excite|join/.test(normalized) && motivation) {
    return compactAnswer(motivation);
  }
  if (/proud|project|achievement|portfolio|built|build/.test(normalized) && proudWork) {
    return compactAnswer(proudWork);
  }

  const generic = [
    roleContext ? `I am focused on ${roleContext}.` : 'I focus on building practical, production-ready AI systems.',
    'I optimize for measurable user impact, reliability, and continuous improvement.',
    'I am comfortable owning ambiguous problems end-to-end and shipping with high quality.'
  ].join(' ');

  return compactAnswer(generic);
}

function resolveValue(key, answers, profile) {
  const normalizedKey = normalizeKey(key);
  const aliasMap = {
    'linkedin profile': 'linkedin',
    github: 'github',
    website: 'website',
    portfolio: 'website',
    'years of experience': 'years',
    location: 'location',
    country: 'location',
    name: 'name',
    email: 'email',
    phone: 'phone',
    'first name': 'first name',
    'last name': 'last name'
  };
  const profileKey = aliasMap[normalizedKey] || normalizedKey;
  const answerEntries = Object.entries(answers || {});
  const directAnswer = answers?.[normalizedKey] || answers?.[profileKey];
  const fuzzyAnswer = answerEntries.find(([k]) => {
    const normalizedAnswerKey = normalizeKey(k);
    return normalizedAnswerKey === normalizedKey || normalizedAnswerKey.includes(normalizedKey) || normalizedKey.includes(normalizedAnswerKey);
  })?.[1];
  return directAnswer || fuzzyAnswer || profile?.[normalizedKey] || profile?.[profileKey] || '';
}

function sanitizeResolvedValue(key, value) {
  const normalizedKey = normalizeKey(key);
  const raw = String(value || '').trim();
  if (!raw) return '';

  if ((normalizedKey === 'linkedin profile' || normalizedKey === 'linkedin') && /^linkedin$/i.test(raw)) return '';
  if (normalizedKey === 'github' && /^github$/i.test(raw)) return '';
  if ((normalizedKey === 'website' || normalizedKey === 'portfolio') && /^(website|portfolio|personal site)$/i.test(raw)) return '';

  return raw;
}

function optionTextFor(field) {
  return [
    field.value,
    field.getAttribute('value'),
    field.getAttribute('aria-label'),
    field.closest('label')?.textContent || '',
    field.parentElement?.textContent || ''
  ].filter(Boolean).join(' ').toLowerCase();
}

function fallbackAnswerForQuestion(label, profile, answers) {
  const t = String(label || '').toLowerCase();
  if (!t) return '';

  if (/(authorization to work|authori[sz]ation to work|authorized to work|work authorization)/.test(t)) {
    return answers?.['work authorization'] || 'Yes';
  }
  if (/(what languages are you fluent in|languages are you fluent)/.test(t)) {
    return answers?.['what languages are you fluent in?'] || profile?.languages || 'English, Hindi';
  }
  if (/(most complex llm project|complex llm project|few llm experiment|ai project)/.test(t)) {
    return answers?.['what is your most complex llm project?']
      || answers?.['what work of yours are you most proud of?']
      || 'I build production-focused AI systems end-to-end: data pipeline, retrieval, prompting, evaluation, and deployment. I focus on reliability, latency, and measurable user impact.';
  }
  if (/(optimize for in life)/.test(t)) {
    return answers?.['what do you optimize for in life?']
      || 'I optimize for long-term learning, useful output, and consistent execution with high ownership.';
  }
  if (/(how intensely do you like working|intensely do you like working)/.test(t)) {
    return answers?.['how intensely do you like working?']
      || 'I enjoy working with high intensity in focused blocks while keeping quality and consistency high.';
  }
  if (/(what should we know about you)/.test(t)) {
    return answers?.['what should we know about you?']
      || 'I learn quickly, communicate clearly, and like shipping practical AI systems that solve real user problems.';
  }

  return '';
}

function allFields() {
  return queryAllDeep('input, textarea, select');
}

function queryAllDeep(selector, root = document) {
  const found = [];
  const stack = [root];

  while (stack.length) {
    const current = stack.pop();
    if (!current?.querySelectorAll) continue;

    found.push(...Array.from(current.querySelectorAll(selector)));

    const descendants = current.querySelectorAll('*');
    for (const node of descendants) {
      if (node.shadowRoot) stack.push(node.shadowRoot);
    }
  }

  return found;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function visibleFields() {
  return allFields().filter((field) => {
    if (!isUsableField(field)) return false;
    const rect = field.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

function snapshotFieldState() {
  return allFields().map((field) => {
    const type = (field.type || '').toLowerCase();
    return {
      field,
      value: field.tagName === 'SELECT' ? field.value : field.value,
      checked: type === 'checkbox' || type === 'radio' ? field.checked : undefined
    };
  });
}

function restoreFieldState(snapshot) {
  let restored = 0;
  for (const entry of snapshot || []) {
    const field = entry.field;
    if (!field || !document.contains(field) || field.disabled || field.readOnly) continue;
    const type = (field.type || '').toLowerCase();
    if (type === 'hidden' || type === 'file') continue;
    if (field.tagName === 'SELECT') {
      if (typeof entry.value === 'string' && field.value !== entry.value) {
        field.value = entry.value;
        field.dispatchEvent(new Event('change', { bubbles: true }));
        restored += 1;
      }
      continue;
    }
    if (type === 'checkbox' || type === 'radio') {
      if (typeof entry.checked === 'boolean' && field.checked !== entry.checked) {
        field.checked = entry.checked;
        field.dispatchEvent(new Event('change', { bubbles: true }));
        restored += 1;
      }
      continue;
    }
    if (typeof entry.value === 'string' && field.value !== entry.value) {
      setNativeValue(field, entry.value);
      restored += 1;
    }
  }
  return restored;
}

function isVisibleElement(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  return true;
}

function normalizeUrlCandidate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `${window.location.protocol}${raw}`;
  if (raw.startsWith('/')) return `${window.location.origin}${raw}`;
  return '';
}

function sameHostish(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return Boolean(host) && !['login', 'www.google.com'].includes(host);
  } catch {
    return false;
  }
}

function collectApplicationUrlCandidates() {
  const candidates = [];
  const portal = portalName();
  const links = queryAllDeep('a, button, [role="button"], iframe, input[type="submit"], input[type="button"]');

  for (const el of links) {
    const text = `${el.textContent || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`.toLowerCase();
    const href = normalizeUrlCandidate(el.getAttribute('href') || el.getAttribute('data-href') || el.getAttribute('data-url') || el.getAttribute('data-action') || '');
    const src = normalizeUrlCandidate(el.getAttribute('src') || '');
    const candidateUrl = href || src;
    if (!candidateUrl) continue;

    let score = 0;
    if (el.tagName === 'IFRAME') score += 5;
    if (/apply now|apply|start application|submit application|continue application|complete application/.test(text)) score += 6;
    if (/greenhouse|ashby|lever|workday|apply|jobs/.test(candidateUrl)) score += 4;
    if (portal === 'greenhouse' && /greenhouse/.test(candidateUrl)) score += 4;
    if (portal === 'ashby' && /ashby/.test(candidateUrl)) score += 4;
    if (portal === 'generic' && /apply|jobs|career/.test(candidateUrl)) score += 2;
    if (/login|sign in|share|linkedin/.test(text)) score -= 5;
    if (/embed|application|job|career|candidate|apply/.test(candidateUrl)) score += 2;

    if (score > 0) {
      candidates.push({ url: candidateUrl, score });
    }
  }

  return candidates
    .filter((item) => sameHostish(item.url))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.url);
}

function getApplicationPageUrl() {
  const candidates = collectApplicationUrlCandidates();
  const target = candidates[0];
  return target || '';
}

function clickApplyTrigger() {
  const candidates = queryAllDeep('button, a, [role="button"], input[type="submit"], input[type="button"]');
  const ranked = candidates
    .filter((el) => isVisibleElement(el) && !el.disabled)
    .map((el) => {
      const text = `${el.textContent || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`.toLowerCase();
      const href = (el.getAttribute('href') || '').toLowerCase();
      let score = 0;
      if (/apply now|start application|apply for this job/.test(text)) score += 7;
      if (/\bapply\b|application/.test(text)) score += 4;
      if (/continue|next/.test(text)) score += 2;
      if (/login|sign in|share|linkedin/.test(text)) score -= 5;
      if (/\/apply|greenhouse|ashbyhq|lever/.test(href)) score += 3;
      return { el, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const target = ranked[0]?.el;
  if (!target) return false;
  if (typeof target.click === 'function') {
    target.click();
  } else {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
  return true;
}

function setOptionByText(select, preferred) {
  const value = String(preferred || '').toLowerCase();
  const options = Array.from(select.options || []);
  const found = options.find((opt) => (opt.textContent || '').toLowerCase().includes(value) || String(opt.value || '').toLowerCase().includes(value));
  if (found) {
    select.value = found.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

function fieldHints(field) {
  return [
    field.getAttribute('autocomplete'),
    field.getAttribute('name'),
    field.getAttribute('id'),
    field.getAttribute('placeholder'),
    field.getAttribute('aria-label'),
    field.labels && field.labels.length ? Array.from(field.labels).map((node) => node.textContent || '').join(' ') : '',
    field.closest('label, div, section, fieldset, .field, [data-testid]')?.textContent || ''
  ].filter(Boolean).join(' ').toLowerCase();
}

function classifyField(field) {
  const text = fieldHints(field);
  if (/(first name|given name|forename|fname)/.test(text)) return 'first name';
  if (/(last name|surname|lname|family name)/.test(text)) return 'last name';
  if (/(full name|your name|candidate name|legal name|name\b)/.test(text)) return 'name';
  if (/(email|e-mail)/.test(text)) return 'email';
  if (/(phone|mobile|telephone|contact number|cell|whatsapp)/.test(text)) return 'phone';
  if (/(resume|cv|curriculum vitae|upload cv|upload resume)/.test(text)) return 'resume';
  if (/(linkedin)/.test(text)) return 'linkedin profile';
  if (/(github|git hub)/.test(text)) return 'github';
  if (/(website|portfolio|personal site|homepage)/.test(text)) return 'website';
  if (/(years of experience|experience years|years? experience|total experience)/.test(text)) return 'years of experience';
  if (/(location|country|where do you live|based in|city|state)/.test(text)) return 'location';
  if (/(authorization to work|authori[sz]ation to work|authorized to work|work authorization)/.test(text)) return 'work authorization';
  if (/(what languages are you fluent in|languages are you fluent)/.test(text)) return 'what languages are you fluent in?';
  if (/(most complex llm project|complex llm project|few llm experiment|ai project)/.test(text)) return 'what is your most complex llm project?';
  if (/(optimize for in life)/.test(text)) return 'what do you optimize for in life?';
  if (/(how intensely do you like working|intensely do you like working)/.test(text)) return 'how intensely do you like working?';
  if (/(what should we know about you)/.test(text)) return 'what should we know about you?';
  if (/(salary|compensation|pay|expected salary|notice period|start date|availability)/.test(text)) return 'form-fallback';
  return '';
}

function setIfEmpty(field, value) {
  if (!value) return false;
  const current = String(field.value || '').trim();
  if (current) return false;
  setNativeValue(field, value);
  return true;
}

function fillOrderedFallback(profile, stats, startCount = 0) {
  const ordered = visibleFields();
  const values = [
    profile.name,
    profile.email,
    profile.phone,
    profile.location,
    profile.linkedin,
    profile.github,
    profile.years
  ].filter(Boolean);

  let count = startCount;
  let valueIndex = 0;

  for (const field of ordered) {
    const type = (field.type || '').toLowerCase();
    if (type === 'hidden' || type === 'file') continue;
    if (field.tagName === 'SELECT') continue;
    if (String(field.value || '').trim()) continue;
    if (valueIndex >= values.length) break;

    const text = fieldHints(field);
    if (text.includes('resume') || text.includes('cv')) continue;
    if (field.classList.contains('datetime') || /date/.test(type)) continue;

    // Fill the most common top-of-form fields when we could not classify them.
    setNativeValue(field, values[valueIndex]);
    count += 1;
    if (stats?.filledKeys) stats.filledKeys.add(`fallback-${valueIndex + 1}`);
    valueIndex += 1;
  }

  return count;
}

function fillWithAnswers(answers, profile, stats) {
  let count = 0;
  const answerEntries = buildAnswerEntries(answers);
  const fields = visibleFields();

  for (const field of fields) {
    if (!isUsableField(field)) continue;

    const label = labelTextFor(field);
    const key = matchFieldKey(label) || classifyField(field);
    const lowerType = (field.type || '').toLowerCase();

    if (lowerType === 'radio') {
      const inferredKey = key || matchFieldKey(label) || classifyField(field);
      let desired = resolveValue(inferredKey, answers, profile);
      if (!desired) desired = fallbackAnswerForQuestion(label, profile, answers);
      desired = normalizeKey(desired);
      if (!desired) continue;

      const optionText = normalizeKey(optionTextFor(field));
      const shouldCheck = optionText.includes(desired)
        || (desired === 'yes' && /\byes\b/.test(optionText))
        || (desired === 'no' && /\bno\b/.test(optionText));
      if (shouldCheck && !field.checked) {
        field.checked = true;
        field.dispatchEvent(new Event('change', { bubbles: true }));
        count += 1;
        if (stats?.filledKeys && inferredKey) stats.filledKeys.add(inferredKey);
      }
      continue;
    }

    if (lowerType === 'checkbox') {
      const truthy = /yes|agree|accept|consent|authoriz/.test(label) ? true : null;
      if (truthy !== null) {
        field.checked = truthy;
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
      continue;
    }

    if (!key) continue;

    if (field.tagName === 'SELECT') {
      const value = sanitizeResolvedValue(key, resolveValue(key, answers, profile));
      if (value && setOptionByText(field, value)) {
        count += 1;
        if (stats?.filledKeys) stats.filledKeys.add(key);
      }
      continue;
    }

    let value = resolveValue(key, answers, profile);
    if (!value) {
      value = findAnswerByQuestionText(label, answerEntries);
    }
    if (!value) {
      value = fallbackAnswerForQuestion(label, profile, answers);
    }
    if (!value && (field.tagName === 'TEXTAREA' || lowerType === 'text')) {
      value = composeUnknownQuestionAnswer(label, profile, answers, answerEntries);
    }
    value = sanitizeResolvedValue(key, value);
    if (value) {
      setNativeValue(field, value);
      count += 1;
      if (stats?.filledKeys) stats.filledKeys.add(key);
    }
  }

  // If label-based matching found nothing, do a conservative ordered fallback.
  if (count === 0) {
    count += fillOrderedFallback(profile, stats, count);
  }

  return count;
}

function findResumeFileInput() {
  const portal = portalName();
  const allFileInputs = queryAllDeep('input[type="file"]').filter((el) => !el.disabled);
  if (allFileInputs.length === 0) return null;

  const selectorsByPortal = {
    greenhouse: [
      'input[type="file"][name*="resume" i]',
      'input[type="file"][id*="resume" i]',
      'input[type="file"][name*="cv" i]'
    ],
    ashby: [
      'input[type="file"][name*="resume" i]',
      'input[type="file"][id*="resume" i]',
      'input[type="file"][accept*="pdf" i]'
    ],
    lever: [
      'input[type="file"][name*="resume" i]',
      'input[type="file"][id*="resume" i]',
      'input[type="file"][accept*="pdf" i]',
      'input[type="file"][name*="cv" i]'
    ],
    generic: [
      'input[type="file"][name*="resume" i]',
      'input[type="file"][id*="resume" i]',
      'input[type="file"][name*="cv" i]'
    ]
  };

  const portalSelectors = selectorsByPortal[portal] || selectorsByPortal.generic;
  for (const selector of portalSelectors) {
    const found = queryAllDeep(selector)[0];
    if (found && !found.disabled) return found;
  }

  const ranked = allFileInputs
    .map((input) => {
      const context = labelTextFor(input);
      let score = 0;
      if (/resume|curriculum|cv/.test(context)) score += 5;
      if (/cover letter/.test(context)) score -= 3;
      if ((input.accept || '').toLowerCase().includes('pdf')) score += 2;
      if (input.closest('.field, [data-testid], form')) score += 1;
      return { input, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.input || allFileInputs[0] || null;
}

function triggerFileInputOpen(input) {
  const clickTargets = [
    input,
    input.closest('label'),
    input.closest('[role="button"]'),
    input.closest('button')
  ].filter(Boolean);
  for (const target of clickTargets) {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
}

async function fetchPack(item) {
  return helperJson(`/api/pack?path=${encodeURIComponent(item.packPath)}`);
}

function fillBasicFields(item, pack) {
  const answers = pack.formAnswers || pack.exactAnswers || pack.answers || {};
  const profile = pack.profile || {};
  const fullName = profile.name || 'Sri Krishna Mishra';
  const [firstName, ...rest] = fullName.split(' ');
  const lastName = rest.length > 0 ? rest[rest.length - 1] : '';
  const normalizeProfileUrl = (value, provider = '') => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const lowered = raw.toLowerCase();
    if (lowered === 'linkedin' || lowered === 'github') return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (provider === 'linkedin' && raw.startsWith('linkedin.com/')) return `https://${raw}`;
    if (provider === 'github' && raw.startsWith('github.com/')) return `https://${raw}`;
    return raw;
  };

  const explicit = {
    name: fullName,
    'first name': `${firstName}${rest.length > 1 ? ` ${rest.slice(0, -1).join(' ')}` : ''}`.trim(),
    'last name': lastName,
    email: profile.email || 'srikrishnamishra006@gmail.com',
    phone: profile.phone || '+91 9905582516',
    linkedin: normalizeProfileUrl(profile.linkedin, 'linkedin'),
    'linkedin profile': normalizeProfileUrl(profile.linkedin, 'linkedin'),
    github: normalizeProfileUrl(profile.github, 'github'),
    years: profile.years || '0-2',
    'years of experience': profile.years || '0-2',
    location: profile.location || 'India',
    'work authorization': profile.workAuthorization || 'Yes',
    'what languages are you fluent in?': profile.languages || 'English, Hindi',
    'what do you optimize for in life?': profile.lifeOptimization || 'Long-term learning, useful work, and consistent delivery.',
    'how intensely do you like working?': profile.workIntensity || 'I like focused, high-intensity work with strong quality and ownership.',
    'what should we know about you?': profile.about || 'I enjoy shipping practical AI systems and improving them through feedback loops.'
  };
  const stats = { filledKeys: new Set() };
  const filled = fillWithAnswers(answers, explicit, stats);
  return { filled, filledKeys: Array.from(stats.filledKeys) };
}

async function fillBasicWithRetry(item, pack, retries = 2) {
  let result = fillBasicFields(item, pack);
  const keys = new Set(result.filledKeys || []);
  for (let i = 0; i < retries && result.filled === 0; i += 1) {
    await sleep(900);
    result = fillBasicFields(item, pack);
    for (const key of result.filledKeys || []) keys.add(key);
  }
  return {
    filled: result.filled,
    filledKeys: Array.from(keys)
  };
}

async function attachPdf(item) {
  const pdfPath = item?.pdfPath;
  if (!pdfPath) throw new Error('PDF path is missing. Click Update resume + ATS first.');

  const res = await helperFetch(`/api/pdf?path=${encodeURIComponent(pdfPath)}`);
  if (!res.ok) throw new Error(`Failed to load PDF (${res.status})`);
  const blob = await res.blob();
  const file = new File([blob], pdfPath.split('/').pop(), { type: 'application/pdf' });

  let input = findResumeFileInput();
  if (!input) {
    const opened = clickApplyTrigger();
    if (opened) {
      await sleep(1600);
      input = findResumeFileInput();
    }
  }
  if (!input) throw new Error('No file input found on this page. Open the actual application form first.');

  triggerFileInputOpen(input);

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(400);
  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'CAREER_OPS_FILL_BASIC') {
      const item = message.item || (await helperJson('/api/current')).item;
      if (!item) return sendResponse({ ok: false, error: 'No queued role found' });
      const pack = await fetchPack(item);
      let fillResult = await fillBasicWithRetry(item, pack);
      let openedApplication = false;
      let navigateTo = '';
      if (fillResult.filled === 0) {
        navigateTo = getApplicationPageUrl();
        openedApplication = Boolean(navigateTo) || clickApplyTrigger();
        if (openedApplication && navigateTo) {
          await sleep(500);
        }
        if (openedApplication && !navigateTo) {
          await sleep(2200);
          fillResult = await fillBasicWithRetry(item, pack);
        }
      }
      return sendResponse({
        ok: true,
        filled: fillResult.filled,
        filledKeys: fillResult.filledKeys || [],
        packPath: item.packPath,
        openedApplication,
        navigateTo
      });
    }

    if (message?.type === 'CAREER_OPS_ATTACH_PDF') {
      const item = message.item || (await helperJson('/api/current')).item;
      if (!item) return sendResponse({ ok: false, error: 'No queued role found' });
      const before = snapshotFieldState();
      await attachPdf(item);
      const restored = restoreFieldState(before);
      return sendResponse({ ok: true, pdfPath: item.pdfPath, restored });
    }

    if (message?.type === 'CAREER_OPS_FILL_AND_ATTACH') {
      const item = message.item || (await helperJson('/api/current')).item;
      if (!item) return sendResponse({ ok: false, error: 'No queued role found' });
      const pack = await fetchPack(item);
      const before = snapshotFieldState();
      let fillResult = await fillBasicWithRetry(item, pack);
      let openedApplication = false;
      let navigateTo = '';
      if (fillResult.filled === 0) {
        navigateTo = getApplicationPageUrl();
        openedApplication = Boolean(navigateTo) || clickApplyTrigger();
        if (openedApplication && navigateTo) {
          await sleep(500);
        }
        if (openedApplication && !navigateTo) {
          await sleep(2200);
          fillResult = await fillBasicWithRetry(item, pack);
        }
      }
      await attachPdf(item);
      const restored = restoreFieldState(before);
      const refillResult = await fillBasicWithRetry(item, pack, 1);
      return sendResponse({
        ok: true,
        filled: fillResult.filled,
        filledKeys: fillResult.filledKeys || [],
        pdfPath: item.pdfPath,
        openedApplication,
        navigateTo,
        restored,
        refill: refillResult.filled,
        refillKeys: refillResult.filledKeys || []
      });
    }

    sendResponse({ ok: false, error: 'Unknown action' });
  })().catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));

  return true;
});
