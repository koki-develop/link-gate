# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Link Gate is a Chrome Extension (Manifest V3) that intercepts clicks on external links and shows a confirmation/preview page before navigating. Built with Plasmo framework and React.

## Tech Stack

- **Framework**: Plasmo 0.90.5
- **UI**: React 19 + TypeScript 5.9
- **Package Manager**: pnpm

## Commands

- `pnpm dev` — Start Plasmo dev server with hot reload
- `pnpm build` — Production build to `build/chrome-mv3-prod/`
- `pnpm package` — Package build into `.zip` for store submission
- `pnpm typecheck` — Run TypeScript type checking (no emit)
- `pnpm fmt` — Format code with Prettier

## Architecture

The extension has three runtime components:

### Message Flow

```
[Web Page] click/middle-click external link
  → content.ts intercepts, calls showDialog() from dialog.ts
    → dialog.ts creates on-demand Shadow DOM overlay on <html>
    → shows in-page dialog overlay (Shadow DOM isolated)
      → [User clicks "Go back" / Escape / backdrop] → dialog closes, host removed from DOM
      → [User clicks "Open"]
        → (_blank target) window.open(url, "_blank", "noopener,noreferrer")
        → (_self/empty target) window.location.href = url
        → (named target) window.open(url, target)

[Extension popup] popup.tsx
  → Manages per-domain allow list in chrome.storage.local
  → Add / edit / delete allowed domains
```

### types.ts (Shared Types)

Defines the `normalizeHostname` utility that strips trailing dots for consistent domain comparison and the `STORAGE_KEY_ALLOWED_DOMAINS` storage key constant for the per-domain allow list.

### content.ts (Content Script)

Injected into all pages (`all_frames: true`, `run_at: "document_idle"`). Scans `<a>` elements for cross-origin links and tracks processed anchors via an in-memory `WeakSet<HTMLAnchorElement>`. Uses a `MutationObserver` for dynamically added links and href attribute changes. Tracks per-anchor event handlers via a `WeakMap` for proper cleanup on href changes. Loads allowed domains from `chrome.storage.local` (with error handling via `.catch()`) and syncs via `chrome.storage.onChanged`; links to allowed domains (compared using `normalizeHostname`) bypass the dialog. On `click` and `auxclick` (middle-click), prevents default navigation and calls `showDialog()` from `dialog.ts` with the URL, link text, and target string (preserves the anchor's `target` attribute; middle-click or modifier keys force `"_blank"`; defaults to `"_self"`).

### dialog.ts (Dialog Module)

Vanilla DOM module that creates an on-demand Shadow DOM overlay when `showDialog()` is called and removes it from the DOM when closed. The Shadow DOM host (`<div id="link-gate-preview-host">`) is appended to `document.documentElement` (not `<body>`) to avoid interference with SPA frameworks like Turbo Drive that replace `<body>` contents. Displays an overlay dialog showing the destination domain (via `normalizeHostname`), link text, and full URL with an "Always allow links to [domain]" checkbox. "Go back" / Escape / backdrop click closes the dialog with a fade-out transition, then removes the host element; "Open" navigates based on the `target` field: `window.location.href` for `_self`/empty, `window.open(url, "_blank", "noopener,noreferrer")` for `_blank`, or `window.open(url, target)` for named targets. If the checkbox is checked, saves the domain to `chrome.storage.local`. Locks body scroll while visible. Styles are defined in `link-preview.css` and injected into the Shadow DOM via Plasmo's `data-text:` import.

### popup.tsx (Extension Popup)

React popup component providing a UI for managing the per-domain allow list stored in `chrome.storage.local`. Supports adding, inline editing, and deleting allowed domains with input validation (empty, non-HTTP, invalid URL checks). Syncs in real-time via `chrome.storage.onChanged` and uses optimistic concurrency (re-reads storage before writes) with a `saving` lock to prevent concurrent modifications. Styled via `popup.module.css`.

## Code Style

- Prettier configured: no semicolons, double quotes, no trailing commas
- Import sorting via `@ianvs/prettier-plugin-sort-imports`
- Path alias: `~*` maps to project root
