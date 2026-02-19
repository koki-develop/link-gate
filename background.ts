/**
 * background.ts — Service Worker (Manifest V3)
 *
 * This is the extension's background script that runs as a service worker.
 * It acts as the central message hub, handling two types of messages from
 * other parts of the extension:
 *
 *   1. "open-preview"  — Sent by the content script when the user clicks
 *      an external link. Opens a new tab with the preview/confirmation page.
 *
 *   2. "navigate-tab"  — Sent by the preview page when the user confirms
 *      navigation. Navigates the *original* tab to the destination URL,
 *      then the preview tab closes itself.
 *
 * It also maintains a mapping between preview tabs and their source tabs
 * using chrome.storage.session, so that the correct tab can be navigated
 * when the user confirms.
 */

import { isHttpUrl, type Message } from "~types"

const SOURCE_KEY_PREFIX = "source_"

async function setSourceTab(
  previewTabId: number,
  sourceTabId: number
): Promise<void> {
  await chrome.storage.session.set({
    [`${SOURCE_KEY_PREFIX}${previewTabId}`]: sourceTabId
  })
}

async function getSourceTab(previewTabId: number): Promise<number | undefined> {
  const key = `${SOURCE_KEY_PREFIX}${previewTabId}`
  const data = await chrome.storage.session.get(key)
  return data[key]
}

async function deleteSourceTab(previewTabId: number): Promise<void> {
  await chrome.storage.session.remove(`${SOURCE_KEY_PREFIX}${previewTabId}`)
}

// Clean up tab mappings when a tab is closed.
chrome.tabs.onRemoved.addListener((tabId) => {
  ;(async () => {
    // Remove mapping if this tab was a preview tab
    await chrome.storage.session.remove(`${SOURCE_KEY_PREFIX}${tabId}`)

    // Remove mappings where this tab was a source tab
    const all = (await chrome.storage.session.get(null)) as unknown as Record<string, unknown>
    const keysToRemove: string[] = []
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith(SOURCE_KEY_PREFIX) && value === tabId) {
        keysToRemove.push(key)
      }
    }
    if (keysToRemove.length > 0) {
      await chrome.storage.session.remove(keysToRemove)
    }
  })().catch((err) => {
    console.error("[LinkGate] Failed to clean up tab mapping:", tabId, err)
  })
})

// ─── Message Router ──────────────────────────────────────────────────
// Central message listener that dispatches incoming messages to the
// appropriate handler. Returns `true` from the listener to indicate
// that `sendResponse` will be called asynchronously (required by the
// chrome.runtime.onMessage API for async responses).
// ─────────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    if (message.type === "open-preview") {
      handleOpenPreview(message, sender)
        .then(sendResponse)
        .catch((err) => {
          console.error(
            "[LinkGate] Unhandled error in open-preview handler:",
            err
          )
          sendResponse({ success: false })
        })
      return true
    }

    if (message.type === "navigate-tab") {
      handleNavigateTab(message, sender)
        .then(sendResponse)
        .catch((err) => {
          console.error(
            "[LinkGate] Unhandled error in navigate-tab handler:",
            err
          )
          sendResponse({ success: false })
        })
      return true
    }
  }
)

/**
 * Handles the "open-preview" message from the content script.
 *
 * Steps:
 *   1. Validates that the destination URL uses HTTP(S).
 *   2. Constructs the preview page URL with query parameters (url, text, newTab).
 *   3. Opens a new tab pointing to the preview page.
 *   4. Stores the mapping from the new preview tab to the source tab,
 *      so that "navigate-tab" can later find the correct tab to update.
 *
 * Returns { success: true } if the preview tab was opened successfully,
 * or { success: false } on validation failure or any Chrome API error.
 */
async function handleOpenPreview(
  message: Message & { type: "open-preview" },
  sender: chrome.runtime.MessageSender
): Promise<{ success: boolean }> {
  if (!isHttpUrl(message.url)) {
    console.warn("[LinkGate] Blocked non-HTTP(S) URL in open-preview:", message.url)
    return { success: false }
  }

  const sourceTabId = sender.tab?.id
  const params = new URLSearchParams({
    url: message.url,
    text: message.text || "",
    newTab: String(message.newTab ?? false)
  })
  const previewUrl = `${chrome.runtime.getURL("tabs/preview.html")}?${params}`

  try {
    const tab = await chrome.tabs.create({ url: previewUrl })
    if (tab.id != null && sourceTabId != null) {
      await setSourceTab(tab.id, sourceTabId)
    } else if (sourceTabId == null) {
      console.warn(
        "[LinkGate] No source tab ID available from sender; same-tab navigation will not work"
      )
    }
    return { success: true }
  } catch (err) {
    console.error("[LinkGate] Failed to create preview tab:", err)
    return { success: false }
  }
}

/**
 * Handles the "navigate-tab" message from the preview page.
 *
 * Security checks performed before navigation:
 *   1. Verifies the message sender is from this extension's own pages
 *      (prevents external pages from triggering navigation).
 *   2. Validates the destination URL uses HTTP(S) only.
 *   3. Ensures the sender tab ID is present.
 *   4. Looks up the source tab from the stored mapping.
 *
 * If all checks pass, navigates the original source tab to the
 * destination URL and cleans up the mapping entry.
 *
 * Returns { success: true } on successful navigation, or
 * { success: false } if any check fails or an error occurs.
 */
async function handleNavigateTab(
  message: Message & { type: "navigate-tab" },
  sender: chrome.runtime.MessageSender
): Promise<{ success: boolean }> {
  // Only allow messages from this extension's own pages.
  const extOrigin = chrome.runtime.getURL("")
  if (!sender.url?.startsWith(extOrigin)) {
    console.warn(
      "[LinkGate] Blocked navigate-tab from unauthorized origin:",
      sender.url
    )
    return { success: false }
  }

  if (!isHttpUrl(message.url)) {
    console.warn("[LinkGate] Blocked non-HTTP(S) navigation:", message.url)
    return { success: false }
  }

  const senderTabId = sender.tab?.id
  if (senderTabId == null) {
    console.warn("[LinkGate] No sender tab found for navigate-tab")
    return { success: false }
  }

  try {
    const sourceTabId = await getSourceTab(senderTabId)
    if (sourceTabId == null) {
      console.warn(
        "[LinkGate] No source tab found for preview tab:",
        senderTabId
      )
      return { success: false }
    }

    await chrome.tabs.update(sourceTabId, { url: message.url })
    await deleteSourceTab(senderTabId)
    return { success: true }
  } catch (err) {
    console.error("[LinkGate] Failed to navigate source tab:", err)
    return { success: false }
  }
}
