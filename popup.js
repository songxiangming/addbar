// AddBar — Popup Search (popup.js)
// Used as fallback when content script can't run (chrome://, blank tabs)

(function () {
  const params = new URLSearchParams(window.location.search);
  const originTabId = parseInt(params.get('tabId'), 10);

  const input = document.getElementById('addbar-input');
  const resultsList = document.getElementById('addbar-results');

  let selectedIndex = -1;
  let results = [];
  let debounceTimer = null;

  input.focus();

  input.addEventListener('input', handleInput);
  input.addEventListener('keydown', handleKeydown);

  function handleInput(e) {
    const query = e.target.value;
    clearTimeout(debounceTimer);

    if (!query.trim()) {
      resultsList.innerHTML = '';
      results = [];
      selectedIndex = -1;
      return;
    }

    debounceTimer = setTimeout(() => {
      searchHistory(query);
    }, 150);
  }

  async function searchHistory(query) {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return;

    const tokens = trimmed.split(/\s+/);

    const items = await chrome.history.search({
      text: '',
      maxResults: 1000,
      startTime: 0,
    });

    const matched = items.filter((item) => {
      const title = (item.title || '').toLowerCase();
      const url = (item.url || '').toLowerCase();
      return tokens.every((token) => title.includes(token) || url.includes(token));
    });

    matched.sort((a, b) => scoreItem(tokens, b) - scoreItem(tokens, a));

    results = matched.slice(0, 20).map((item) => ({
      title: item.title || item.url,
      url: item.url,
    }));

    selectedIndex = results.length > 0 ? 0 : -1;
    renderResults();
  }

  function scoreItem(tokens, item) {
    const title = (item.title || '').toLowerCase();
    const url = (item.url || '').toLowerCase();
    let score = 0;

    for (const token of tokens) {
      if (title.includes(token)) score += 10;
      if (url.includes(token)) score += 5;
    }

    score -= url.length * 0.01;
    score += Math.min(item.visitCount || 0, 50) * 0.1;

    return score;
  }

  function handleKeydown(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (results.length > 0) {
          selectedIndex = (selectedIndex + 1) % results.length;
          updateSelection();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (results.length > 0) {
          selectedIndex = (selectedIndex - 1 + results.length) % results.length;
          updateSelection();
        }
        break;

      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          navigateAndClose(results[selectedIndex].url);
        }
        break;

      case 'Escape':
        e.preventDefault();
        window.close();
        break;
    }
  }

  function navigateAndClose(url) {
    if (originTabId) {
      chrome.tabs.update(originTabId, { url }, () => {
        window.close();
      });
    } else {
      // Fallback: open in a new tab
      chrome.tabs.create({ url }, () => {
        window.close();
      });
    }
  }

  function renderResults() {
    resultsList.innerHTML = '';

    results.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'addbar-result' + (index === selectedIndex ? ' selected' : '');

      const titleSpan = document.createElement('span');
      titleSpan.className = 'addbar-title';
      titleSpan.textContent = item.title || item.url;

      const urlSpan = document.createElement('span');
      urlSpan.className = 'addbar-url';
      urlSpan.textContent = item.url;

      li.appendChild(titleSpan);
      li.appendChild(urlSpan);

      li.addEventListener('click', () => {
        navigateAndClose(item.url);
      });

      li.addEventListener('mouseenter', () => {
        selectedIndex = index;
        updateSelection();
      });

      resultsList.appendChild(li);
    });
  }

  function updateSelection() {
    const items = resultsList.querySelectorAll('.addbar-result');
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === selectedIndex);
    });
    const selected = resultsList.querySelector('.selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }
})();
