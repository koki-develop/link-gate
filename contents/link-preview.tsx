import type {
  PlasmoCSConfig,
  PlasmoGetShadowHostId,
  PlasmoGetStyle
} from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"

import { isHttpUrl } from "~types"

import cssText from "data-text:./link-preview.css"

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

type DialogState = {
  url: string
  domain: string
  linkText: string | null
  newTab: boolean
} | null

function LinkPreview() {
  const [dialog, setDialog] = useState<DialogState>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  const open = useCallback((url: string, text: string, newTab: boolean) => {
    if (!isHttpUrl(url)) return
    const domain = new URL(url).hostname
    setDialog({ url, domain, linkText: text || null, newTab })
  }, [])

  const close = useCallback(() => {
    const el = dialogRef.current
    if (!el || !el.open) return
    el.classList.add("closing")
    el.addEventListener(
      "animationend",
      () => {
        el.classList.remove("closing")
        el.close()
        setDialog(null)
      },
      { once: true }
    )
  }, [])

  const proceed = useCallback(() => {
    if (!dialog) return
    if (dialog.newTab) {
      window.open(dialog.url, "_blank", "noopener,noreferrer")
      close()
    } else {
      // Page is navigating away; no animation needed.
      dialogRef.current?.close()
      setDialog(null)
      window.location.href = dialog.url
    }
  }, [dialog, close])

  // Show the modal when dialog state becomes non-null.
  useEffect(() => {
    if (dialog && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal()
    }
  }, [dialog])

  // Receive "link-gate:open" events dispatched by content.ts.
  useEffect(() => {
    const handler = (e: Event) => {
      const { url, text, newTab } = (
        e as CustomEvent<{ url: string; text: string; newTab: boolean }>
      ).detail
      open(url, text, newTab)
    }
    document.addEventListener("link-gate:open", handler)
    return () => document.removeEventListener("link-gate:open", handler)
  }, [open])

  // Intercept the native cancel event (Escape key) to play fade-out animation.
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    const handler = (e: Event) => {
      e.preventDefault()
      close()
    }
    el.addEventListener("cancel", handler)
    return () => el.removeEventListener("cancel", handler)
  }, [close])

  // Disable body scroll while the dialog is open.
  useEffect(() => {
    if (dialog) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [dialog])

  // Close on backdrop click (click directly on the dialog element, not its children).
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === dialogRef.current) close()
    },
    [close]
  )

  return (
    <dialog ref={dialogRef} onClick={handleBackdropClick}>
      {dialog && (
        <div style={styles.card} onClick={(e) => e.stopPropagation()}>
          <p style={styles.label}>You are about to visit an external site:</p>
          <p style={styles.domain}>{dialog.domain}</p>
          {dialog.linkText && (
            <p style={styles.linkText}>"{dialog.linkText}"</p>
          )}
          <p style={styles.url}>{dialog.url}</p>
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
    </dialog>
  )
}

const styles: Record<string, React.CSSProperties> = {
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
    backgroundColor: "#f9fafb",
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
