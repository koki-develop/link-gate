import type {
  PlasmoCSConfig,
  PlasmoGetShadowHostId,
  PlasmoGetStyle
} from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"

import type { LinkGateOpenMessage } from "~types"
import { isHttpUrl, STORAGE_KEY_ALLOWED_DOMAINS } from "~types"

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

.link-gate-back-button {
  padding: 10px 24px;
  font-size: 15px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background-color: #ffffff;
  color: #374151;
  cursor: pointer;
}

.link-gate-back-button:hover {
  background-color: #f3f4f6;
}

.link-gate-proceed-button {
  padding: 10px 24px;
  font-size: 15px;
  border-radius: 8px;
  border: none;
  background-color: #2563eb;
  color: #ffffff;
  cursor: pointer;
  font-weight: 600;
}

.link-gate-proceed-button:hover {
  background-color: #1d4ed8;
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
  const [skipPreview, setSkipPreview] = useState(false)

  const open = useCallback((url: string, text: string, newTab: boolean) => {
    if (!isHttpUrl(url)) return
    const domain = new URL(url).hostname
    setDialogData({ url, domain, linkText: text || null, newTab })
    setSkipPreview(false)
    setVisible(true)
  }, [])

  const close = useCallback(() => {
    setVisible(false)
  }, [])

  const proceed = useCallback(async () => {
    if (!dialogData) return

    if (skipPreview) {
      try {
        const result = await chrome.storage.local.get(
          STORAGE_KEY_ALLOWED_DOMAINS
        )
        const stored = result[STORAGE_KEY_ALLOWED_DOMAINS]
        const domains: string[] = Array.isArray(stored) ? stored : []
        if (!domains.includes(dialogData.domain)) {
          domains.push(dialogData.domain)
        }
        await chrome.storage.local.set({
          [STORAGE_KEY_ALLOWED_DOMAINS]: domains
        })
      } catch (err) {
        console.warn(
          "[Link Gate] Failed to save allowed domain:",
          dialogData.domain,
          err
        )
      }
    }

    if (dialogData.newTab) {
      window.open(dialogData.url, "_blank", "noopener,noreferrer")
      close()
    } else {
      close()
      window.location.href = dialogData.url
    }
  }, [dialogData, skipPreview, close])

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
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={skipPreview}
              onChange={(e) => setSkipPreview(e.target.checked)}
              style={styles.checkbox}
            />
            <span style={styles.checkboxLabel}>
              Always allow links to{" "}
              <span style={styles.checkboxDomain}>{dialogData.domain}</span>
            </span>
          </label>
          <div style={styles.buttonRow}>
            <button onClick={close} className="link-gate-back-button">
              Go back
            </button>
            <button onClick={proceed} className="link-gate-proceed-button">
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
    margin: "0 0 16px"
  },
  checkboxRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    margin: "0 0 24px"
  },
  checkbox: {
    width: 16,
    height: 16,
    margin: 0,
    cursor: "pointer",
    accentColor: "#2563eb",
    colorScheme: "light"
  },
  checkboxLabel: {
    fontSize: 14,
    color: "#374151",
    userSelect: "none"
  },
  checkboxDomain: {
    fontWeight: 600,
    color: "#111827"
  },
  buttonRow: {
    display: "flex",
    gap: 12,
    justifyContent: "flex-end"
  }
}

export default LinkPreview
