const HELPERS = ['http://127.0.0.1:3030', 'http://localhost:3030'];

const state = {
  minPriority: 55,
  stats: null,
  queue: [],
  applications: [],
  current: null,
  currentPack: null,
  activeIndex: 0,
  fallbackToAll: false,
  lastJobTabId: null,
  appFilter: '',
  isBusy: false,
  autoRefreshStarted: false,
  autoRefreshTimer: null,
  lastAutoRefreshAt: 0,
  activeRefreshPending: false
};

const els = {
  stats: document.getElementById('stats'),
  queueList: document.getElementById('queueList'),
  appsList: document.getElementById('appsList'),
  jobLinkInput: document.getElementById('jobLinkInput'),
  jobCategoryInput: document.getElementById('jobCategoryInput'),
  jobSkillsInput: document.getElementById('jobSkillsInput'),
  resumeTrackSelect: document.getElementById('resumeTrackSelect'),
  applyLinkBtn: document.getElementById('applyLinkBtn'),
  appFilterInput: document.getElementById('appFilterInput'),
  reloadAppsBtn: document.getElementById('reloadAppsBtn'),
  currentCard: document.getElementById('currentCard'),
  answersBox: document.getElementById('answersBox'),
  thresholdInput: document.getElementById('thresholdInput'),
  refreshBtn: document.getElementById('refreshBtn'),
  searchBtn: document.getElementById('searchBtn'),
  prepareBtn: document.getElementById('prepareBtn'),
  openBtn: document.getElementById('openBtn'),
  autoBtn: document.getElementById('autoBtn'),
  fillBtn: document.getElementById('fillBtn'),
  attachBtn: document.getElementById('attachBtn'),
  updateResumeBtn: document.getElementById('updateResumeBtn'),
  applyNextBtn: document.getElementById('applyNextBtn'),
  editResumeBtn: document.getElementById('editResumeBtn'),
  openPackBtn: document.getElementById('openPackBtn'),
  markBtn: document.getElementById('markBtn'),
  nextBtn: document.getElementById('nextBtn'),
  copyBtn: document.getElementById('copyBtn')
};

const actionButtons = [
  els.applyLinkBtn,
  els.refreshBtn,
  els.searchBtn,
  els.reloadAppsBtn,
  els.prepareBtn,
  els.openBtn,
  els.autoBtn,
  els.fillBtn,
  els.attachBtn,
  els.updateResumeBtn,
  els.applyNextBtn,
  els.editResumeBtn,
  els.openPackBtn,
  els.markBtn,
  els.nextBtn,
  els.copyBtn
].filter(Boolean);

function formatNum(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : '0';
}

async function api(path, options) {
  const requestOptions = {
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {})
    }
  };

  let res;
  let lastError = null;
  for (const base of HELPERS) {
    try {
      res = await fetch(`${base}${path}`, requestOptions);
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!res) {
    throw new Error('Cannot reach helper server at http://127.0.0.1:3030. Run: npm --prefix /media/krishna/Windows/krishna/workplace/job-application-fullfill/career-ops run extension:serve');
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok || data.ok === false) throw new Error(data.error || lastError?.message || `Request failed (${res.status})`);
  return data;
}

function escapeText(text) {
  return String(text || '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
}

function stepLabel(index) {
  const labels = ['Open', 'Login', 'Auto/Fill', 'Attach PDF', 'Review', 'Submit', 'Log'];
  return labels[index] || 'Done';
}

function packAnswers(pack) {
  return pack?.formAnswers || pack?.exactAnswers || {};
}

function renderFilledKeyLine(label, keys) {
  const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (!list.length) return '';
  return `<div class="meta">${escapeText(label)}: ${escapeText(list.join(', '))}</div>`;
}

async function refreshState(options = {}) {
  const preserveCurrent = options.preserveCurrent !== false;
  const previousCurrentPath = preserveCurrent ? state.current?.packPath : null;
  state.minPriority = Number(els.thresholdInput.value || 55);
  const [stats, queueRes, currentRes, appsRes] = await Promise.all([
    api(`/api/stats?minPriority=${state.minPriority}`),
    api(`/api/queue?limit=20&minPriority=${state.minPriority}`),
    api(`/api/current?minPriority=${state.minPriority}`),
    api('/api/applications?minPriority=0&limit=300&includeSubmitted=true')
  ]);

  state.stats = stats;
  state.queue = queueRes.items || [];
  state.applications = appsRes.items || [];
  state.current = currentRes.item || state.queue[0] || null;

  // If threshold hides all roles, fallback to showing all roles so the UI is never blank.
  state.fallbackToAll = false;
  if (!state.current && state.queue.length === 0 && state.minPriority > 0) {
    const [allQueueRes, allCurrentRes] = await Promise.all([
      api('/api/queue?limit=20&minPriority=0'),
      api('/api/current?minPriority=0')
    ]);
    state.queue = allQueueRes.items || [];
    state.current = allCurrentRes.item || state.queue[0] || null;
    state.fallbackToAll = state.queue.length > 0;
  }

  state.activeIndex = 0;
  if (!state.current && state.applications.length > 0) {
    state.current = state.applications[0];
  }
  if (previousCurrentPath) {
    const preserved = state.applications.find((item) => item.packPath === previousCurrentPath)
      || state.queue.find((item) => item.packPath === previousCurrentPath)
      || (state.current?.packPath === previousCurrentPath ? state.current : null);
    if (preserved) {
      state.current = preserved;
    } else if (previousCurrentPath.startsWith('data/quick-apply/')) {
      state.current = {
        ...(state.current || {}),
        packPath: previousCurrentPath,
        url: state.current?.url || ''
      };
    }
  }
  if (state.current && state.queue.length > 0) {
    const idx = state.queue.findIndex((item) => item.packPath === state.current.packPath);
    state.activeIndex = idx >= 0 ? idx : 0;
  }
  state.currentPack = state.current ? await api(`/api/pack?path=${encodeURIComponent(state.current.packPath)}`) : null;

  render();
  startAutoRefresh();
}

function startAutoRefresh() {
  if (state.autoRefreshStarted) return;
  state.autoRefreshStarted = true;

  const tick = async (reason = 'auto refresh') => {
    if (state.isBusy) return;
    const now = Date.now();
    if (now - state.lastAutoRefreshAt < 2 * 60 * 1000) return;
    state.lastAutoRefreshAt = now;
    try {
      await refreshState({ preserveCurrent: true });
    } catch (err) {
      console.warn(`${reason} failed`, err);
    }
  };

  // Avoid running expensive refresh workflows during panel startup.
  state.lastAutoRefreshAt = Date.now();
  state.autoRefreshTimer = setInterval(() => {
    tick('scheduled auto refresh').catch(() => undefined);
  }, 10 * 60 * 1000);
}

function triggerActiveRefresh(reason = 'active tab refresh') {
  if (!state.autoRefreshStarted || state.isBusy || state.activeRefreshPending) return;
  state.activeRefreshPending = true;

  setTimeout(async () => {
    try {
      const now = Date.now();
      if (now - state.lastAutoRefreshAt < 60 * 1000) return;
      state.lastAutoRefreshAt = now;
      await refreshState({ preserveCurrent: true });
    } catch (err) {
      console.warn(reason, err);
    } finally {
      state.activeRefreshPending = false;
    }
  }, 600);
}

async function withBusy(message, fn, options = {}) {
  const showWorkingCard = options.showWorkingCard !== false;
  const previous = els.currentCard.innerHTML;
  state.isBusy = true;
  for (const btn of actionButtons) btn.disabled = true;
  if (showWorkingCard) {
    els.currentCard.classList.remove('empty');
    els.currentCard.innerHTML = `<div class="current-title">Working...</div><div class="meta">${escapeText(message)}</div>`;
  }
  try {
    const result = await fn();
    if (options.refreshState !== false) {
      await refreshState({ preserveCurrent: true });
    }
    return result;
  } finally {
    state.isBusy = false;
    for (const btn of actionButtons) btn.disabled = false;
    if (showWorkingCard && !state.current && !state.currentPack) {
      els.currentCard.innerHTML = previous;
    }
  }
}

function renderStats() {
  const stats = state.stats || { appliedToday: 0, pending: 0, followupsDue: 0, overdueFollowups: 0 };
  const pendingValue = state.fallbackToAll ? state.queue.length : formatNum(stats.pending);
  const autoRefreshLabel = state.autoRefreshStarted ? 'On' : 'Starting';
  els.stats.innerHTML = `
    <article class="stat"><div class="label">Applied today</div><div class="value">${formatNum(stats.appliedToday)}</div></article>
    <article class="stat"><div class="label">Pending</div><div class="value">${pendingValue}</div></article>
    <article class="stat"><div class="label">Follow-ups due</div><div class="value">${formatNum(stats.followupsDue)}</div></article>
    <article class="stat"><div class="label">Threshold</div><div class="value">${formatNum(state.minPriority)}</div></article>
    <article class="stat"><div class="label">Auto refresh</div><div class="value">${autoRefreshLabel}</div></article>
  `;
}

function renderCurrent() {
  if (!state.current || !state.currentPack) {
    els.currentCard.classList.add('empty');
    els.currentCard.textContent = 'No queued role found. Click Prepare queue first.';
    els.answersBox.classList.add('empty');
    els.answersBox.textContent = 'No pack selected yet.';
    return;
  }

  const pack = state.currentPack;
  const tags = [
    `ATS ${state.current.ats}`,
    `Priority ${state.current.priority}`,
    `Rank ${state.current.rank}`,
    stepLabel(state.activeIndex)
  ];

  const fallbackMeta = state.fallbackToAll
    ? '<div class="meta">Showing all roles because no role matched current threshold. Lower Threshold to include these in normal view.</div>'
    : '';

  els.currentCard.classList.remove('empty');
  els.currentCard.innerHTML = `
    <div class="current-title">${escapeText(state.current.company)} · ${escapeText(state.current.role)}</div>
    <div class="meta">${escapeText(state.current.url)}</div>
    <div class="meta">Pack: ${escapeText(state.current.packPath)}</div>
    <div class="meta">PDF: ${escapeText(pack.pdfPath || state.current.pdfPath || '')}</div>
    ${fallbackMeta}
    <div class="tags">${tags.map((t) => `<span class="tag">${escapeText(t)}</span>`).join('')}</div>
  `;

  const answers = Object.entries(packAnswers(pack));
  const answerLines = answers.length
    ? answers.map(([key, value]) => `${key}\n${String(value).trim()}`).join('\n\n')
    : 'No exact answers stored in this pack. Basic profile fallback will still be used.';
  els.answersBox.classList.remove('empty');
  els.answersBox.textContent = answerLines;
}

function renderQueue() {
  if (!state.queue.length) {
    els.queueList.innerHTML = '<div class="queue-item"><div class="title">Queue is empty</div><div class="sub">Prepare the queue to load roles.</div></div>';
    return;
  }

  els.queueList.innerHTML = state.queue.map((item, index) => `
    <article class="queue-item ${index === state.activeIndex ? 'active' : ''}">
      <div class="title">${index + 1}. ${escapeText(item.company)}</div>
      <div class="sub">${escapeText(item.role)}</div>
      <div class="sub">Priority ${escapeText(item.priority)} · ATS ${escapeText(item.ats)} · Rank ${escapeText(item.rank)}</div>
    </article>
  `).join('');
}

function matchesAppFilter(item, filterText) {
  if (!filterText) return true;
  const haystack = `${item.company || ''} ${item.role || ''}`.toLowerCase();
  return haystack.includes(filterText);
}

function renderApplications() {
  const filterText = String(state.appFilter || '').trim().toLowerCase();
  const rows = state.applications.filter((item) => matchesAppFilter(item, filterText));

  if (!rows.length) {
    els.appsList.innerHTML = '<div class="queue-item"><div class="title">No applications found</div><div class="sub">Try a different filter or reload the list.</div></div>';
    return;
  }

  els.appsList.innerHTML = rows.map((item) => {
    const selected = state.current?.packPath === item.packPath;
    const ats = Number.isFinite(Number(item.ats)) ? Number(item.ats) : null;
    const priority = Number.isFinite(Number(item.priority)) ? Number(item.priority) : null;
    const submittedClass = item.submitted ? 'good' : 'warn';
    const submittedLabel = item.submitted ? 'Submitted' : 'Pending';
    const atsClass = (ats !== null && ats >= 75) ? 'good' : 'info';
    return `
      <article class="queue-item app-item ${selected ? 'active' : ''}" data-pack-path="${escapeText(item.packPath || '')}">
        <div class="app-row">
          <div class="title">${escapeText(item.company)} · ${escapeText(item.role)}</div>
          <div class="sub">#${escapeText(item.rank)}</div>
        </div>
        <div class="pills">
          <span class="pill ${atsClass}">ATS ${ats === null ? '-' : ats}</span>
          <span class="pill info">Priority ${priority === null ? '-' : priority}</span>
          <span class="pill ${submittedClass}">${submittedLabel}</span>
        </div>
      </article>
    `;
  }).join('');
}

function render() {
  renderStats();
  renderApplications();
  renderQueue();
  renderCurrent();
}

async function selectApplication(packPath) {
  if (!packPath) return;
  const selected = state.applications.find((item) => item.packPath === packPath) || state.queue.find((item) => item.packPath === packPath);
  if (!selected) return;
  state.current = selected;
  const queueIndex = state.queue.findIndex((item) => item.packPath === packPath);
  if (queueIndex >= 0) state.activeIndex = queueIndex;
  state.currentPack = await api(`/api/pack?path=${encodeURIComponent(selected.packPath)}`);
  render();
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isHttpTab(tab) {
  return Boolean(tab?.url && /^https?:\/\//i.test(tab.url));
}

async function waitForTabComplete(tabId, timeoutMs = 15000) {
  const initial = await chrome.tabs.get(tabId).catch(() => null);
  if (!initial) throw new Error('Tab no longer exists');
  if (initial.status === 'complete') return;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('Timed out waiting for page load'));
    }, timeoutMs);

    function onUpdated(updatedTabId, info) {
      if (updatedTabId !== tabId) return;
      if (info.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function getBestJobTab() {
  if (state.lastJobTabId) {
    const knownTab = await chrome.tabs.get(state.lastJobTabId).catch(() => null);
    if (knownTab && isHttpTab(knownTab)) return knownTab;
  }

  const active = await currentTab();
  if (isHttpTab(active)) return active;

  if (state.current?.url) {
    const sameUrlTabs = await chrome.tabs.query({ currentWindow: true, url: state.current.url });
    if (sameUrlTabs.length) return sameUrlTabs[0];
  }

  const anyHttp = await chrome.tabs.query({ currentWindow: true, url: ['http://*/*', 'https://*/*'] });
  if (anyHttp.length) return anyHttp[0];

  return null;
}

async function sendActionToTab(tabId, payload) {
  const transientMessage = /message channel is closed|back\/forward cache|Receiving end does not exist|The tab was closed/i;
  let lastError = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await waitForTabComplete(tabId, 6000).catch(() => undefined);
      return await chrome.tabs.sendMessage(tabId, payload);
    } catch (err) {
      lastError = err;
      const raw = String(err?.message || err || '');
      const isTransient = transientMessage.test(raw);

      if (isTransient || /Could not establish connection/i.test(raw)) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content-script.js']
          });
        } catch {
          // keep retrying; tab can still be navigating
        }

        await new Promise((resolve) => setTimeout(resolve, 250 + attempt * 250));
        continue;
      }

      break;
    }
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    const url = String(tab?.url || '');
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('Unable to run autofill on this tab. Open the actual job application page (https://...), not chrome:// or extension pages, then try again.');
    }
  } catch {
    // ignore lookup failures and use the generic guidance below
  }

  throw new Error(`Unable to run autofill on this tab right now. Please retry Auto/Fill once. ${String(lastError?.message || '').trim()}`.trim());
}

async function openCurrentRole() {
  if (!state.current) return;
  const candidate = await getBestJobTab();
  let tab;

  if (candidate?.id && isHttpTab(candidate)) {
    tab = await chrome.tabs.update(candidate.id, { url: state.current.url, active: true });
  } else {
    tab = await chrome.tabs.create({ url: state.current.url, active: true });
  }

  if (!tab?.id) throw new Error('Unable to open role tab');
  state.lastJobTabId = tab.id;
  await waitForTabComplete(tab.id);
}

async function sendToActiveTab(type) {
  let tab = await getBestJobTab();
  if (!tab?.id && state.current?.url) {
    await openCurrentRole();
    tab = await getBestJobTab();
  }
  if (!tab?.id) throw new Error('No suitable job tab found. Click Open role first.');

  state.lastJobTabId = tab.id;
  await waitForTabComplete(tab.id).catch(() => undefined);
  const item = {
    ...(state.current || {}),
    pdfPath: state.current?.pdfPath || state.currentPack?.pdfPath || ''
  };
  return sendActionToTab(tab.id, { type, item });
}

async function followNavigateTo(navigateTo) {
  if (!navigateTo) return false;
  const tab = await getBestJobTab();
  if (!tab?.id) return false;
  await chrome.tabs.update(tab.id, { url: navigateTo, active: true });
  await waitForTabComplete(tab.id).catch(() => undefined);
  state.lastJobTabId = tab.id;
  return true;
}

async function fillBasic() {
  let result;
  try {
    result = await sendToActiveTab('CAREER_OPS_FILL_BASIC');
  } catch (err) {
    const raw = String(err?.message || err || '');
    if (/autofill on this tab|right now/i.test(raw) && state.current?.url) {
      await openCurrentRole();
      result = await sendToActiveTab('CAREER_OPS_FILL_BASIC');
    } else {
      throw err;
    }
  }
  if (result?.navigateTo) {
    await followNavigateTo(result.navigateTo);
    result = await sendToActiveTab('CAREER_OPS_FILL_BASIC');
  }
  if (result?.filled >= 0) {
    els.currentCard.classList.remove('empty');
    els.currentCard.innerHTML += `<div class="meta">Filled fields: ${result.filled}</div>`;
    els.currentCard.innerHTML += renderFilledKeyLine('Filled keys', result.filledKeys);
    if (Number.isFinite(Number(result.requiredMissing))) {
      els.currentCard.innerHTML += `<div class="meta">Required fields still missing: ${formatNum(result.requiredMissing)}</div>`;
    }
    if (result.filled === 0) {
      const hint = result.openedApplication
        ? 'Application form was opened. Run Auto after login one more time.'
        : 'No recognizable fields found. Open the application form page and try again.';
      els.currentCard.innerHTML += `<div class="meta">${escapeText(hint)}</div>`;
    }
  }
}

async function attachPdf() {
  let result = await sendToActiveTab('CAREER_OPS_ATTACH_PDF');
  if (result?.navigateTo) {
    await followNavigateTo(result.navigateTo);
    result = await sendToActiveTab('CAREER_OPS_ATTACH_PDF');
  }
  if (result?.ok) {
    els.currentCard.classList.remove('empty');
    els.currentCard.innerHTML += `<div class="meta">PDF attached: ${escapeText(result.pdfPath || '')}</div>`;
    if (Number(result.restored) > 0) {
      els.currentCard.innerHTML += `<div class="meta">Restored ${formatNum(result.restored)} field(s) after upload.</div>`;
    }
  }
}

async function autoAfterLogin() {
  let result = await sendToActiveTab('CAREER_OPS_FILL_AND_ATTACH');
  if (result?.navigateTo) {
    await followNavigateTo(result.navigateTo);
    result = await sendToActiveTab('CAREER_OPS_FILL_AND_ATTACH');
  }
  if (result?.ok) {
    els.currentCard.classList.remove('empty');
    els.currentCard.innerHTML += `<div class="meta">Auto run complete. Filled fields: ${formatNum(result.filled)}.</div>`;
    els.currentCard.innerHTML += renderFilledKeyLine('Filled keys', result.filledKeys);
    if (Number(result.restored) > 0) {
      els.currentCard.innerHTML += `<div class="meta">Restored ${formatNum(result.restored)} field(s) after upload.</div>`;
    }
    if (Number(result.refill) > 0) {
      els.currentCard.innerHTML += `<div class="meta">Refilled ${formatNum(result.refill)} field(s) after upload.</div>`;
      els.currentCard.innerHTML += renderFilledKeyLine('Refill keys', result.refillKeys);
    }
    if (Number(result.filled) === 0) {
      const hint = result.openedApplication
        ? 'Opened the application form. Click Auto after login again to fill newly loaded fields.'
        : 'No form fields were detected on this page. Make sure you are on the application form, not the job description.';
      els.currentCard.innerHTML += `<div class="meta">${escapeText(hint)}</div>`;
    }
  }
}

async function markSubmitted() {
  if (!state.current) return;
  await api('/api/mark', {
    method: 'POST',
    body: JSON.stringify({ packPath: state.current.packPath, status: 'submitted', notes: 'submitted from extension UI' })
  });
  await refreshState();
}

async function openCurrentPack() {
  if (!state.current?.packPath) throw new Error('No role selected');
  await api('/api/open', {
    method: 'POST',
    body: JSON.stringify({ path: state.current.packPath })
  });
}

async function editCurrentResume() {
  if (!state.currentPack) throw new Error('No role selected');
  const resumePath = state.currentPack.tailoredResumeToUpload || state.currentPack.resumeToUpload;
  if (!resumePath) throw new Error('No resume path found for this role');
  await api('/api/open', {
    method: 'POST',
    body: JSON.stringify({ path: resumePath })
  });
}

async function updateCurrentResume() {
  if (!state.current?.packPath) throw new Error('No role selected');
  const selectedPack = state.current.packPath;
  await withBusy('Updating tailored resume, ATS score, and PDF for selected application...', async () => {
    await api('/api/regenerate-role', {
      method: 'POST',
      body: JSON.stringify({ packPath: selectedPack })
    });
  }, { showWorkingCard: false });
  await selectApplication(selectedPack);

  // Real-time flow: open selected role tab first, then upload newly generated PDF.
  try {
    await openCurrentRole();
    let uploadResult = await sendToActiveTab('CAREER_OPS_ATTACH_PDF');
    if (uploadResult?.navigateTo) {
      await followNavigateTo(uploadResult.navigateTo);
      uploadResult = await sendToActiveTab('CAREER_OPS_ATTACH_PDF');
    }
    if (uploadResult?.ok) {
      els.currentCard.classList.remove('empty');
      els.currentCard.innerHTML += `<div class="meta">Updated resume generated and uploaded: ${escapeText(uploadResult.pdfPath || state.currentPack?.pdfPath || '')}</div>`;
      if (Number(uploadResult.restored) > 0) {
        els.currentCard.innerHTML += `<div class="meta">Restored ${formatNum(uploadResult.restored)} field(s) after upload.</div>`;
      }

      const refill = await sendToActiveTab('CAREER_OPS_FILL_BASIC');
      if (refill?.navigateTo) {
        await followNavigateTo(refill.navigateTo);
      }
      const refillDone = refill?.navigateTo ? await sendToActiveTab('CAREER_OPS_FILL_BASIC') : refill;
      if (typeof refillDone?.filled === 'number') {
        els.currentCard.innerHTML += `<div class="meta">Post-upload refill completed: ${formatNum(refillDone.filled)} field(s).</div>`;
        els.currentCard.innerHTML += renderFilledKeyLine('Refill keys', refillDone.filledKeys);
      }
    }
  } catch (err) {
    // One retry path for portals that render upload widgets after first navigation.
    try {
      let retry = await sendToActiveTab('CAREER_OPS_ATTACH_PDF');
      if (retry?.navigateTo) {
        await followNavigateTo(retry.navigateTo);
        retry = await sendToActiveTab('CAREER_OPS_ATTACH_PDF');
      }
      if (retry?.ok) {
        els.currentCard.classList.remove('empty');
        els.currentCard.innerHTML += `<div class="meta">Updated resume generated and uploaded after retry: ${escapeText(retry.pdfPath || state.currentPack?.pdfPath || '')}</div>`;
        if (Number(retry.restored) > 0) {
          els.currentCard.innerHTML += `<div class="meta">Restored ${formatNum(retry.restored)} field(s) after retry.</div>`;
        }
        return;
      }
    } catch {
      // fall through to final user guidance below
    }

    els.currentCard.classList.remove('empty');
    els.currentCard.innerHTML += `<div class="meta">Resume was updated. Auto-upload still needs the portal application form visible (not only job description). ${escapeText(err?.message || String(err))}</div>`;
  }
}

async function applyNextRole() {
  if (!state.current?.packPath) throw new Error('No role selected');
  const currentPackPath = state.current.packPath;

  await withBusy('Applying to current role, then moving to the next one...', async () => {
    await updateCurrentResume();
    try {
      await fillBasic();
    } catch (err) {
      console.warn('Refill after update failed', err);
    }
  });

  await nextRole();

  els.currentCard.classList.remove('empty');
  els.currentCard.innerHTML += `<div class="meta">Advanced from ${escapeText(currentPackPath)} to the next role.</div>`;
}

async function nextRole() {
  if (!state.queue.length) return;
  state.activeIndex = Math.min(state.activeIndex + 1, state.queue.length - 1);
  state.current = state.queue[state.activeIndex];
  state.currentPack = state.current ? await api(`/api/pack?path=${encodeURIComponent(state.current.packPath)}`) : null;
  render();
}

async function prepareQueue() {
  await withBusy('Preparing queue from current ranked data...', async () => {
    await api('/api/prepare', {
      method: 'POST',
      body: JSON.stringify({ count: 10 })
    });
  });
}

async function refreshQueue(mode = 'queue', options = {}) {
  const modeLabel = mode === 'search'
    ? 'Refreshing search + queue (this can take longer)...'
    : 'Reloading queue from current data...';
  const perform = async () => {
    if (mode === 'search') {
      await api('/api/refresh', {
        method: 'POST',
        body: JSON.stringify({ mode, count: 10, force: options.force === true })
      });
      await refreshState({ preserveCurrent: options.preserveCurrent !== false });
      return;
    }

    // Queue mode is intentionally lightweight to keep the side panel responsive.
    await refreshState({ preserveCurrent: options.preserveCurrent !== false });
  };

  if (options.background) {
    return perform();
  }

  await withBusy(modeLabel, perform, { refreshState: false });
}

async function copyAnswers() {
  const text = els.answersBox.textContent || '';
  await navigator.clipboard.writeText(text);
}

function upsertGeneratedApplication(item) {
  if (!item?.packPath) return;
  const existing = state.applications.findIndex((row) => row.packPath === item.packPath);
  if (existing >= 0) {
    state.applications[existing] = { ...state.applications[existing], ...item };
    return;
  }
  state.applications = [item, ...state.applications];
}

async function resolveJobLink() {
  const inputUrl = String(els.jobLinkInput?.value || '').trim();
  if (/^https?:\/\//i.test(inputUrl)) return inputUrl;
  const tab = await currentTab();
  if (isHttpTab(tab)) return tab.url;
  throw new Error('Enter a valid job link or open the job page in an active browser tab.');
}

function getApplyLinkOptions() {
  const category = String(els.jobCategoryInput?.value || '').trim();
  const skills = String(els.jobSkillsInput?.value || '').trim();
  const resume = String(els.resumeTrackSelect?.value || '').trim();

  return {
    ...(category ? { category } : {}),
    ...(skills ? { skills } : {}),
    ...(resume ? { resume } : {})
  };
}

async function applyFromLink() {
  const targetUrl = await resolveJobLink();
  const options = getApplyLinkOptions();
  const result = await withBusy('Generating tailored resume and quick pack from job link...', async () => {
    return api('/api/apply-link', {
      method: 'POST',
      body: JSON.stringify({ url: targetUrl, ...options })
    });
  }, { refreshState: false });

  if (!result?.item?.packPath) {
    throw new Error('Quick apply pack was not generated for this link.');
  }

  const generated = result.item;
  upsertGeneratedApplication(generated);
  state.current = generated;
  state.activeIndex = 0;
  state.currentPack = await api(`/api/pack?path=${encodeURIComponent(generated.packPath)}`);
  if (els.jobLinkInput) els.jobLinkInput.value = generated.url || targetUrl;
  render();

  try {
    await openCurrentRole();
    await autoAfterLogin();
    els.currentCard.innerHTML += '<div class="meta">Applied from link: tailored resume generated and auto-fill attempted.</div>';
  } catch (err) {
    els.currentCard.classList.remove('empty');
    els.currentCard.innerHTML += `<div class="meta">Link pack is ready. Open/login and click Auto after login if needed. ${escapeText(err?.message || String(err))}</div>`;
  }
}

function withActionError(actionName, fn) {
  return () => fn().catch((err) => showError(err, actionName));
}

els.thresholdInput.addEventListener('change', withActionError('Refresh state', refreshState));
els.applyLinkBtn.addEventListener('click', withActionError('Apply from link', applyFromLink));
els.appFilterInput.addEventListener('input', (event) => {
  state.appFilter = event.target.value || '';
  renderApplications();
});
els.reloadAppsBtn.addEventListener('click', withActionError('Reload applications', refreshState));
els.refreshBtn.addEventListener('click', withActionError('Refresh queue', () => refreshQueue('queue', { background: true, preserveCurrent: true })));
els.searchBtn.addEventListener('click', withActionError('Refresh + search', () => refreshQueue('search', { background: true, preserveCurrent: true, force: true })));
els.prepareBtn.addEventListener('click', withActionError('Prepare queue', prepareQueue));
els.openBtn.addEventListener('click', withActionError('Open role', openCurrentRole));
els.autoBtn.addEventListener('click', withActionError('Auto after login', autoAfterLogin));
els.fillBtn.addEventListener('click', withActionError('Fill basic', fillBasic));
els.attachBtn.addEventListener('click', withActionError('Attach PDF', attachPdf));
els.updateResumeBtn.addEventListener('click', withActionError('Update resume + upload', updateCurrentResume));
els.applyNextBtn.addEventListener('click', withActionError('Apply next', applyNextRole));
els.editResumeBtn.addEventListener('click', withActionError('Edit resume', editCurrentResume));
els.openPackBtn.addEventListener('click', withActionError('Open pack', openCurrentPack));
els.markBtn.addEventListener('click', withActionError('Mark submitted', markSubmitted));
els.nextBtn.addEventListener('click', withActionError('Next role', nextRole));
els.copyBtn.addEventListener('click', withActionError('Copy answers', copyAnswers));

els.appsList.addEventListener('click', (event) => {
  const card = event.target.closest('[data-pack-path]');
  if (!card) return;
  const packPath = card.getAttribute('data-pack-path');
  selectApplication(packPath).catch((err) => showError(err, 'Select application'));
});

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    markSubmitted().catch((err) => showError(err, 'Mark submitted'));
  } else if (event.key === 'k') {
    event.preventDefault();
    nextRole().catch((err) => showError(err, 'Next role'));
  } else if (event.key === 'o') {
    event.preventDefault();
    openCurrentRole().catch((err) => showError(err, 'Open role'));
  } else if (event.key === 'f') {
    event.preventDefault();
    fillBasic().catch((err) => showError(err, 'Fill basic'));
  } else if (event.key === 'l') {
    event.preventDefault();
    autoAfterLogin().catch((err) => showError(err, 'Auto after login'));
  } else if (event.key === 'a') {
    event.preventDefault();
    attachPdf().catch((err) => showError(err, 'Attach PDF'));
  }
});

function showError(err, action = '') {
  console.error(err);
  const raw = String(err?.message || err || '').trim();
  let message = raw || 'Unknown error';

  if (/Failed to fetch|Cannot reach helper server/i.test(raw)) {
    message = 'Helper server is not running. Start it with: npm --prefix /media/krishna/Windows/krishna/workplace/job-application-fullfill/career-ops run extension:serve';
  } else if (/\(408\)|Request failed \(408\)|timed out|timeout/i.test(raw)) {
    message = 'Refresh timed out while running long research jobs. Use Refresh queue for instant reload, and use Refresh + search only when you want a full rescan.';
  } else if (/No suitable job tab found/i.test(raw)) {
    message = 'No job tab found. Click Open role first, then run autofill/upload.';
  } else if (/Unable to run autofill on this tab/i.test(raw)) {
    message = 'This tab does not allow autofill. Open the real application form page (https://...), then try again.';
  } else if (/No file input found on this page/i.test(raw)) {
    message = 'Upload field not found. Open the actual application form and scroll to the resume upload section, then retry.';
  } else if (/PDF path is missing/i.test(raw)) {
    message = 'No generated PDF found for this role. Click Update resume + upload first.';
  }

  const prefix = action ? `${action} failed: ` : '';
  els.currentCard.classList.remove('empty');
  els.currentCard.innerHTML = `<div class="current-title">Error</div><div class="meta">${escapeText(prefix + message)}</div>`;
}

async function initializePanel() {
  try {
    await refreshState({ preserveCurrent: true });
  } catch (err) {
    showError(err, 'Initial load');
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    triggerActiveRefresh('visibility refresh');
  }
});

window.addEventListener('focus', () => {
  triggerActiveRefresh('focus refresh');
});

if (chrome?.tabs?.onActivated) {
  chrome.tabs.onActivated.addListener(() => {
    triggerActiveRefresh('tab activation refresh');
  });
}

initializePanel().catch((err) => showError(err, 'Initial load'));
