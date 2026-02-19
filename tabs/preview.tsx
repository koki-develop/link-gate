/**
 * tabs/preview.tsx — Preview / Confirmation Page
 *
 * This is a full-tab React page opened by the background service worker
 * when the user clicks an external link. It acts as a "gate" that shows
 * the user where they are about to go and lets them either proceed or
 * go back.
 *
 * The page receives its data via URL query parameters:
 *   - url:    The destination URL the user clicked on.
 *   - text:   The visible text of the clicked link (may be empty).
 *   - newTab: "true" if the link was opened in a new-tab context
 *             (middle-click, Cmd/Ctrl+click, target="_blank").
 *
 * Navigation behavior on "Open":
 *   - If the link was opened in a new-tab context (openedInBlank),
 *     this tab simply navigates itself to the destination URL.
 *   - Otherwise, it sends a "navigate-tab" message to the background
 *     script, which navigates the *original* source tab, and then
 *     this preview tab closes itself.
 */
import { useMemo } from "react"

import { isHttpUrl, type Message } from "~types"

import "./preview.css"

/**
 * Discriminated union representing the result of parsing query parameters.
 *
 * - Error case: contains an error message string (e.g., missing or invalid URL).
 * - Success case: contains the validated URL, extracted domain, optional link
 *   text, and whether the link was opened in a new-tab context.
 */
type PreviewParams =
  | { error: string }
  | {
      error: null
      url: string
      domain: string
      linkText: string | null
      openedInBlank: boolean
    }

/**
 * Parses and validates the URL query parameters passed to this page.
 *
 * Performs the following validations:
 *   1. The "url" parameter must be present.
 *   2. The URL must be parseable by the URL constructor.
 *   3. The protocol must be HTTP or HTTPS (blocks javascript:, data:, etc.).
 *
 * Returns a discriminated union: either an error message or the parsed data.
 */
function parseParams(): PreviewParams {
  const params = new URLSearchParams(window.location.search)
  const raw = params.get("url")

  if (!raw) {
    return { error: "No destination URL was provided." }
  }

  if (!isHttpUrl(raw)) {
    return { error: "The destination URL is invalid or uses an unsupported protocol." }
  }

  const parsed = new URL(raw)
  return {
    error: null,
    url: parsed.href,
    domain: parsed.hostname,
    linkText: params.get("text") || null,
    openedInBlank: params.get("newTab") === "true"
  }
}

/**
 * Main component for the preview/confirmation page.
 *
 * Renders one of two views:
 *   - Error view: Displays the error message with a "Close" button.
 *   - Normal view: Shows the destination domain, link text (if available),
 *     full URL, and "Go back" / "Open" action buttons.
 */
function PreviewPage() {
  const params = useMemo(parseParams, [])

  /**
   * Handles the user clicking the "Open" button to confirm navigation.
   *
   * Two navigation paths:
   *   1. If the link was opened in a new-tab context (openedInBlank = true):
   *      Simply navigate this tab directly to the destination URL.
   *      The original tab remains untouched.
   *
   *   2. If the link was opened in the same-tab context (openedInBlank = false):
   *      Send a "navigate-tab" message to the background service worker,
   *      which will navigate the original source tab to the destination.
   *      On success, this preview tab closes itself via window.close().
   *
   * In both cases, if the background message fails, falls back to
   * navigating this tab directly as a safety measure.
   */
  async function handleProceed(url: string, openedInBlank: boolean) {
    if (openedInBlank) {
      window.location.href = url
      return
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: "navigate-tab",
        url
      } satisfies Message)
      if (response?.success) {
        window.close()
      } else {
        console.warn("[LinkGate] navigate-tab failed, response:", response)
        window.location.href = url
      }
    } catch (err) {
      console.error("[LinkGate] Failed to send navigate-tab message:", err)
      window.location.href = url
    }
  }

  // ── Error State ──────────────────────────────────────────────────
  // If query parameter parsing failed, show an error message with
  // a button to close this tab. No navigation is possible.
  // ────────────────────────────────────────────────────────────────
  if (params.error) {
    return (
      <div style={styles.container}>
        <p style={styles.errorText}>{params.error}</p>
        <button onClick={() => window.close()} style={styles.backButton}>
          Close
        </button>
      </div>
    )
  }

  // ── Normal State ─────────────────────────────────────────────────
  // Display the confirmation card with:
  //   - A label explaining the user is about to leave.
  //   - The destination domain (prominently displayed).
  //   - The original link text (if available), shown in italics.
  //   - The full destination URL for transparency.
  //   - "Go back" (closes the tab) and "Open" (proceeds) buttons.
  // ────────────────────────────────────────────────────────────────
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <p style={styles.label}>You are about to visit an external site:</p>
        <p style={styles.domain}>{params.domain}</p>
        {params.linkText && <p style={styles.linkText}>"{params.linkText}"</p>}
        <p style={styles.url}>{params.url}</p>
        <div style={styles.buttonRow}>
          <button onClick={() => window.close()} style={styles.backButton}>
            Go back
          </button>
          <button
            onClick={() => handleProceed(params.url, params.openedInBlank)}
            style={styles.proceedButton}>
            Open
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Inline Styles ─────────────────────────────────────────────────
// Styles are defined as inline React CSSProperties for simplicity,
// keeping the component self-contained without external CSS dependencies
// (preview.css handles only global resets / base styles).
// ────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100dvh",
    backgroundColor: "#f3f4f6",
    fontFamily: "system-ui, sans-serif"
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 40,
    maxWidth: 600,
    width: "100%",
    boxShadow: "0 4px 24px rgba(0,0,0,0.1)"
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
  url: {
    fontSize: 13,
    color: "#6b7280",
    wordBreak: "break-all",
    backgroundColor: "#f9fafb",
    borderRadius: 6,
    padding: "8px 12px",
    margin: "0 0 32px"
  },
  linkText: {
    fontSize: 14,
    color: "#374151",
    fontStyle: "italic",
    margin: "0 0 16px",
    wordBreak: "break-all"
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
  },
  errorText: {
    color: "#ef4444",
    fontSize: 16,
    marginBottom: 16
  }
}

export default PreviewPage
