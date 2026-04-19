# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

AddBar is a Chrome extension (Manifest V3) that provides a keyboard-driven fuzzy search overlay for browser history. Press `Ctrl+Shift+Space` to open, type to search, arrow keys to navigate, Enter to open.

## Development

No build step, no dependencies. Pure JS + Chrome Extension APIs.

**To test:** Load as unpacked extension at `chrome://extensions` (Developer Mode on), then reload after changes.

**To debug:** Service worker console is on the extension card in `chrome://extensions`. Content script logs appear in the page's DevTools console.

## Architecture

Single popup-based UI: `background.js` receives hotkey command → opens `popup.html` as a centered popup window → `popup.js` calls `chrome.history` directly (extension pages have full API access) → navigates the original tab via `chrome.tabs.update()`.

**Fuzzy search** (in `popup.js:searchHistory`): space-delimited tokens, ALL must match in title or URL. Scoring weights title matches 2x over URL, penalizes long URLs, boosts visit count.

## Key Constraints

- MV3 service workers can go dormant; `chrome.commands` listeners wake them
- The popup receives the originating tab ID via query param (`?tabId=`), uses `chrome.tabs.update()` to navigate that tab
