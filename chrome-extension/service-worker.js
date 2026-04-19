const HELPER = 'http://127.0.0.1:3030';

async function getCurrentQueueItem() {
  const res = await fetch(`${HELPER}/api/current`, { cache: 'no-store' });
  const data = await res.json();
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
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'CAREER_OPS_FILL_BASIC', item });
      return sendResponse(response || { ok: true });
    }

    if (message?.type === 'CAREER_OPS_ATTACH_PDF') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return sendResponse({ ok: false, error: 'No active tab' });
      const item = message.item || await getCurrentQueueItem();
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'CAREER_OPS_ATTACH_PDF', item });
      return sendResponse(response || { ok: true });
    }

    if (message?.type === 'CAREER_OPS_FILL_AND_ATTACH') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return sendResponse({ ok: false, error: 'No active tab' });
      const item = message.item || await getCurrentQueueItem();
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'CAREER_OPS_FILL_AND_ATTACH', item });
      return sendResponse(response || { ok: true });
    }

    if (message?.type === 'CAREER_OPS_MARK_SUBMITTED') {
      const item = message.item || await getCurrentQueueItem();
      if (!item) return sendResponse({ ok: false, error: 'Queue is empty' });
      const res = await fetch(`${HELPER}/api/mark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packPath: item.packPath, status: message.status || 'submitted', notes: message.notes || '' })
      });
      const data = await res.json();
      return sendResponse(data);
    }

    if (message?.type === 'CAREER_OPS_OPEN_PDF') {
      const item = message.item || await getCurrentQueueItem();
      if (!item) return sendResponse({ ok: false, error: 'Queue is empty' });
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.tabs.create({ url: `${HELPER}/api/pdf?path=${encodeURIComponent(item.pdfPath)}` });
        return sendResponse({ ok: true });
      }
    }

    sendResponse({ ok: false, error: 'Unknown message' });
  })().catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));

  return true;
});
