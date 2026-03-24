// AddBar — Service Worker (background.js)

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-addbar') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) return;

      chrome.tabs.sendMessage(tab.id, { type: 'toggle-overlay' }).catch(() => {
        const url = tab.url || '';
        if (url.startsWith('http://') || url.startsWith('https://')) {
          // Page was loaded before extension — inject content script dynamically
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          }).then(() => {
            return chrome.scripting.insertCSS({
              target: { tabId: tab.id },
              files: ['styles.css'],
            });
          }).then(() => {
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, { type: 'toggle-overlay' });
            }, 50);
          }).catch(() => {
            openPopupFallback(tab);
          });
        } else {
          openPopupFallback(tab);
        }
      });
    });
  }
});

function openPopupFallback(tab) {
  chrome.windows.getCurrent((currentWindow) => {
    const width = 620;
    const height = 500;
    const left = Math.round(currentWindow.left + (currentWindow.width - width) / 2);
    const top = currentWindow.top + 80;

    chrome.windows.create({
      url: 'popup.html?tabId=' + tab.id,
      type: 'popup',
      width,
      height,
      left,
      top,
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'search-history') {
    handleSearch(message.query).then(sendResponse);
    return true; // Keep channel open for async response
  }
});

async function handleSearch(query) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const tokens = trimmed.split(/\s+/);

  const items = await chrome.history.search({
    text: '',
    maxResults: 1000,
    startTime: 0,
  });

  const matched = items.filter((item) => fuzzyMatch(tokens, item));
  matched.sort((a, b) => scoreItem(tokens, b) - scoreItem(tokens, a));

  return matched.slice(0, 20).map((item) => ({
    title: item.title || item.url,
    url: item.url,
  }));
}

function fuzzyMatch(tokens, item) {
  const title = (item.title || '').toLowerCase();
  const url = (item.url || '').toLowerCase();
  return tokens.every((token) => title.includes(token) || url.includes(token));
}

function scoreItem(tokens, item) {
  const title = (item.title || '').toLowerCase();
  const url = (item.url || '').toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (title.includes(token)) score += 10;
    if (url.includes(token)) score += 5;
  }

  // Prefer shorter URLs
  score -= url.length * 0.01;

  // Boost frequently visited pages (capped)
  score += Math.min(item.visitCount || 0, 50) * 0.1;

  return score;
}
