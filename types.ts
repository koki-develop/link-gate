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

/**
 * Normalizes a hostname by lowercasing and stripping trailing dots.
 * DNS allows a trailing dot to denote a fully-qualified domain name
 * (e.g., "example.com."), but for comparison purposes we always
 * strip it so that "example.com." and "example.com" are treated identically.
 */
export function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase()
  return lower.endsWith(".") ? lower.slice(0, -1) : lower
}

export type LinkGateOpenMessage = {
  type: "link-gate:open"
  url: string
  text: string
  newTab: boolean
}

export const STORAGE_KEY_ALLOWED_DOMAINS = "allowedDomains"
