// AddBar — Service Worker (background.js)

// --- AddBar search popup ---

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-addbar') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) return;
      openPopup(tab);
    });
  }

  if (command === 'open-workspace') {
    chrome.windows.getCurrent((currentWindow) => {
      const width = 520;
      const height = 600;
      const left = Math.round(currentWindow.left + (currentWindow.width - width) / 2);
      const top = currentWindow.top + 60;
      chrome.windows.create({
        url: 'workspace.html?windowId=' + currentWindow.id,
        type: 'popup',
        width,
        height,
        left,
        top,
      });
    });
  }
});

function openPopup(tab) {
  chrome.windows.getCurrent((currentWindow) => {
    const width = 620;
    const height = 500;
    const left = Math.round(currentWindow.left + (currentWindow.width - width) / 2);
    const top = currentWindow.top + 80;

    chrome.windows.create({
      url: 'popup.html?tabId=' + tab.id + '&windowId=' + currentWindow.id,
      type: 'popup',
      width,
      height,
      left,
      top,
    });
  });
}

// --- Workspace recording ---

const SAVE_DEBOUNCE_MS = 2000;
let saveTimers = {};

function generateId() {
  return crypto.randomUUID();
}

function isTrackableUrl(url) {
  return url && !/^(chrome|chrome-extension|about|edge):/.test(url);
}

async function loadWorkspace() {
  const data = await chrome.storage.local.get('workspace');
  return data.workspace || { records: {} };
}

async function saveWorkspace(workspace) {
  await chrome.storage.local.set({ workspace });
}

function findRecordByWindowId(workspace, windowId) {
  for (const record of Object.values(workspace.records)) {
    if (record.windowId === windowId && record.closedAt === null) {
      return record;
    }
  }
  return null;
}

async function captureWindow(windowId) {
  try {
    const tabs = await chrome.tabs.query({ windowId });
    let groups = [];
    try {
      groups = await chrome.tabGroups.query({ windowId });
    } catch (e) { /* window may have closed */ }

    const filteredTabs = tabs
      .filter((t) => isTrackableUrl(t.url))
      .map((t) => ({
        url: t.url,
        title: t.title || '',
        pinned: t.pinned,
        groupId: t.groupId,
        index: t.index,
      }));

    const mappedGroups = groups.map((g) => ({
      id: g.id,
      title: g.title || '',
      color: g.color,
      collapsed: g.collapsed,
    }));

    return { tabs: filteredTabs, groups: mappedGroups };
  } catch (e) {
    return null;
  }
}

async function updateWindowRecord(windowId) {
  const captured = await captureWindow(windowId);
  if (!captured || captured.tabs.length === 0) return;

  const workspace = await loadWorkspace();
  let record = findRecordByWindowId(workspace, windowId);

  if (!record) {
    // New window — check it's a normal window
    try {
      const win = await chrome.windows.get(windowId);
      if (win.type !== 'normal') return;
    } catch (e) {
      return;
    }
    record = {
      id: generateId(),
      windowId,
      closedAt: null,
      tabs: [],
      groups: [],
    };
    workspace.records[record.id] = record;
  }

  record.tabs = captured.tabs;
  record.groups = captured.groups;
  await saveWorkspace(workspace);
}

function scheduleSave(windowId) {
  clearTimeout(saveTimers[windowId]);
  saveTimers[windowId] = setTimeout(() => {
    delete saveTimers[windowId];
    updateWindowRecord(windowId);
  }, SAVE_DEBOUNCE_MS);
}

// --- Event listeners (top-level for MV3 wake-up) ---

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.windowId) scheduleSave(tab.windowId);
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (!removeInfo.isWindowClosing) {
    scheduleSave(removeInfo.windowId);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === 'complete' ||
    changeInfo.pinned !== undefined ||
    changeInfo.groupId !== undefined ||
    changeInfo.title !== undefined
  ) {
    scheduleSave(tab.windowId);
  }
});

chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
  scheduleSave(moveInfo.windowId);
});

chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
  scheduleSave(attachInfo.newWindowId);
});

chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
  scheduleSave(detachInfo.oldWindowId);
});

chrome.windows.onCreated.addListener((win) => {
  if (win.type === 'normal') {
    scheduleSave(win.id);
  }
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  clearTimeout(saveTimers[windowId]);
  delete saveTimers[windowId];

  const workspace = await loadWorkspace();
  const record = findRecordByWindowId(workspace, windowId);
  if (record) {
    record.closedAt = Date.now();
    await saveWorkspace(workspace);
  }
});

chrome.tabGroups.onCreated.addListener((group) => {
  scheduleSave(group.windowId);
});

chrome.tabGroups.onRemoved.addListener((group) => {
  scheduleSave(group.windowId);
});

chrome.tabGroups.onUpdated.addListener((group) => {
  scheduleSave(group.windowId);
});

// --- Startup reconciliation ---

async function reconcileOnStartup() {
  const workspace = await loadWorkspace();
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });

  // Build tab URL sets for current windows
  const currentWindows = [];
  for (const win of windows) {
    const tabs = await chrome.tabs.query({ windowId: win.id });
    const urls = new Set(tabs.map((t) => t.url).filter(isTrackableUrl));
    currentWindows.push({ windowId: win.id, urls });
  }

  const matchedRecordIds = new Set();

  // Try to match current windows to existing records
  for (const cw of currentWindows) {
    let bestMatch = null;
    let bestOverlap = 0;

    for (const record of Object.values(workspace.records)) {
      if (matchedRecordIds.has(record.id)) continue;
      const recordUrls = new Set(record.tabs.map((t) => t.url));
      if (recordUrls.size === 0 || cw.urls.size === 0) continue;

      let overlap = 0;
      for (const url of cw.urls) {
        if (recordUrls.has(url)) overlap++;
      }

      const overlapRatio = overlap / Math.max(recordUrls.size, cw.urls.size);
      if (overlapRatio >= 0.5 && overlap > bestOverlap) {
        bestMatch = record;
        bestOverlap = overlap;
      }
    }

    if (bestMatch) {
      bestMatch.windowId = cw.windowId;
      bestMatch.closedAt = null;
      matchedRecordIds.add(bestMatch.id);
      // Schedule a full update to capture current tab state
      scheduleSave(cw.windowId);
    } else {
      // New window — create record
      const captured = await captureWindow(cw.windowId);
      if (captured && captured.tabs.length > 0) {
        const record = {
          id: generateId(),
          windowId: cw.windowId,
          closedAt: null,
          tabs: captured.tabs,
          groups: captured.groups,
        };
        workspace.records[record.id] = record;
      }
    }
  }

  // Mark unmatched previously-open records as closed
  for (const record of Object.values(workspace.records)) {
    if (!matchedRecordIds.has(record.id) && record.closedAt === null) {
      // Check if its windowId is among current windows
      const stillOpen = currentWindows.some((cw) => cw.windowId === record.windowId);
      if (!stillOpen) {
        record.closedAt = Date.now();
      }
    }
  }

  await saveWorkspace(workspace);
}

chrome.runtime.onStartup.addListener(reconcileOnStartup);
chrome.runtime.onInstalled.addListener(reconcileOnStartup);
