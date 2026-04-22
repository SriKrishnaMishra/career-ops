var HELPERS = globalThis.__CAREER_OPS_HELPERS__ || ['http://127.0.0.1:3030', 'http://localhost:3030'];
globalThis.__CAREER_OPS_HELPERS__ = HELPERS;

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

function isRequiredField(field) {
  if (!field) return false;
  const requiredAttr = field.required || field.getAttribute('aria-required') === 'true' || field.getAttribute('required') !== null;
  const hints = fieldHints(field);
  return requiredAttr || /\*\s*$|required/.test(hints);
}

function isFilledField(field) {
  if (!field) return false;
  const type = (field.type || '').toLowerCase();
  if (type === 'radio') return Boolean(field.checked);
  if (type === 'checkbox') return Boolean(field.checked);
  if (field.tagName === 'SELECT') return Boolean(String(field.value || '').trim());
  return Boolean(String(field.value || '').trim());
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
  if (/(twitter|x\.com)/.test(t)) return 'twitter url';
  if (/(google scholar|scholar profile|scholar)/.test(t)) return 'google scholar url';
  if (/(design portfolio|portfolio url|portfolio link|behance|dribbble)/.test(t)) return 'design portfolio url';
  if (/(website|portfolio|personal site)/.test(t)) return 'website';
  if (/(current company|current employer|present company|organization|organisation|company name)/.test(t)) return 'current company';
  if (/(years of experience|experience years|years? experience)/.test(t)) return 'years of experience';
  if (/(what excites you|why .*role|why us|motivat)/.test(t)) return 'what excites you about this role?';
  if (/(proud of|most proud|achievement|project you are proud)/.test(t)) return 'what work of yours are you most proud of?';
  if (/(location|country|where do you live|based in)/.test(t)) return 'location';
  if (/(authorization to work|authori[sz]ation to work|authorized to work|work authorization)/.test(t)) return 'work authorization';
  if (/(applied ai engineer|aaie|forward deployed)/.test(t)) return 'applied ai track';
  if (/(what languages are you fluent in|languages are you fluent)/.test(t)) return 'what languages are you fluent in?';
  if (/(most complex llm project|complex llm project|few llm experiment|ai project)/.test(t)) return 'what is your most complex llm project?';
  if (/(optimize for in life)/.test(t)) return 'what do you optimize for in life?';
  if (/(how intensely do you like working|intensely do you like working)/.test(t)) return 'how intensely do you like working?';
  if (/(what should we know about you)/.test(t)) return 'what should we know about you?';
  if (/(what gender do you identify as|gender do you identify as|gender identity)/.test(t)) return 'gender identity';
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

function isLowSignalLongFormAnswer(value) {
  const t = normalizeKey(value);
  if (!t) return true;
  if (t.length < 40) return true;

  const genericMarkers = [
    /practical production ready ai systems/,
    /measurable user impact/,
    /reliability and continuous improvement/,
    /owning ambiguous problems end to end/,
    /shipping with high quality/
  ];
  let markerHits = 0;
  for (const marker of genericMarkers) {
    if (marker.test(t)) markerHits += 1;
  }
  return markerHits >= 2;
}

function specializedLongFormAnswer(key, profile, answers) {
  const normalizedKey = normalizeKey(key);
  const targetRole = String(profile?.targetRole || profile?.headline || 'AI engineer').trim();
  const baseProject = answers?.['what work of yours are you most proud of?'] || '';

  if (normalizedKey === 'what is your most complex llm project') {
    const projectPrefix = baseProject ? `${baseProject} ` : '';
    return compactAnswer(`${projectPrefix}My most complex LLM project was a production workflow with retrieval, prompt orchestration, and evaluation checks to generate tailored outputs at scale.`);
  }

  if (normalizedKey === 'what do you optimize for in life') {
    return compactAnswer('I optimize for long-term learning, useful work, and consistency. I prefer building things that create measurable impact and keep improving over time.');
  }

  if (normalizedKey === 'how intensely do you like working') {
    return compactAnswer('I like working with high intensity in focused blocks. I move fast, keep quality high, and communicate clearly so delivery stays consistent.');
  }

  if (normalizedKey === 'what should we know about you') {
    return compactAnswer(`I am strongest at owning ambiguous problems end-to-end and turning ideas into reliable ${targetRole} systems. I bring high ownership, product thinking, and clear communication.`);
  }

  return '';
}

function inferQuestionIntent(normalizedQuestion) {
  const q = normalizeKey(normalizedQuestion);
  if (/challenge|difficult|complex|problem|debug|incident|failure/.test(q)) return 'challenge';
  if (/team|collaborat|stakeholder|communicat|cross functional/.test(q)) return 'collaboration';
  if (/why|motivat|interest|excite|join/.test(q)) return 'motivation';
  if (/proud|project|achievement|portfolio|built|build/.test(q)) return 'project';
  if (/optimi[sz]e|goal|priorit|life/.test(q)) return 'optimization';
  if (/intens|work style|pace|pressure/.test(q)) return 'intensity';
  if (/language|fluent|speak/.test(q)) return 'languages';
  return 'generic';
}

function questionTopicSnippet(questionText) {
  const tokens = tokenizeNormalized(questionText).filter((t) => !['what', 'your', 'you', 'about', 'with', 'this', 'that'].includes(t));
  return tokens.slice(0, 4).join(', ');
}

function composeUnknownQuestionAnswer(questionText, profile, answers, answerEntries) {
  const q = String(questionText || '').trim();
  if (!q) return '';

  const bestKnown = findAnswerByQuestionText(q, answerEntries);
  const normalizedQuestion = normalizeKey(q);
  const mappedKey = matchFieldKey(normalizedQuestion) || normalizedQuestion;
  const specialized = specializedLongFormAnswer(mappedKey, profile, answers);
  if (bestKnown && !(specialized && isLowSignalLongFormAnswer(bestKnown))) return compactAnswer(bestKnown);
  if (specialized) return specialized;

  const name = String(profile?.name || '').trim() || 'I';
  const roleContext = String(profile?.targetRole || profile?.headline || '').trim();
  const proudWork = answers?.['what work of yours are you most proud of?'] || '';
  const motivation = answers?.['what excites you about this role?'] || '';

  const normalized = normalizedQuestion;
  const intent = inferQuestionIntent(normalized);
  const topic = questionTopicSnippet(q);

  if (intent === 'challenge') {
    return compactAnswer(`${name} approach complex problems by breaking them into measurable milestones, validating assumptions quickly, and iterating with feedback loops until quality and reliability targets are met.`);
  }
  if (intent === 'collaboration') {
    return compactAnswer(`${name} work best in collaborative teams with clear ownership, fast communication, and shared quality standards. I proactively document decisions and align execution with product outcomes.`);
  }
  if (intent === 'motivation' && motivation) {
    return compactAnswer(motivation);
  }
  if (intent === 'project' && proudWork) {
    return compactAnswer(proudWork);
  }

  if (intent === 'optimization') {
    return compactAnswer('I optimize for long-term learning, useful output, and consistent execution. I prefer goals that improve user value while increasing reliability and delivery quality over time.');
  }
  if (intent === 'intensity') {
    return compactAnswer('I like focused, high-intensity work in clear execution windows, with strong ownership and sustainable pace. I aim for consistent quality and fast iteration.');
  }
  if (intent === 'languages') {
    return compactAnswer(profile?.languages || answers?.['what languages are you fluent in?'] || 'English, Hindi');
  }

  const generic = [
    roleContext ? `I am focused on ${roleContext}.` : 'I focus on building practical, production-ready AI systems.',
    topic ? `For this question (${topic}), I emphasize clear business impact and technical reliability.` : 'I align technical decisions with measurable outcomes.',
    'I optimize for measurable user impact, reliability, and continuous improvement.',
    'I am comfortable owning ambiguous problems end-to-end and shipping with high quality.'
  ].join(' ');

  return compactAnswer(generic);
}

function isKnownLongFormKey(key) {
  const k = normalizeKey(key);
  return [
    'what excites you about this role',
    'what work of yours are you most proud of',
    'what is your most complex llm project',
    'what do you optimize for in life',
    'how intensely do you like working',
    'what should we know about you'
  ].includes(k);
}

function isStructuredShortField(key, label, field) {
  const k = normalizeKey(key);
  const l = normalizeKey(label);
  const type = (field?.type || '').toLowerCase();

  if (['email', 'url', 'tel', 'number', 'date', 'datetime-local'].includes(type)) return true;
  if (field?.tagName === 'SELECT') return true;
  if (field?.tagName === 'TEXTAREA') return false;

  if (/(name|email|phone|linkedin|github|twitter|scholar|website|portfolio|location|country|city|company|experience|authorization|gender)/.test(k)) {
    return true;
  }
  if (/(linkedin|github|twitter|x\.com|scholar|portfolio|website|company|location|phone|email)/.test(l)) {
    return true;
  }
  return false;
}

function shouldGenerateDynamicAnswer(field, label, key = '') {
  if (isStructuredShortField(key, label, field)) return false;

  const type = (field?.type || '').toLowerCase();
  const normalizedLabel = normalizeKey(label);
  const normalizedKey = normalizeKey(key);

  if (isKnownLongFormKey(normalizedKey)) return true;
  if (field?.tagName === 'TEXTAREA') return true;
  if (type !== 'text') return false;

  // Only generate for clear essay-style prompts.
  return /\?|describe|explain|tell us|tell me|why|what|how|challenge|project|experience/.test(normalizedLabel);
}

function fillRequiredFieldFallback(fields, profile, answers, answerEntries, stats) {
  let filled = 0;

  const handledRadioNames = new Set();
  for (const field of fields) {
    if (!isUsableField(field) || !isRequiredField(field)) continue;
    if (isFilledField(field)) continue;

    const type = (field.type || '').toLowerCase();
    const label = labelTextFor(field);
    const key = matchFieldKey(label) || classifyField(field);

    if (type === 'radio') {
      const groupName = field.name || `${field.id || ''}-${normalizeKey(label)}`;
      if (!groupName || handledRadioNames.has(groupName)) continue;
      handledRadioNames.add(groupName);

      const group = radioGroupForField(fields, field, label);
      const desired = normalizeKey(
        resolveValue(key, answers, profile)
        || fallbackAnswerForQuestion(label, profile, answers)
        || (/(gender|demographic|diversity)/.test(normalizeKey(label)) ? 'prefer not to respond' : 'yes')
      );

      let picked = false;
      for (const option of group) {
        const optionText = normalizeKey(optionTextFor(option));
        const shouldPick = optionText.includes(desired)
          || (desired === 'yes' && /\byes\b/.test(optionText))
          || (desired === 'no' && /\bno\b/.test(optionText))
          || (desired === 'prefer not to respond' && /prefer not/.test(optionText));
        if (shouldPick) {
          option.checked = true;
          option.dispatchEvent(new Event('change', { bubbles: true }));
          picked = true;
          filled += 1;
          if (stats?.filledKeys) stats.filledKeys.add(key || 'required-radio');
          break;
        }
      }
      if (!picked && group[0]) {
        group[0].checked = true;
        group[0].dispatchEvent(new Event('change', { bubbles: true }));
        filled += 1;
        if (stats?.filledKeys) stats.filledKeys.add(key || 'required-radio');
      }
      continue;
    }

    if (type === 'checkbox') {
      field.checked = true;
      field.dispatchEvent(new Event('change', { bubbles: true }));
      filled += 1;
      if (stats?.filledKeys) stats.filledKeys.add(key || 'required-checkbox');
      continue;
    }

    if (field.tagName === 'SELECT') {
      const preferred = sanitizeResolvedValue(key, resolveValue(key, answers, profile) || fallbackAnswerForQuestion(label, profile, answers));
      const selected = preferred ? setOptionByText(field, preferred) : false;
      if (!selected) {
        const options = Array.from(field.options || []).filter((opt) => String(opt.value || '').trim());
        if (options[0]) {
          field.value = options[0].value;
          field.dispatchEvent(new Event('change', { bubbles: true }));
          filled += 1;
          if (stats?.filledKeys) stats.filledKeys.add(key || 'required-select');
        }
      } else {
        filled += 1;
        if (stats?.filledKeys) stats.filledKeys.add(key || 'required-select');
      }
      continue;
    }

    let value = sanitizeResolvedValue(key, resolveValue(key, answers, profile));
    if (!value) value = findAnswerByQuestionText(label, answerEntries);
    if (!value) value = fallbackAnswerForQuestion(label, profile, answers);
    if (!value && shouldGenerateDynamicAnswer(field, label, key)) {
      value = composeUnknownQuestionAnswer(label, profile, answers, answerEntries);
    }
    if (value) {
      setNativeValue(field, value);
      filled += 1;
      if (stats?.filledKeys) stats.filledKeys.add(key || 'required-text');
    }
  }

  return filled;
}

function resolveValue(key, answers, profile) {
  const normalizedKey = normalizeKey(key);
  const aliasMap = {
    'linkedin profile': 'linkedin',
    github: 'github',
    website: 'website',
    portfolio: 'website',
    'design portfolio url': 'portfolio',
    'twitter url': 'twitter',
    'google scholar url': 'google scholar',
    'current company': 'current company',
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
  const resolved = directAnswer || fuzzyAnswer || profile?.[normalizedKey] || profile?.[profileKey] || '';
  const specialized = specializedLongFormAnswer(normalizedKey, profile, answers);
  if (specialized && isLowSignalLongFormAnswer(resolved)) return specialized;
  return resolved;
}

function sanitizeResolvedValue(key, value) {
  const normalizedKey = normalizeKey(key);
  const raw = String(value || '').trim();
  if (!raw) return '';

  const isUrlLikeKey = /(linkedin|github|twitter|scholar|website|portfolio|url)/.test(normalizedKey);
  if (isUrlLikeKey) {
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^(linkedin|github|x|twitter)\.com\//i.test(raw)) return `https://${raw}`;
    return '';
  }

  if (isStructuredShortField(normalizedKey, normalizedKey, { type: 'text', tagName: 'INPUT' }) && isLowSignalLongFormAnswer(raw)) {
    return '';
  }

  if ((normalizedKey === 'linkedin profile' || normalizedKey === 'linkedin') && /^linkedin$/i.test(raw)) return '';
  if (normalizedKey === 'github' && /^github$/i.test(raw)) return '';
  if ((normalizedKey === 'website' || normalizedKey === 'portfolio') && /^(website|portfolio|personal site)$/i.test(raw)) return '';

  return raw;
}

function optionTextFor(field) {
  const labels = field.labels && field.labels.length
    ? Array.from(field.labels).map((node) => node.textContent || '').join(' ')
    : '';
  const siblingText = [
    field.previousSibling?.textContent || '',
    field.nextSibling?.textContent || ''
  ].join(' ');

  return [
    field.value,
    field.getAttribute('value'),
    field.getAttribute('aria-label'),
    labels,
    field.closest('label')?.textContent || '',
    siblingText
  ].filter(Boolean).join(' ').toLowerCase();
}

function radioGroupForField(fields, field, label) {
  if (field.name) {
    const byName = fields.filter((candidate) => (candidate.type || '').toLowerCase() === 'radio' && candidate.name === field.name);
    if (byName.length) return byName;
  }

  const normalizedLabel = normalizeKey(label);
  if (!normalizedLabel) return [field];

  const byLabel = fields.filter((candidate) => {
    if ((candidate.type || '').toLowerCase() !== 'radio') return false;
    const candidateLabel = normalizeKey(labelTextFor(candidate));
    if (!candidateLabel) return false;
    return candidateLabel.includes(normalizedLabel) || normalizedLabel.includes(candidateLabel);
  });

  return byLabel.length ? byLabel : [field];
}

function fallbackAnswerForQuestion(label, profile, answers) {
  const t = String(label || '').toLowerCase();
  if (!t) return '';

  if (/(current company|current employer|present company|organization|organisation|company name)/.test(t)) {
    return answers?.['current company'] || profile?.currentCompany || '';
  }
  if (/(twitter|x\.com)/.test(t)) {
    return answers?.['twitter url'] || profile?.twitter || '';
  }
  if (/(google scholar|scholar)/.test(t)) {
    return answers?.['google scholar url'] || profile?.googleScholar || '';
  }
  if (/(design portfolio|portfolio url|portfolio link|behance|dribbble|website|personal site)/.test(t)) {
    return answers?.['design portfolio url'] || profile?.portfolio || profile?.website || '';
  }

  if (/(authorization to work|authori[sz]ation to work|authorized to work|work authorization)/.test(t)) {
    return answers?.['work authorization'] || 'Yes';
  }
  if (/(applied ai engineer|aaie|forward deployed)/.test(t)) {
    return answers?.['applied ai track'] || profile?.appliedAiTrack || 'AAIE | Forward Deployed';
  }
  if (/(what languages are you fluent in|languages are you fluent)/.test(t)) {
    return answers?.['what languages are you fluent in?'] || profile?.languages || 'English, Hindi';
  }
  if (/(most complex llm project|complex llm project|few llm experiment|ai project)/.test(t)) {
    const direct = answers?.['what is your most complex llm project?'] || answers?.['what work of yours are you most proud of?'] || '';
    if (direct && !isLowSignalLongFormAnswer(direct)) return direct;
    return specializedLongFormAnswer('what is your most complex llm project?', profile, answers)
      || 'I build production-focused AI systems end-to-end: data pipeline, retrieval, prompting, evaluation, and deployment. I focus on reliability, latency, and measurable user impact.';
  }
  if (/(optimize for in life)/.test(t)) {
    const direct = answers?.['what do you optimize for in life?'] || '';
    if (direct && !isLowSignalLongFormAnswer(direct)) return direct;
    return specializedLongFormAnswer('what do you optimize for in life?', profile, answers)
      || 'I optimize for long-term learning, useful output, and consistent execution with high ownership.';
  }
  if (/(how intensely do you like working|intensely do you like working)/.test(t)) {
    const direct = answers?.['how intensely do you like working?'] || '';
    if (direct && !isLowSignalLongFormAnswer(direct)) return direct;
    return specializedLongFormAnswer('how intensely do you like working?', profile, answers)
      || 'I enjoy working with high intensity in focused blocks while keeping quality and consistency high.';
  }
  if (/(what should we know about you)/.test(t)) {
    const direct = answers?.['what should we know about you?'] || '';
    if (direct && !isLowSignalLongFormAnswer(direct)) return direct;
    return specializedLongFormAnswer('what should we know about you?', profile, answers)
      || 'I learn quickly, communicate clearly, and like shipping practical AI systems that solve real user problems.';
  }
  if (/(what gender do you identify as|gender do you identify as|gender identity)/.test(t)) {
    return answers?.['gender identity'] || profile?.genderIdentity || 'Prefer not to respond';
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
  if (/(twitter|x\.com)/.test(text)) return 'twitter url';
  if (/(google scholar|scholar profile|scholar)/.test(text)) return 'google scholar url';
  if (/(design portfolio|portfolio url|portfolio link|behance|dribbble)/.test(text)) return 'design portfolio url';
  if (/(website|portfolio|personal site|homepage)/.test(text)) return 'website';
  if (/(current company|current employer|present company|organization|organisation|company name)/.test(text)) return 'current company';
  if (/(years of experience|experience years|years? experience|total experience)/.test(text)) return 'years of experience';
  if (/(location|country|where do you live|based in|city|state)/.test(text)) return 'location';
  if (/(authorization to work|authori[sz]ation to work|authorized to work|work authorization)/.test(text)) return 'work authorization';
  if (/(applied ai engineer|aaie|forward deployed)/.test(text)) return 'applied ai track';
  if (/(what languages are you fluent in|languages are you fluent)/.test(text)) return 'what languages are you fluent in?';
  if (/(most complex llm project|complex llm project|few llm experiment|ai project)/.test(text)) return 'what is your most complex llm project?';
  if (/(optimize for in life)/.test(text)) return 'what do you optimize for in life?';
  if (/(how intensely do you like working|intensely do you like working)/.test(text)) return 'how intensely do you like working?';
  if (/(what should we know about you)/.test(text)) return 'what should we know about you?';
  if (/(what gender do you identify as|gender do you identify as|gender identity)/.test(text)) return 'gender identity';
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

    if (!key) {
      // Out-of-box fallback: still answer unlabeled text prompts.
      if (shouldGenerateDynamicAnswer(field, label)) {
        const unknownValue = composeUnknownQuestionAnswer(label, profile, answers, answerEntries);
        if (unknownValue) {
          setNativeValue(field, unknownValue);
          count += 1;
          if (stats?.filledKeys) stats.filledKeys.add('dynamic-question');
        }
      }
      continue;
    }

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
    if (!value && shouldGenerateDynamicAnswer(field, label, key)) {
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

  // Advanced pass: fill required unanswered prompts (including custom questions).
  count += fillRequiredFieldFallback(fields, profile, answers, answerEntries, stats);

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
  // Intentionally left as a no-op.
  // Browser blocks programmatic file chooser dialogs without user activation,
  // and we attach files via DataTransfer instead.
  void input;
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
    if (['linkedin', 'github', 'twitter', 'x', 'website', 'portfolio'].includes(lowered)) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (provider === 'linkedin' && raw.startsWith('linkedin.com/')) return `https://${raw}`;
    if (provider === 'github' && raw.startsWith('github.com/')) return `https://${raw}`;
    if ((provider === 'twitter' || provider === 'x') && /^(x|twitter)\.com\//i.test(raw)) return `https://${raw}`;
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
    'twitter url': normalizeProfileUrl(profile.twitter, 'twitter'),
    'google scholar url': normalizeProfileUrl(profile.googleScholar || profile.scholar, ''),
    'design portfolio url': normalizeProfileUrl(profile.portfolio || profile.website, ''),
    website: normalizeProfileUrl(profile.website, ''),
    years: profile.years || '0-2',
    'years of experience': profile.years || '0-2',
    location: profile.location || 'India',
    'current company': profile.currentCompany || '',
    'work authorization': profile.workAuthorization || 'Yes',
    'applied ai track': profile.appliedAiTrack || 'AAIE | Forward Deployed',
    'what languages are you fluent in?': profile.languages || 'English, Hindi',
    'what is your most complex llm project?': profile.complexLlmProject || 'My most complex LLM project was a production workflow with retrieval, prompt orchestration, and evaluation checks to generate tailored outputs at scale.',
    'what do you optimize for in life?': profile.lifeOptimization || 'I optimize for long-term learning, useful work, and consistent high-quality execution.',
    'how intensely do you like working?': profile.workIntensity || 'I like high-intensity, focused work with clear goals, fast iteration, and strong quality.',
    'what should we know about you?': profile.about || 'I take ownership end-to-end and enjoy building practical AI systems that create real user impact.',
    'gender identity': profile.genderIdentity || 'Prefer not to respond'
  };
  const stats = { filledKeys: new Set() };
  const filled = fillWithAnswers(answers, explicit, stats);
  const requiredMissing = visibleFields().filter((field) => isRequiredField(field) && !isFilledField(field)).length;
  return { filled, filledKeys: Array.from(stats.filledKeys), requiredMissing };
}

async function fillBasicWithRetry(item, pack, retries = 2) {
  let result = fillBasicFields(item, pack);
  const keys = new Set(result.filledKeys || []);
  let bestMissing = Number.isFinite(Number(result.requiredMissing)) ? Number(result.requiredMissing) : 999;
  for (let i = 0; i < retries; i += 1) {
    await sleep(900);
    const next = fillBasicFields(item, pack);
    for (const key of next.filledKeys || []) keys.add(key);

    const nextMissing = Number.isFinite(Number(next.requiredMissing)) ? Number(next.requiredMissing) : bestMissing;
    const improved = next.filled > result.filled || nextMissing < bestMissing;
    result = next;
    bestMissing = Math.min(bestMissing, nextMissing);

    if (!improved && i > 0) break;
    if (bestMissing === 0) break;
  }
  return {
    filled: result.filled,
    filledKeys: Array.from(keys),
    requiredMissing: bestMissing
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
  const navigateTo = getApplicationPageUrl();
  if (!input) {
    const opened = clickApplyTrigger();
    if (opened) {
      await sleep(1600);
      input = findResumeFileInput();
    }
  }

  for (let i = 0; i < 3 && !input; i += 1) {
    await sleep(700);
    input = findResumeFileInput();
  }

  if (!input) {
    return {
      ok: false,
      navigateTo,
      error: 'No file input found on this page. Open the actual application form first.'
    };
  }

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(400);
  return { ok: true };
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
      if (fillResult.filled === 0 || Number(fillResult.requiredMissing) > 0) {
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
        requiredMissing: fillResult.requiredMissing,
        packPath: item.packPath,
        openedApplication,
        navigateTo
      });
    }

    if (message?.type === 'CAREER_OPS_ATTACH_PDF') {
      const item = message.item || (await helperJson('/api/current')).item;
      if (!item) return sendResponse({ ok: false, error: 'No queued role found' });
      const before = snapshotFieldState();
      const upload = await attachPdf(item);
      if (!upload?.ok) {
        return sendResponse({ ok: false, error: upload?.error || 'Unable to attach PDF', navigateTo: upload?.navigateTo || '' });
      }
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
      if (fillResult.filled === 0 || Number(fillResult.requiredMissing) > 0) {
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
      const upload = await attachPdf(item);
      if (!upload?.ok) {
        return sendResponse({
          ok: false,
          error: upload?.error || 'Unable to attach PDF',
          navigateTo: upload?.navigateTo || '',
          filled: fillResult.filled,
          filledKeys: fillResult.filledKeys || [],
          requiredMissing: fillResult.requiredMissing,
          openedApplication
        });
      }
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
