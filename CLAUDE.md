# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Link Gate is a Chrome Extension (Manifest V3) that intercepts clicks on external links and shows a confirmation/preview page before navigating. Built with Plasmo framework and React.

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

The extension has two runtime components communicating via CustomEvent on the shared document:

### Message Flow

```
[Web Page] click/middle-click external link
  → content.ts intercepts, dispatches CustomEvent "link-gate:open"
    → contents/link-preview.tsx (CSUI) receives event via document listener
      → shows in-page dialog overlay (Shadow DOM isolated)
        → [User clicks "Go back" / Escape / backdrop] → dialog closes
        → [User clicks "Open"]
          → (new tab context) window.open(url, "_blank", "noopener,noreferrer")
          → (same tab context) window.location.href = url
```

### types.ts (Shared Types)

Defines the `isHttpUrl` validation utility that restricts navigation to `http:`/`https:` protocols.

### content.ts (Content Script)

Injected into all pages. Scans `<a>` elements for cross-origin links, marks them with `data-link-gate-processed="true"` (non-external links get `"false"`), and uses a `MutationObserver` for dynamically added links. On `click` and `auxclick` (middle-click), prevents default navigation and dispatches a `"link-gate:open"` CustomEvent on `document` with URL, link text, and new-tab flag.

### contents/link-preview.tsx (CSUI Dialog)

Plasmo Content Scripts UI component rendered inside a Shadow DOM. Listens for `"link-gate:open"` CustomEvent on `document`. Displays an overlay dialog showing the destination domain, link text, and full URL. "Go back" / Escape / backdrop click closes the dialog; "Open" navigates via `window.location.href` (same tab) or `window.open` (new tab). Uses `getShadowHostId` for stable element ID and `getStyle` with `:host { all: initial; }` for style isolation.

## Code Style

- Prettier configured: no semicolons, double quotes, no trailing commas
- Import sorting via `@ianvs/prettier-plugin-sort-imports`
- Path alias: `~*` maps to project root
