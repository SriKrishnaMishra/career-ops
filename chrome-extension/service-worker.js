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

async function firstReachableHelper() {
  let lastError = null;
  for (const base of HELPERS) {
    try {
      const res = await fetch(`${base}/api/health`, { cache: 'no-store' });
      if (res.ok) return base;
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

async function sendActionWithNavigation(tabId, payload, retry = true) {
  const response = await chrome.tabs.sendMessage(tabId, payload);
  if (retry && response?.navigateTo) {
    await chrome.tabs.update(tabId, { url: response.navigateTo, active: true });
    await waitForTabComplete(tabId).catch(() => undefined);
    return sendActionWithNavigation(tabId, payload, false);
  }
  return response;
}

async function getCurrentQueueItem() {
  const data = await helperJson('/api/current');
  return data.item || null;
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {
    // Ignore if side panel is unavailable in the local browser build.
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'next-role') {
    const item = await getCurrentQueueItem();
    if (!item) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await chrome.tabs.update(tab.id, { url: item.url });
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === 'fill-basic') {
    await chrome.tabs.sendMessage(tab.id, { type: 'CAREER_OPS_FILL_BASIC' });
  }
  if (command === 'attach-pdf') {
    await chrome.tabs.sendMessage(tab.id, { type: 'CAREER_OPS_ATTACH_PDF' });
  }
  if (command === 'mark-submitted') {
    await chrome.runtime.sendMessage({ type: 'CAREER_OPS_MARK_SUBMITTED' });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'CAREER_OPS_OPEN_ROLE') {
      const item = message.item || await getCurrentQueueItem();
      if (!item) return sendResponse({ ok: false, error: 'Queue is empty' });
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.tabs.update(tab.id, { url: item.url });
        return sendResponse({ ok: true });
      }
      await chrome.tabs.create({ url: item.url });
      return sendResponse({ ok: true });
    }

    if (message?.type === 'CAREER_OPS_FILL_BASIC') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return sendResponse({ ok: false, error: 'No active tab' });
      const item = message.item || await getCurrentQueueItem();
      const response = await sendActionWithNavigation(tab.id, { type: 'CAREER_OPS_FILL_BASIC', item });
      return sendResponse(response || { ok: true });
    }

    if (message?.type === 'CAREER_OPS_ATTACH_PDF') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return sendResponse({ ok: false, error: 'No active tab' });
      const item = message.item || await getCurrentQueueItem();
      const response = await sendActionWithNavigation(tab.id, { type: 'CAREER_OPS_ATTACH_PDF', item });
      return sendResponse(response || { ok: true });
    }

    if (message?.type === 'CAREER_OPS_FILL_AND_ATTACH') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return sendResponse({ ok: false, error: 'No active tab' });
      const item = message.item || await getCurrentQueueItem();
      const response = await sendActionWithNavigation(tab.id, { type: 'CAREER_OPS_FILL_AND_ATTACH', item });
      return sendResponse(response || { ok: true });
    }

    if (message?.type === 'CAREER_OPS_MARK_SUBMITTED') {
      const item = message.item || await getCurrentQueueItem();
      if (!item) return sendResponse({ ok: false, error: 'Queue is empty' });
      const data = await helperJson('/api/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packPath: item.packPath, status: message.status || 'submitted', notes: message.notes || '' })
      });
      return sendResponse(data);
    }

    if (message?.type === 'CAREER_OPS_OPEN_PDF') {
      const item = message.item || await getCurrentQueueItem();
      if (!item) return sendResponse({ ok: false, error: 'Queue is empty' });
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const base = await firstReachableHelper();
        await chrome.tabs.create({ url: `${base}/api/pdf?path=${encodeURIComponent(item.pdfPath)}` });
        return sendResponse({ ok: true });
      }
    }

    sendResponse({ ok: false, error: 'Unknown message' });
  })().catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));

  return true;
});
