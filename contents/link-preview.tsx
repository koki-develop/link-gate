import type {
  PlasmoCSConfig,
  PlasmoGetShadowHostId,
  PlasmoGetStyle
} from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"

import type { LinkGateOpenMessage } from "~types"
import { isHttpUrl } from "~types"

export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  all_frames: true,
  run_at: "document_idle"
}

export const getShadowHostId: PlasmoGetShadowHostId = () =>
  "link-gate-preview-host"

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

const cssText = `
:host {
  all: initial;
}
`

type DialogData = {
  url: string
  domain: string
  linkText: string | null
  newTab: boolean
}

function LinkPreview() {
  const [dialogData, setDialogData] = useState<DialogData | null>(null)
  const [visible, setVisible] = useState(false)

  const open = useCallback((url: string, text: string, newTab: boolean) => {
    if (!isHttpUrl(url)) return
    const domain = new URL(url).hostname
    setDialogData({ url, domain, linkText: text || null, newTab })
    setVisible(true)
  }, [])

  const close = useCallback(() => {
    setVisible(false)
  }, [])

  const proceed = useCallback(() => {
    if (!dialogData) return
    if (dialogData.newTab) {
      window.open(dialogData.url, "_blank", "noopener,noreferrer")
      close()
    } else {
      close()
      window.location.href = dialogData.url
    }
  }, [dialogData, close])

  // Receive messages relayed by the background service worker.
  useEffect(() => {
    const handler = (message: LinkGateOpenMessage) => {
      if (message.type !== "link-gate:open") return
      open(message.url, message.text, message.newTab)
    }
    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [open])

  // Close on Escape key.
  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [visible, close])

  // Disable body scroll while visible.
  const savedOverflow = useRef("")
  useEffect(() => {
    if (visible) {
      savedOverflow.current = document.body.style.overflow
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = savedOverflow.current
    }
    return () => {
      document.body.style.overflow = savedOverflow.current
    }
  }, [visible])

  return (
    <div
      style={{
        ...styles.overlay,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none"
      }}
      onClick={close}>
      {dialogData && (
        <div style={styles.card} onClick={(e) => e.stopPropagation()}>
          <p style={styles.label}>You are about to visit an external site:</p>
          <p style={styles.domain}>{dialogData.domain}</p>
          {dialogData.linkText && (
            <p style={styles.linkText}>"{dialogData.linkText}"</p>
          )}
          <p style={styles.url}>{dialogData.url}</p>
          <div style={styles.buttonRow}>
            <button onClick={close} style={styles.backButton}>
              Go back
            </button>
            <button onClick={proceed} style={styles.proceedButton}>
              Open
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 2147483647,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    fontFamily: "system-ui, sans-serif",
    transition: "opacity 150ms ease"
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 40,
    maxWidth: 600,
    width: "100%",
    boxShadow: "0 4px 24px rgba(0,0,0,0.1)",
    margin: "0 16px"
  },
  label: {
    fontSize: 16,
    color: "#6b7280",
    margin: 0,
    marginBottom: 8
  },
  domain: {
    fontSize: 28,
    fontWeight: 700,
    color: "#111827",
    margin: "12px 0"
  },
  linkText: {
    fontSize: 14,
    color: "#374151",
    fontStyle: "italic",
    margin: "0 0 16px",
    wordBreak: "break-all"
  },
  url: {
    fontSize: 13,
    color: "#6b7280",
    wordBreak: "break-all",
    backgroundColor: "#f4f6f7",
    borderRadius: 6,
    padding: "8px 12px",
    margin: "0 0 32px"
  },
  buttonRow: {
    display: "flex",
    gap: 12,
    justifyContent: "flex-end"
  },
  backButton: {
    padding: "10px 24px",
    fontSize: 15,
    borderRadius: 8,
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    color: "#374151",
    cursor: "pointer"
  },
  proceedButton: {
    padding: "10px 24px",
    fontSize: 15,
    borderRadius: 8,
    border: "none",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 600
  }
}

export default LinkPreview
