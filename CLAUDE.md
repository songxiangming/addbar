# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

AddBar is a Chrome extension (Manifest V3) that provides a keyboard-driven fuzzy search overlay for browser history. Press `Ctrl+Shift+Space` to open, type to search, arrow keys to navigate, Enter to open.

## Development

No build step, no dependencies. Pure JS + Chrome Extension APIs.

**To test:** Load as unpacked extension at `chrome://extensions` (Developer Mode on), then reload after changes.

**To debug:** Service worker console is on the extension card in `chrome://extensions`. Content script logs appear in the page's DevTools console.

## Architecture

Two UI paths, one search engine:

1. **Content script path** (normal pages): `background.js` receives hotkey command → messages `content.js` → content.js shows Shadow DOM overlay → sends search queries back to background.js (content scripts can't access `chrome.history`) → renders results
2. **Popup fallback path** (chrome://, blank tabs): `background.js` catches failed `sendMessage` → opens `popup.html` window → `popup.js` calls `chrome.history` directly (extension pages have full API access) → navigates the original tab via `chrome.tabs.update()`

**Fuzzy search** (in `background.js:handleSearch` and duplicated in `popup.js:searchHistory`): space-delimited tokens, ALL must match in title or URL. Scoring weights title matches 2x over URL, penalizes long URLs, boosts visit count.

## Key Constraints

- Content scripts cannot access `chrome.history` — all history queries go through message passing to the service worker, except in `popup.js` which runs as an extension page
- Shadow DOM (closed mode) in `content.js` isolates overlay styles — overlay CSS lives in `getOverlayStyles()`, not in `styles.css`
- `styles.css` only styles the host element in the main document
- MV3 service workers can go dormant; `chrome.commands` and `chrome.runtime.onMessage` listeners wake them
- `return true` is required in `onMessage` handlers with async responses
