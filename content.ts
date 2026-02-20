/**
 * content.ts — Content Script
 *
 * Injected into every HTTP/HTTPS page the user visits. This script
 * intercepts clicks on external (cross-origin) links and sends a
 * message to the background service worker to trigger the in-page
 * preview dialog (CSUI).
 *
 * Key behaviors:
 *   - Scans all existing <a> elements on page load.
 *   - Sends link data to the background service worker via
 *     chrome.runtime.sendMessage, which relays it to the CSUI
 *     dialog in the same frame. This channel is inaccessible
 *     to page scripts.
 *   - Uses a MutationObserver to handle dynamically added links
 *     (e.g., links rendered by SPAs after initial load).
 *   - Tracks processed anchors in an in-memory WeakSet to avoid
 *     attaching duplicate event listeners without modifying the DOM.
 */
import type { PlasmoCSConfig } from "plasmo"

import { normalizeHostname, STORAGE_KEY_ALLOWED_DOMAINS } from "~types"
import type { LinkGateOpenMessage } from "~types"

/**
 * Plasmo content script configuration.
 *
 * - matches: Run on all HTTP and HTTPS pages.
 * - all_frames: Also inject into iframes, so links inside
 *   embedded frames are intercepted as well.
 * - run_at: "document_idle" ensures the DOM is ready before
 *   we start scanning for links.
 */
export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  all_frames: true,
  run_at: "document_idle"
}

/**
 * In-memory set of <a> elements that have already been processed by
 * this content script. Using a WeakSet avoids modifying the DOM with
 * tracking attributes, which can disrupt SPA frameworks like Turbo Drive
 * that diff or morph the DOM during navigation.
 */
const processedAnchors = new WeakSet<HTMLAnchorElement>()

/**
 * Set of hostnames the user has marked as "always allowed".
 * Links to these domains bypass the preview dialog entirely.
 *
 * Loaded from chrome.storage.local on script init and kept in sync
 * via the storage.onChanged listener so that changes made in other
 * tabs or by the CSUI dialog take effect immediately.
 */
let allowedDomains = new Set<string>()

chrome.storage.local
  .get(STORAGE_KEY_ALLOWED_DOMAINS)
  .then((result) => {
    const stored = result[STORAGE_KEY_ALLOWED_DOMAINS]
    if (Array.isArray(stored)) {
      allowedDomains = new Set(stored)
    }
  })
  .catch((err) => {
    console.warn("[Link Gate] Failed to load allowed domains:", err)
  })

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return
  const change = changes[STORAGE_KEY_ALLOWED_DOMAINS]
  if (!change) return
  const newValue = change.newValue
  allowedDomains = new Set(Array.isArray(newValue) ? newValue : [])
})

const anchorHandlers = new WeakMap<HTMLAnchorElement, EventListener>()

/**
 * Determines whether an anchor element points to an external (cross-origin) URL.
 *
 * Uses anchor.href (the browser-resolved absolute URL) so that <base>
 * elements are correctly accounted for when determining the effective origin.
 *
 * Returns false for:
 *   - Empty or missing href attributes.
 *   - Fragment-only links (e.g., "#section").
 *   - Same-origin URLs (even if they include the full protocol + host).
 *   - Non-HTTP(S) protocols (e.g., mailto:, javascript:).
 *
 * Returns true only for HTTP(S) URLs whose origin differs from the current page.
 */
function isExternalLink(anchor: HTMLAnchorElement): boolean {
  const href = anchor.getAttribute("href")
  if (!href || href.trim() === "" || href.startsWith("#")) return false

  try {
    const resolved = new URL(anchor.href)
    return (
      (resolved.protocol === "http:" || resolved.protocol === "https:") &&
      resolved.origin !== window.location.origin
    )
  } catch {
    return false
  }
}

/**
 * Resolves the anchor's href to an absolute URL string.
 * Uses anchor.href (the browser-resolved URL) which accounts for
 * any <base> element on the page.
 * Returns null if the href is missing or cannot be parsed.
 */
function resolveUrl(anchor: HTMLAnchorElement): string | null {
  const href = anchor.getAttribute("href")
  if (!href) return null

  try {
    return new URL(anchor.href).href
  } catch {
    return null
  }
}

function removeAnchorListeners(anchor: HTMLAnchorElement): void {
  const handler = anchorHandlers.get(anchor)
  if (!handler) return
  anchor.removeEventListener("click", handler)
  anchor.removeEventListener("auxclick", handler)
  anchorHandlers.delete(anchor)
}

/**
 * Processes a single <a> element:
 *   1. Skips if already tracked in the processedAnchors WeakSet.
 *   2. If the link is not external, adds it to the set and returns.
 *   3. For external links, attaches click and auxclick (middle-click) handlers
 *      that intercept navigation and send a "link-gate:open" message to the
 *      background service worker.
 *   4. Adds the anchor to the processedAnchors set.
 */
function processAnchor(anchor: HTMLAnchorElement): void {
  if (processedAnchors.has(anchor)) return

  // Clean up any previously registered listeners before re-evaluating.
  // This prevents handler accumulation when href changes trigger re-processing.
  removeAnchorListeners(anchor)

  if (!isExternalLink(anchor)) {
    processedAnchors.add(anchor)
    return
  }

  function handleLinkClick(e: MouseEvent) {
    // Only handle left-click (button 0) and middle-click (button 1).
    // Right-clicks and other buttons are ignored to preserve context menu behavior.
    if (e.button !== 0 && e.button !== 1) return

    const absoluteUrl = resolveUrl(anchor)
    if (!absoluteUrl) return

    // Skip the preview dialog for allowed domains and let the browser navigate normally.
    try {
      const hostname = normalizeHostname(new URL(absoluteUrl).hostname)
      if (allowedDomains.has(hostname)) return
    } catch (err) {
      console.warn(
        "[Link Gate] Unexpected URL parse failure:",
        absoluteUrl,
        err
      )
    }

    // Suppress the browser's default link navigation and prevent the event
    // from bubbling to other handlers, so we can route through the preview dialog.
    e.preventDefault()
    e.stopPropagation()

    // Gather context about how the link was clicked to determine
    // whether it should open in a new tab or replace the current one.
    const text = anchor.textContent?.trim() || ""
    // Determine the effective navigation target:
    //   - Middle-click (button === 1) or modifier key (Cmd/Ctrl/Shift)
    //     forces "_blank" (new tab).
    //   - Otherwise, preserve the anchor's original target attribute
    //     (_blank, _top, _parent, named target) so iframe links
    //     navigate the correct browsing context.
    //   - Defaults to "_self" when no target is set.
    const target =
      e.button === 1 || e.metaKey || e.ctrlKey || e.shiftKey
        ? "_blank"
        : anchor.target || "_self"

    function navigateFallback(): void {
      if (target === "_blank") {
        window.open(absoluteUrl, "_blank", "noopener,noreferrer")
      } else if (target === "_self" || target === "") {
        window.location.href = absoluteUrl
      } else {
        window.open(absoluteUrl, target)
      }
    }

    // Send the link data to the background service worker, which
    // relays it to the CSUI dialog in the same frame.
    chrome.runtime
      .sendMessage({
        type: "link-gate:open",
        url: absoluteUrl,
        text,
        target
      } satisfies LinkGateOpenMessage)
      .then((response: { success: boolean } | undefined) => {
        if (!response?.success) {
          navigateFallback()
        }
      })
      .catch(() => {
        navigateFallback()
      })
  }

  // Store the handler reference so it can be removed later if href changes.
  const handler: EventListener = handleLinkClick as EventListener
  anchorHandlers.set(anchor, handler)

  // Listen on both "click" (left-click) and "auxclick" (middle-click)
  // to intercept all common ways users open links.
  anchor.addEventListener("click", handler)
  anchor.addEventListener("auxclick", handler)

  processedAnchors.add(anchor)
}

// ─── Initialization ──────────────────────────────────────────────────
// On script load, process all existing links, then start observing
// for dynamically added links (common in SPAs and lazy-loaded content).
// ─────────────────────────────────────────────────────────────────────

/** Scans the entire document for unprocessed <a> elements and processes each one. */
function processAllLinks(): void {
  document.querySelectorAll<HTMLAnchorElement>("a").forEach(processAnchor)
}

/**
 * Sets up a MutationObserver on document.body to detect newly added DOM nodes
 * and href attribute changes on existing anchors.
 * When new elements are inserted (e.g., by client-side rendering), any <a>
 * elements among them—or nested within them—are processed for link interception.
 * When an existing anchor's href attribute changes, it is re-evaluated in case
 * it has become (or stopped being) an external link.
 *
 * Observes with { childList: true, subtree: true, attributes: true,
 * attributeFilter: ["href"] } to catch additions and href changes
 * at any depth in the DOM tree.
 */
function observeNewLinks(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Re-evaluate anchors whose href attribute changed
      if (
        mutation.type === "attributes" &&
        mutation.target instanceof HTMLAnchorElement
      ) {
        processedAnchors.delete(mutation.target)
        processAnchor(mutation.target)
        continue
      }

      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue
        const el = node as Element

        if (el.tagName.toLowerCase() === "a") {
          processAnchor(el as HTMLAnchorElement)
        }

        el.querySelectorAll<HTMLAnchorElement>("a").forEach(processAnchor)
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href"]
  })
}

// Kick off: process existing links and start watching for new ones.
processAllLinks()
observeNewLinks()
