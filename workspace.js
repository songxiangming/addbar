// AddBar — Workspace Restore (workspace.js)

(function () {
  const params = new URLSearchParams(window.location.search);
  const originWindowId = parseInt(params.get('windowId'), 10);

  const tree = document.getElementById('workspace-tree');
  const restoreBtn = document.getElementById('restore-btn');
  const selectAllBtn = document.getElementById('select-all-btn');

  const GROUP_COLORS = {
    grey: '#9399b2',
    blue: '#89b4fa',
    red: '#f38ba8',
    yellow: '#f9e2af',
    green: '#a6e3a1',
    pink: '#f5c2e7',
    purple: '#cba6f7',
    cyan: '#94e2d5',
    orange: '#fab387',
  };

  let workspace = null;
  let allSelected = true;

  init();

  async function init() {
    const data = await chrome.storage.local.get('workspace');
    workspace = data.workspace;
    if (!workspace || Object.keys(workspace.records).length === 0) {
      tree.innerHTML = '<div class="empty-state">No saved workspace found</div>';
      restoreBtn.disabled = true;
      return;
    }
    renderTree();
  }

  function faviconUrl(pageUrl) {
    try {
      const host = new URL(pageUrl).hostname;
      return 'https://www.google.com/s2/favicons?domain=' + host + '&sz=16';
    } catch (e) {
      return '';
    }
  }

  function windowLabel(record) {
    if (record.tabs.length > 0) {
      try {
        return new URL(record.tabs[0].url).hostname;
      } catch (e) { /* fall through */ }
    }
    return 'Window';
  }

  function renderTree() {
    tree.innerHTML = '';

    // Sort: open windows first, then closed (most recently closed first)
    const records = Object.values(workspace.records).sort((a, b) => {
      if (a.closedAt === null && b.closedAt !== null) return -1;
      if (a.closedAt !== null && b.closedAt === null) return 1;
      if (a.closedAt !== null && b.closedAt !== null) return b.closedAt - a.closedAt;
      return 0;
    });

    for (const record of records) {
      const isCurrent = record.windowId === originWindowId && record.closedAt === null;
      renderWindowSection(record, isCurrent);
    }
  }

  function renderWindowSection(record, isCurrent) {
    const section = document.createElement('div');
    section.dataset.recordId = record.id;

    // Window header
    const header = document.createElement('div');
    header.className = 'window-header';

    const defaultChecked = !isCurrent;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = defaultChecked;
    checkbox.dataset.role = 'window';
    checkbox.dataset.recordId = record.id;

    const label = document.createElement('span');
    label.className = 'window-label';
    label.textContent = windowLabel(record);

    const badge = document.createElement('span');
    badge.className = 'window-badge';
    badge.textContent = record.tabs.length + ' tab' + (record.tabs.length !== 1 ? 's' : '');

    header.appendChild(checkbox);
    header.appendChild(label);

    if (record.closedAt !== null) {
      const tag = document.createElement('span');
      tag.className = 'window-closed-tag';
      tag.textContent = 'closed';
      header.appendChild(tag);
    }

    header.appendChild(badge);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'window-remove';
    removeBtn.textContent = '\u00d7';
    removeBtn.title = 'Remove from workspace';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeRecord(record.id);
    });
    header.appendChild(removeBtn);

    section.appendChild(header);

    // Partition tabs by group
    const groupIds = new Set(record.tabs.filter((t) => t.groupId !== -1).map((t) => t.groupId));
    const groupMap = {};
    for (const g of record.groups) {
      if (groupIds.has(g.id)) {
        groupMap[g.id] = g;
      }
    }

    // Render groups
    for (const groupId of groupIds) {
      const group = groupMap[groupId];
      if (!group) continue;
      const groupTabs = record.tabs.filter((t) => t.groupId === groupId);

      const groupHeader = document.createElement('div');
      groupHeader.className = 'group-header';

      const gCheckbox = document.createElement('input');
      gCheckbox.type = 'checkbox';
      gCheckbox.checked = defaultChecked;
      gCheckbox.dataset.role = 'group';
      gCheckbox.dataset.recordId = record.id;
      gCheckbox.dataset.groupId = groupId;

      const dot = document.createElement('span');
      dot.className = 'group-dot';
      dot.style.backgroundColor = GROUP_COLORS[group.color] || GROUP_COLORS.grey;

      const gTitle = document.createElement('span');
      gTitle.className = 'group-title';
      gTitle.textContent = group.title || 'Untitled group';

      const gCount = document.createElement('span');
      gCount.className = 'group-count';
      gCount.textContent = groupTabs.length + ' tab' + (groupTabs.length !== 1 ? 's' : '');

      groupHeader.appendChild(gCheckbox);
      groupHeader.appendChild(dot);
      groupHeader.appendChild(gTitle);
      groupHeader.appendChild(gCount);
      section.appendChild(groupHeader);

      for (const tab of groupTabs) {
        section.appendChild(renderTabRow(record.id, tab, false, defaultChecked));
      }

      gCheckbox.addEventListener('change', () => {
        toggleGroupTabs(section, groupId, gCheckbox.checked);
        updateWindowCheckbox(section, record.id);
      });
    }

    // Render ungrouped tabs
    const ungrouped = record.tabs.filter((t) => t.groupId === -1);
    for (const tab of ungrouped) {
      section.appendChild(renderTabRow(record.id, tab, true, defaultChecked));
    }

    // Wire window checkbox
    checkbox.addEventListener('change', () => {
      toggleAllInSection(section, checkbox.checked);
    });

    tree.appendChild(section);
  }

  function renderTabRow(recordId, tab, isUngrouped, checked) {
    const row = document.createElement('div');
    row.className = 'tab-row' + (isUngrouped ? ' ungrouped' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkbox.dataset.role = 'tab';
    checkbox.dataset.recordId = recordId;
    checkbox.dataset.url = tab.url;
    checkbox.dataset.pinned = tab.pinned;
    checkbox.dataset.groupId = tab.groupId;

    const favicon = document.createElement('img');
    favicon.className = 'tab-favicon';
    favicon.src = faviconUrl(tab.url);
    favicon.onerror = function () {
      this.style.display = 'none';
    };

    const info = document.createElement('div');
    info.className = 'tab-info';

    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = tab.title || tab.url;

    const url = document.createElement('div');
    url.className = 'tab-url';
    url.textContent = tab.url;

    info.appendChild(title);
    info.appendChild(url);

    row.appendChild(checkbox);
    row.appendChild(favicon);
    row.appendChild(info);

    checkbox.addEventListener('change', () => {
      const section = row.closest('[data-record-id]');
      if (tab.groupId !== -1) {
        updateGroupCheckbox(section, tab.groupId);
      }
      updateWindowCheckbox(section, recordId);
    });

    return row;
  }

  // --- Checkbox cascade ---

  function toggleAllInSection(section, checked) {
    section.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = checked;
      cb.indeterminate = false;
    });
  }

  function toggleGroupTabs(section, groupId, checked) {
    section.querySelectorAll('input[data-role="tab"][data-group-id="' + groupId + '"]').forEach((cb) => {
      cb.checked = checked;
    });
  }

  function updateGroupCheckbox(section, groupId) {
    const tabCbs = section.querySelectorAll('input[data-role="tab"][data-group-id="' + groupId + '"]');
    const groupCb = section.querySelector('input[data-role="group"][data-group-id="' + groupId + '"]');
    if (!groupCb || tabCbs.length === 0) return;

    const checked = Array.from(tabCbs).filter((cb) => cb.checked).length;
    groupCb.checked = checked === tabCbs.length;
    groupCb.indeterminate = checked > 0 && checked < tabCbs.length;
  }

  function updateWindowCheckbox(section, recordId) {
    const allCbs = section.querySelectorAll('input[data-role="tab"]');
    const winCb = section.querySelector('input[data-role="window"][data-record-id="' + recordId + '"]');
    if (!winCb || allCbs.length === 0) return;

    const checked = Array.from(allCbs).filter((cb) => cb.checked).length;
    winCb.checked = checked === allCbs.length;
    winCb.indeterminate = checked > 0 && checked < allCbs.length;
  }

  // --- Select All / Deselect All ---

  selectAllBtn.addEventListener('click', () => {
    allSelected = !allSelected;
    tree.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = allSelected;
      cb.indeterminate = false;
    });
    selectAllBtn.textContent = allSelected ? 'Deselect All' : 'Select All';
  });

  // --- Remove window ---

  async function removeRecord(recordId) {
    delete workspace.records[recordId];
    await chrome.storage.local.set({ workspace });

    if (Object.keys(workspace.records).length === 0) {
      tree.innerHTML = '<div class="empty-state">No saved workspace found</div>';
      restoreBtn.disabled = true;
      return;
    }

    const section = tree.querySelector('[data-record-id="' + recordId + '"]');
    if (section) section.remove();
  }

  // --- Restore ---

  restoreBtn.addEventListener('click', restore);

  async function restore() {
    restoreBtn.disabled = true;
    restoreBtn.textContent = 'Restoring...';

    const selected = getSelectedTabs();

    // Create pinned ungrouped tabs
    for (const tab of selected.ungrouped.filter((t) => t.pinned === 'true')) {
      try {
        await chrome.tabs.create({ windowId: originWindowId, url: tab.url, pinned: true });
      } catch (e) {
        console.warn('Failed to create tab:', tab.url, e);
      }
    }

    // Create groups
    for (const group of selected.groups) {
      const tabIds = [];
      for (const tab of group.tabs) {
        try {
          const created = await chrome.tabs.create({ windowId: originWindowId, url: tab.url });
          tabIds.push(created.id);
        } catch (e) {
          console.warn('Failed to create tab:', tab.url, e);
        }
      }
      if (tabIds.length > 0) {
        try {
          const newGroupId = await chrome.tabs.group({
            tabIds,
            createProperties: { windowId: originWindowId },
          });
          await chrome.tabGroups.update(newGroupId, {
            title: group.title,
            color: group.color,
            collapsed: group.collapsed,
          });
        } catch (e) {
          console.warn('Failed to create group:', group.title, e);
        }
      }
    }

    // Create non-pinned ungrouped tabs
    for (const tab of selected.ungrouped.filter((t) => t.pinned !== 'true')) {
      try {
        await chrome.tabs.create({ windowId: originWindowId, url: tab.url });
      } catch (e) {
        console.warn('Failed to create tab:', tab.url, e);
      }
    }

    // Remove all workspace records except the current window's
    const currentRecord = Object.values(workspace.records).find(
      (r) => r.windowId === originWindowId && r.closedAt === null
    );
    const keepId = currentRecord ? currentRecord.id : null;
    for (const id of Object.keys(workspace.records)) {
      if (id !== keepId) delete workspace.records[id];
    }
    await chrome.storage.local.set({ workspace });

    window.close();
  }

  function getSelectedTabs() {
    const groups = {};
    const ungrouped = [];

    tree.querySelectorAll('input[data-role="tab"]:checked').forEach((cb) => {
      const groupId = cb.dataset.groupId;
      const tab = { url: cb.dataset.url, pinned: cb.dataset.pinned };

      if (groupId === '-1') {
        ungrouped.push(tab);
      } else {
        if (!groups[groupId]) {
          groups[groupId] = { tabs: [], title: '', color: 'grey', collapsed: false };
        }
        groups[groupId].tabs.push(tab);
      }
    });

    // Fill in group metadata from workspace records
    for (const record of Object.values(workspace.records)) {
      for (const g of record.groups) {
        const key = String(g.id);
        if (groups[key]) {
          groups[key].title = g.title;
          groups[key].color = g.color;
          groups[key].collapsed = g.collapsed;
        }
      }
    }

    return { groups: Object.values(groups), ungrouped };
  }

  // --- Keyboard ---

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.close();
    if (e.key === 'Enter' && !restoreBtn.disabled) restore();
  });
})();
