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

The extension has three runtime components communicating via chrome.runtime messaging:

### Message Flow

```
[Web Page] click/middle-click external link
  → content.ts intercepts, sends message via chrome.runtime.sendMessage
    → background.ts relays message to same frame via chrome.tabs.sendMessage
      → contents/link-preview.tsx (CSUI) receives message via chrome.runtime.onMessage
      → shows in-page dialog overlay (Shadow DOM isolated)
        → [User clicks "Go back" / Escape / backdrop] → dialog closes
        → [User clicks "Open"]
          → (new tab context) window.open(url, "_blank", "noopener,noreferrer")
          → (same tab context) window.location.href = url
```

### types.ts (Shared Types)

Defines the `isHttpUrl` validation utility that restricts navigation to `http:`/`https:` protocols, the `LinkGateOpenMessage` message type, and the `STORAGE_KEY_ALLOWED_DOMAINS` storage key constant for the per-domain allow list.

### background.ts (Background Service Worker)

Relays `link-gate:open` messages from content.ts to the CSUI dialog in the same frame via `chrome.tabs.sendMessage`. Uses `frameId` to ensure messages are scoped to the originating frame.

### content.ts (Content Script)

Injected into all pages (`all_frames: true`, `run_at: "document_idle"`). Scans `<a>` elements for cross-origin links, marks them with `data-link-gate-processed="true"` (non-external links get `"false"`), and uses a `MutationObserver` for dynamically added links and href attribute changes. Loads allowed domains from `chrome.storage.local` and syncs via `chrome.storage.onChanged`; links to allowed domains bypass the dialog. On `click` and `auxclick` (middle-click), prevents default navigation and sends a `"link-gate:open"` message via `chrome.runtime.sendMessage` with URL, link text, and new-tab flag. Falls back to direct navigation if `sendMessage` fails (e.g., after extension update).

### contents/link-preview.tsx (CSUI Dialog)

Plasmo Content Scripts UI component rendered inside a Shadow DOM (`all_frames: true`, `run_at: "document_idle"`). Listens for `"link-gate:open"` messages via `chrome.runtime.onMessage`. Displays an overlay dialog showing the destination domain, link text, and full URL with an "Always allow links to [domain]" checkbox. "Go back" / Escape / backdrop click closes the dialog; "Open" navigates via `window.location.href` (same tab) or `window.open` (new tab), and if the checkbox is checked, saves the domain to `chrome.storage.local`. Locks body scroll while visible. Uses `getShadowHostId` for stable element ID and `getStyle` with `:host { all: initial; }` for style isolation. Button styles are defined as CSS classes in a `cssText` string injected into the shadow DOM.

## Code Style

- Prettier configured: no semicolons, double quotes, no trailing commas
- Import sorting via `@ianvs/prettier-plugin-sort-imports`
- Path alias: `~*` maps to project root
