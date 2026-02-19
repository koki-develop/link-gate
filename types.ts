/**
 * Union type representing all messages exchanged via chrome.runtime.sendMessage.
 *
 * - "open-preview": Sent by content.ts to request opening the preview page.
 *     Includes the destination URL, the link's visible text, and whether
 *     the link was opened in a new tab context (middle-click, target="_blank", etc.).
 *
 * - "navigate-tab": Sent by the preview page (tabs/preview.tsx) to request
 *     navigating the original source tab to the confirmed destination URL.
 */
export type Message =
  | { type: "open-preview"; url: string; text: string; newTab: boolean }
  | { type: "navigate-tab"; url: string }

/**
 * Validates that the given string is a well-formed HTTP or HTTPS URL.
 * Used as a security gate to prevent navigation to non-web protocols
 * (e.g., javascript:, data:, file:, chrome:).
 */
export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}
