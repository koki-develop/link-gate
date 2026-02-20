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

export const STORAGE_KEY_ALLOWED_DOMAINS = "allowedDomains"
