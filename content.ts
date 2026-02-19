/**
 * content.ts — Content Script
 *
 * Injected into every HTTP/HTTPS page the user visits. This script
 * intercepts clicks on external (cross-origin) links and dispatches
 * a custom event to trigger the in-page preview dialog (CSUI).
 *
 * Key behaviors:
 *   - Scans all existing <a> elements on page load.
 *   - Uses a MutationObserver to handle dynamically added links
 *     (e.g., links rendered by SPAs after initial load).
 *   - Marks processed anchors with a data attribute to avoid
 *     attaching duplicate event listeners.
 */
import type { PlasmoCSConfig } from "plasmo"

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
 * Data attribute used to mark <a> elements that have already been
 * processed by this content script. The value is set to:
 *   - "true"  if the link is external and an event listener was attached.
 *   - "false" if the link was checked but determined to be internal/ignored.
 *
 * This prevents duplicate processing when the MutationObserver fires
 * or when processAllLinks() is called.
 */
const PROCESSED_ATTR = "data-link-gate-processed"

const anchorHandlers = new WeakMap<HTMLAnchorElement, EventListener>()

/**
 * Determines whether an anchor element points to an external (cross-origin) URL.
 *
 * Returns false for:
 *   - Empty or missing href attributes.
 *   - Fragment-only links (e.g., "#section").
 *   - Relative paths without a protocol (internal pages).
 *   - Same-origin URLs (even if they include the full protocol + host).
 *   - Non-HTTP(S) protocols (e.g., mailto:, javascript:).
 *
 * Returns true only for HTTP(S) URLs whose origin differs from the current page.
 */
function isExternalLink(anchor: HTMLAnchorElement): boolean {
  const href = anchor.getAttribute("href")
  if (!href || href.trim() === "" || href.startsWith("#")) return false
  if (!href.startsWith("//") && !href.includes("://")) return false

  try {
    const resolved = new URL(href, window.location.href)
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
 * Handles relative URLs by resolving them against the current page location.
 * Returns null if the href is missing or cannot be parsed.
 */
function resolveUrl(anchor: HTMLAnchorElement): string | null {
  const href = anchor.getAttribute("href")
  if (!href) return null

  try {
    return new URL(href, window.location.href).href
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
 *   1. Skips if already processed (has the data attribute).
 *   2. If the link is not external, marks it as processed with "false" and returns.
 *   3. For external links, attaches click and auxclick (middle-click) handlers
 *      that intercept navigation and send an "open-preview" message to the
 *      background script.
 *   4. Marks the anchor as processed with "true".
 */
function processAnchor(anchor: HTMLAnchorElement): void {
  if (anchor.hasAttribute(PROCESSED_ATTR)) return

  // Clean up any previously registered listeners before re-evaluating.
  // This prevents handler accumulation when href changes trigger re-processing.
  removeAnchorListeners(anchor)

  if (!isExternalLink(anchor)) {
    anchor.setAttribute(PROCESSED_ATTR, "false")
    return
  }

  function handleLinkClick(e: MouseEvent) {
    // Only handle left-click (button 0) and middle-click (button 1).
    // Right-clicks and other buttons are ignored to preserve context menu behavior.
    if (e.button !== 0 && e.button !== 1) return

    const absoluteUrl = resolveUrl(anchor)
    if (!absoluteUrl) return

    // Suppress the browser's default link navigation and prevent the event
    // from bubbling to other handlers, so we can route through the preview dialog.
    e.preventDefault()
    e.stopPropagation()

    // Gather context about how the link was clicked to determine
    // whether it should open in a new tab or replace the current one.
    const text = anchor.textContent?.trim() || ""
    // The link should open in a "new tab" context if any of these are true:
    //   - Middle-click (button === 1)
    //   - The anchor has target="_blank"
    //   - A modifier key is held (Cmd on macOS, Ctrl on Windows/Linux, Shift)
    const newTab =
      e.button === 1 ||
      anchor.target === "_blank" ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey

    // Dispatch a custom event to the CSUI dialog component,
    // which runs in the same content script world and shares this document.
    document.dispatchEvent(
      new CustomEvent("link-gate:open", {
        detail: { url: absoluteUrl, text, newTab }
      })
    )
  }

  // Store the handler reference so it can be removed later if href changes.
  const handler: EventListener = handleLinkClick as EventListener
  anchorHandlers.set(anchor, handler)

  // Listen on both "click" (left-click) and "auxclick" (middle-click)
  // to intercept all common ways users open links.
  anchor.addEventListener("click", handler)
  anchor.addEventListener("auxclick", handler)

  anchor.setAttribute(PROCESSED_ATTR, "true")
}

// ─── Initialization ──────────────────────────────────────────────────
// On script load, process all existing links, then start observing
// for dynamically added links (common in SPAs and lazy-loaded content).
// ─────────────────────────────────────────────────────────────────────

/** Scans the entire document for unprocessed <a> elements and processes each one. */
function processAllLinks(): void {
  document
    .querySelectorAll<HTMLAnchorElement>(`a:not([${PROCESSED_ATTR}])`)
    .forEach(processAnchor)
}

/**
 * Sets up a MutationObserver on document.body to detect newly added DOM nodes.
 * When new elements are inserted (e.g., by client-side rendering), any <a>
 * elements among them—or nested within them—are processed for link interception.
 *
 * Observes with { childList: true, subtree: true } to catch additions
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
        mutation.target.removeAttribute(PROCESSED_ATTR)
        processAnchor(mutation.target)
        continue
      }

      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue
        const el = node as Element

        if (el.tagName.toLowerCase() === "a") {
          processAnchor(el as HTMLAnchorElement)
        }

        el.querySelectorAll<HTMLAnchorElement>(
          `a:not([${PROCESSED_ATTR}])`
        ).forEach(processAnchor)
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
