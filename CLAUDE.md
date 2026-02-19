# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LinkGate is a Chrome Extension (Manifest V3) that intercepts clicks on external links and shows a confirmation/preview page before navigating. Built with Plasmo framework and React.

## Tech Stack

- **Framework**: Plasmo 0.90.5
- **UI**: React 18 + TypeScript 5.3
- **Package Manager**: pnpm

## Commands

- `pnpm dev` — Start Plasmo dev server with hot reload
- `pnpm build` — Production build to `build/chrome-mv3-prod/`
- `pnpm package` — Package build into `.zip` for store submission
- `pnpm typecheck` — Run TypeScript type checking (no emit)

## Architecture

The extension has three runtime components communicating via `chrome.runtime.sendMessage`:

### Message Flow

```
[Web Page] click/middle-click external link
  → content.ts intercepts, sends "open-preview" message
    → background.ts stores tab mapping in chrome.storage.session,
      opens tabs/preview.html with query params
      → [User clicks "Open" in preview page]
        → (new tab) preview navigates directly via window.location.href
        → (same tab) sends "navigate-tab" message to background.ts
          → background.ts navigates the original tab via chrome.tabs.update
```

### types.ts (Shared Types)

Defines the `Message` union type used by all runtime components for `chrome.runtime.sendMessage`, and the `isHttpUrl` validation utility that restricts navigation to `http:`/`https:` protocols.

### content.ts (Content Script)

Injected into all pages. Scans `<a>` elements for cross-origin links, marks them with `data-link-gate-processed="true"` (non-external links get `"false"`), and uses a `MutationObserver` for dynamically added links. On `click` and `auxclick` (middle-click), prevents default navigation and sends `"open-preview"` to background with URL, link text, and new-tab flag. The source tab ID is obtained by background via `sender.tab.id`.

### background.ts (Service Worker)

Handles two message types:

- `"open-preview"`: Stores source tab mapping in `chrome.storage.session`, then opens the preview tab page with query params (`url`, `text`, `newTab`)
- `"navigate-tab"`: Validates sender URL starts with the extension origin and checks protocol (`http:`/`https:` only), then navigates the source tab to the destination

### tabs/preview.tsx (Tab Page)

React confirmation page. Reads query params to display destination domain, link text, and full URL. "Go back" closes the tab; "Open" either navigates directly via `window.location.href` (if opened in a new tab) or sends `"navigate-tab"` to background to navigate the original tab, then closes itself.

## Code Style

- Prettier configured: no semicolons, double quotes, no trailing commas
- Import sorting via `@ianvs/prettier-plugin-sort-imports`
- Path alias: `~*` maps to project root
