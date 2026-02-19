import type { LinkGateOpenMessage } from "~types"

chrome.runtime.onMessage.addListener(
  (
    message: LinkGateOpenMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: { success: boolean }) => void
  ) => {
    const tabId = sender.tab?.id
    const frameId = sender.frameId
    if (message.type === "link-gate:open" && tabId != null && frameId != null) {
      chrome.tabs
        .sendMessage(tabId, message, { frameId })
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }))
      return true
    }
  }
)
