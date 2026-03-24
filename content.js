// AddBar — Content Script (content.js)

(function () {
  let overlayVisible = false;
  let selectedIndex = -1;
  let results = [];
  let debounceTimer = null;

  let host, shadowRoot, overlay, input, resultsList;

  function getOverlayStyles() {
    return `
      #addbar-overlay {
        display: none;
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 2147483647;
        justify-content: center;
        align-items: flex-start;
        padding-top: 15vh;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        pointer-events: auto;
      }

      #addbar-container {
        width: 600px;
        max-width: 90vw;
        background: #1e1e2e;
        border-radius: 12px;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
        overflow: hidden;
        border: 1px solid #313244;
      }

      #addbar-input {
        width: 100%;
        padding: 16px 20px;
        font-size: 18px;
        background: #1e1e2e;
        color: #cdd6f4;
        border: none;
        outline: none;
        box-sizing: border-box;
        border-bottom: 1px solid #313244;
      }

      #addbar-input::placeholder {
        color: #6c7086;
      }

      #addbar-results {
        list-style: none;
        margin: 0;
        padding: 4px 0;
        max-height: 60vh;
        overflow-y: auto;
      }

      .addbar-result {
        padding: 10px 20px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 2px;
        border-left: 3px solid transparent;
      }

      .addbar-result.selected {
        background: #313244;
        border-left-color: #89b4fa;
      }

      .addbar-title {
        color: #cdd6f4;
        font-size: 14px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .addbar-url {
        color: #6c7086;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #addbar-results::-webkit-scrollbar {
        width: 6px;
      }
      #addbar-results::-webkit-scrollbar-track {
        background: transparent;
      }
      #addbar-results::-webkit-scrollbar-thumb {
        background: #45475a;
        border-radius: 3px;
      }
    `;
  }

  function createOverlay() {
    host = document.createElement('div');
    host.id = 'addbar-host';
    shadowRoot = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = getOverlayStyles();
    shadowRoot.appendChild(style);

    overlay = document.createElement('div');
    overlay.id = 'addbar-overlay';
    overlay.innerHTML = `
      <div id="addbar-container">
        <input id="addbar-input" type="text"
               placeholder="Search history..." autocomplete="off" spellcheck="false" />
        <ul id="addbar-results"></ul>
      </div>
    `;
    shadowRoot.appendChild(overlay);

    input = shadowRoot.getElementById('addbar-input');
    resultsList = shadowRoot.getElementById('addbar-results');

    input.addEventListener('input', handleInput);
    input.addEventListener('keydown', handleKeydown);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hideOverlay();
    });

    document.documentElement.appendChild(host);
  }

  function showOverlay() {
    if (!host) createOverlay();
    overlay.style.display = 'flex';
    input.value = '';
    resultsList.innerHTML = '';
    results = [];
    selectedIndex = -1;
    overlayVisible = true;
    requestAnimationFrame(() => input.focus());
  }

  function hideOverlay() {
    if (!overlay) return;
    overlay.style.display = 'none';
    overlayVisible = false;
    results = [];
    selectedIndex = -1;
  }

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
      chrome.runtime.sendMessage(
        { type: 'search-history', query },
        (response) => {
          if (chrome.runtime.lastError) return;
          results = response || [];
          selectedIndex = results.length > 0 ? 0 : -1;
          renderResults();
        }
      );
    }, 150);
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
          window.location.href = results[selectedIndex].url;
          hideOverlay();
        }
        break;

      case 'Escape':
        e.preventDefault();
        hideOverlay();
        break;
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
        window.location.href = item.url;
        hideOverlay();
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

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'toggle-overlay') {
      if (overlayVisible) {
        hideOverlay();
      } else {
        showOverlay();
      }
    }
  });
})();
