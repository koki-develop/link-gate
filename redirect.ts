import { normalizeHostname } from "~types"

/**
 * Result of detecting a known redirect URL.
 *
 * Invariants (enforced by `detectRedirect`):
 * - `destinationUrl` is a valid, canonicalized http: or https: URL
 *   (as returned by `new URL(...).href`, which may add a trailing slash,
 *   normalize percent-encoding, etc.).
 * - `destinationDomain` is `normalizeHostname(new URL(destinationUrl).hostname)`.
 */
export type RedirectInfo = {
  destinationUrl: string
  destinationDomain: string
}

function toHttpUrl(s: string): string | null {
  try {
    const u = new URL(s)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    return u.href
  } catch {
    return null
  }
}

/** Matches bare google.* and www.google.* hostnames (used for AMP path extraction). */
function isGoogleHost(hostname: string): boolean {
  return /^(?:www\.)?google\.[a-z]{2,}(?:\.[a-z]{2})?$/.test(hostname)
}

/** Matches google.* hostnames including www. and maps. subdomains (used for /url redirects). */
function isGoogleRedirectHost(hostname: string): boolean {
  return /^(?:www\.|maps\.)?google\.[a-z]{2,}(?:\.[a-z]{2})?$/.test(hostname)
}

function extractGoogleRedirect(parsed: URL): string | null {
  if (!isGoogleRedirectHost(parsed.hostname)) return null
  if (parsed.pathname !== "/url") return null
  const dest = parsed.searchParams.get("q") ?? parsed.searchParams.get("url")
  if (!dest) return null
  return toHttpUrl(dest)
}

function extractFacebookRedirect(parsed: URL): string | null {
  if (
    parsed.hostname !== "l.facebook.com" &&
    parsed.hostname !== "lm.facebook.com"
  )
    return null
  if (parsed.pathname !== "/l.php") return null
  const dest = parsed.searchParams.get("u")
  if (!dest) return null
  return toHttpUrl(dest)
}

function extractYoutubeRedirect(parsed: URL): string | null {
  if (
    parsed.hostname !== "youtube.com" &&
    parsed.hostname !== "www.youtube.com"
  )
    return null
  if (parsed.pathname !== "/redirect") return null
  const dest = parsed.searchParams.get("q")
  if (!dest) return null
  return toHttpUrl(dest)
}

function extractGoogleAmpRedirect(parsed: URL): string | null {
  if (!isGoogleHost(parsed.hostname)) return null
  if (!parsed.pathname.startsWith("/amp/s/")) return null
  const remainder = parsed.pathname.slice("/amp/s/".length)
  if (!remainder) return null
  return toHttpUrl("https://" + remainder + parsed.search + parsed.hash)
}

function extractBingRedirect(parsed: URL): string | null {
  if (parsed.hostname !== "bing.com" && parsed.hostname !== "www.bing.com")
    return null
  if (parsed.pathname !== "/ck/a") return null
  const u = parsed.searchParams.get("u")
  if (!u || !u.startsWith("a1")) return null
  try {
    // Bing encodes destination URLs as "a1" + URL-safe base64(destination).
    // Strip the "a1" prefix, convert URL-safe base64 chars (- and _) back
    // to standard base64 (+ and /), and re-pad to a multiple of 4.
    const raw = u.slice(2)
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/")
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
    const decoded = new TextDecoder().decode(bytes)
    return toHttpUrl(decoded)
  } catch (err) {
    console.warn(
      "[Link Gate] Failed to decode Bing redirect parameter:",
      u,
      err
    )
    return null
  }
}

type RedirectExtractor = (parsed: URL) => string | null

const handlers: RedirectExtractor[] = [
  extractGoogleRedirect,
  extractFacebookRedirect,
  extractYoutubeRedirect,
  extractGoogleAmpRedirect,
  extractBingRedirect
]

export function detectRedirect(url: string): RedirectInfo | null {
  let currentUrl = url
  let lastInfo: RedirectInfo | null = null

  for (;;) {
    let parsed: URL
    try {
      parsed = new URL(currentUrl)
    } catch {
      break
    }

    let destination: string | null = null
    for (const handler of handlers) {
      try {
        destination = handler(parsed)
      } catch {
        continue
      }
      if (destination !== null) break
    }

    if (destination === null) break

    const destinationDomain = normalizeHostname(new URL(destination).hostname)
    lastInfo = { destinationUrl: destination, destinationDomain }
    currentUrl = destination
  }

  return lastInfo
}
