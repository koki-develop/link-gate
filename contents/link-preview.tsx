import styleText from "data-text:./link-preview.module.css"
import type {
  PlasmoCSConfig,
  PlasmoGetShadowHostId,
  PlasmoGetStyle
} from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"

import type { LinkGateOpenMessage } from "~types"
import { isHttpUrl, normalizeHostname, STORAGE_KEY_ALLOWED_DOMAINS } from "~types"

import * as s from "./link-preview.module.css"

export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  all_frames: true,
  run_at: "document_idle"
}

export const getShadowHostId: PlasmoGetShadowHostId = () =>
  "link-gate-preview-host"

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = styleText
  return style
}

type DialogData = {
  url: string
  domain: string
  linkText: string | null
  target: string
}

function LinkPreview() {
  const [dialogData, setDialogData] = useState<DialogData | null>(null)
  const [visible, setVisible] = useState(false)
  const [skipPreview, setSkipPreview] = useState(false)

  const open = useCallback((url: string, text: string, target: string) => {
    if (!isHttpUrl(url)) return
    const domain = normalizeHostname(new URL(url).hostname)
    setDialogData({ url, domain, linkText: text || null, target })
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

    if (dialogData.target === "_blank") {
      window.open(dialogData.url, "_blank", "noopener,noreferrer")
      close()
    } else if (dialogData.target === "_self" || dialogData.target === "") {
      close()
      window.location.href = dialogData.url
    } else {
      close()
      window.open(dialogData.url, dialogData.target)
    }
  }, [dialogData, skipPreview, close])

  // Receive messages relayed by the background service worker.
  useEffect(() => {
    const handler = (message: LinkGateOpenMessage) => {
      if (message.type !== "link-gate:open") return
      open(message.url, message.text, message.target)
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
      className={`${s.overlay} ${visible ? s.overlayVisible : ""}`}
      onClick={close}>
      {dialogData && (
        <div className={s.card} onClick={(e) => e.stopPropagation()}>
          <p className={s.label}>You are about to visit an external site:</p>
          <p className={s.domain}>{dialogData.domain}</p>
          {dialogData.linkText && (
            <p className={s.linkText}>"{dialogData.linkText}"</p>
          )}
          <p className={s.url}>{dialogData.url}</p>
          <label className={s.checkboxRow}>
            <input
              type="checkbox"
              checked={skipPreview}
              onChange={(e) => setSkipPreview(e.target.checked)}
              className={s.checkbox}
            />
            <span className={s.checkboxLabel}>
              Always allow links to{" "}
              <span className={s.checkboxDomain}>{dialogData.domain}</span>
            </span>
          </label>
          <div className={s.buttonRow}>
            <button onClick={close} className={s.backButton}>
              Go back
            </button>
            <button onClick={proceed} className={s.proceedButton}>
              Open
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default LinkPreview
