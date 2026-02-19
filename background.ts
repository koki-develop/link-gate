import type { LinkGateOpenMessage } from "~types"

chrome.runtime.onMessage.addListener((message: LinkGateOpenMessage, sender) => {
  const tabId = sender.tab?.id
  const frameId = sender.frameId
  if (message.type === "link-gate:open" && tabId != null && frameId != null) {
    chrome.tabs.sendMessage(tabId, message, { frameId }).catch(() => {})
  }
})
