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

export type LinkGateOpenMessage = {
  type: "link-gate:open"
  url: string
  text: string
  newTab: boolean
}

export const STORAGE_KEY_ALLOWED_DOMAINS = "allowedDomains"
