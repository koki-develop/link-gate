import { describe, expect, it } from "vitest"

import { detectRedirect } from "./redirect"

describe("detectRedirect", () => {
  // ─── Google redirect (/url) ───

  describe("Google redirect", () => {
    it("detects redirect via ?q parameter", () => {
      const result = detectRedirect(
        "https://www.google.com/url?q=https://example.com/page&sa=t"
      )
      expect(result).toEqual({
        destinationUrl: "https://example.com/page",
        destinationDomain: "example.com"
      })
    })

    it("detects redirect via ?url parameter", () => {
      const result = detectRedirect(
        "https://www.google.com/url?url=https://example.com/page"
      )
      expect(result).toEqual({
        destinationUrl: "https://example.com/page",
        destinationDomain: "example.com"
      })
    })

    it("prefers ?q over ?url when both present", () => {
      const result = detectRedirect(
        "https://www.google.com/url?q=https://a.com&url=https://b.com"
      )
      expect(result).toEqual({
        destinationUrl: "https://a.com/",
        destinationDomain: "a.com"
      })
    })

    it("works with google.co.jp", () => {
      const result = detectRedirect(
        "https://www.google.co.jp/url?q=https://example.com"
      )
      expect(result).toEqual({
        destinationUrl: "https://example.com/",
        destinationDomain: "example.com"
      })
    })

    it("works without www prefix", () => {
      const result = detectRedirect(
        "https://google.com/url?q=https://example.com"
      )
      expect(result).toEqual({
        destinationUrl: "https://example.com/",
        destinationDomain: "example.com"
      })
    })

    it("works with maps.google.com", () => {
      const result = detectRedirect(
        "https://maps.google.com/url?q=https://example.com"
      )
      expect(result).toEqual({
        destinationUrl: "https://example.com/",
        destinationDomain: "example.com"
      })
    })

    it("returns null for non-/url pathname", () => {
      const result = detectRedirect(
        "https://www.google.com/search?q=https://example.com"
      )
      expect(result).toBeNull()
    })

    it("returns null when q param is missing", () => {
      const result = detectRedirect("https://www.google.com/url?sa=t")
      expect(result).toBeNull()
    })

    it("returns null when destination is not http(s)", () => {
      const result = detectRedirect(
        "https://www.google.com/url?q=ftp://example.com"
      )
      expect(result).toBeNull()
    })

    it("returns null for non-Google hostname", () => {
      const result = detectRedirect(
        "https://not-google.com/url?q=https://example.com"
      )
      expect(result).toBeNull()
    })
  })

  // ─── Facebook redirect ───

  describe("Facebook redirect", () => {
    it("detects redirect from l.facebook.com", () => {
      const result = detectRedirect(
        "https://l.facebook.com/l.php?u=https://example.com/page"
      )
      expect(result).toEqual({
        destinationUrl: "https://example.com/page",
        destinationDomain: "example.com"
      })
    })

    it("detects redirect from lm.facebook.com", () => {
      const result = detectRedirect(
        "https://lm.facebook.com/l.php?u=https://example.com/page"
      )
      expect(result).toEqual({
        destinationUrl: "https://example.com/page",
        destinationDomain: "example.com"
      })
    })

    it("returns null for non-/l.php pathname", () => {
      const result = detectRedirect(
        "https://l.facebook.com/other?u=https://example.com"
      )
      expect(result).toBeNull()
    })

    it("returns null when u param is missing", () => {
      const result = detectRedirect("https://l.facebook.com/l.php?h=abc")
      expect(result).toBeNull()
    })

    it("returns null for wrong facebook subdomain", () => {
      const result = detectRedirect(
        "https://www.facebook.com/l.php?u=https://example.com"
      )
      expect(result).toBeNull()
    })

    it("returns null when destination is not http(s)", () => {
      const result = detectRedirect(
        "https://l.facebook.com/l.php?u=ftp://example.com"
      )
      expect(result).toBeNull()
    })
  })

  // ─── YouTube redirect ───

  describe("YouTube redirect", () => {
    it("detects redirect from www.youtube.com", () => {
      const result = detectRedirect(
        "https://www.youtube.com/redirect?q=https://example.com/page"
      )
      expect(result).toEqual({
        destinationUrl: "https://example.com/page",
        destinationDomain: "example.com"
      })
    })

    it("detects redirect from youtube.com without www", () => {
      const result = detectRedirect(
        "https://youtube.com/redirect?q=https://example.com"
      )
      expect(result).toEqual({
        destinationUrl: "https://example.com/",
        destinationDomain: "example.com"
      })
    })

    it("returns null for non-/redirect pathname", () => {
      const result = detectRedirect(
        "https://www.youtube.com/watch?q=https://example.com"
      )
      expect(result).toBeNull()
    })

    it("returns null when q param is missing", () => {
      const result = detectRedirect("https://www.youtube.com/redirect?v=abc123")
      expect(result).toBeNull()
    })

    it("returns null when destination is not http(s)", () => {
      const result = detectRedirect(
        "https://www.youtube.com/redirect?q=ftp://example.com"
      )
      expect(result).toBeNull()
    })
  })

  // ─── Google AMP redirect ───

  describe("Google AMP redirect", () => {
    it("detects AMP redirect", () => {
      const result = detectRedirect(
        "https://www.google.com/amp/s/www.example.com/article"
      )
      expect(result).toEqual({
        destinationUrl: "https://www.example.com/article",
        destinationDomain: "www.example.com"
      })
    })

    it("detects AMP redirect without www on Google", () => {
      const result = detectRedirect(
        "https://google.com/amp/s/www.example.com/article"
      )
      expect(result).toEqual({
        destinationUrl: "https://www.example.com/article",
        destinationDomain: "www.example.com"
      })
    })

    it("preserves query string and hash from AMP URL", () => {
      const result = detectRedirect(
        "https://www.google.com/amp/s/example.com/page?foo=bar#section"
      )
      expect(result).toEqual({
        destinationUrl: "https://example.com/page?foo=bar#section",
        destinationDomain: "example.com"
      })
    })

    it("works with google.co.uk", () => {
      const result = detectRedirect(
        "https://www.google.co.uk/amp/s/example.com/article"
      )
      expect(result).toEqual({
        destinationUrl: "https://example.com/article",
        destinationDomain: "example.com"
      })
    })

    it("returns null for /amp/ without /s/ suffix", () => {
      const result = detectRedirect(
        "https://www.google.com/amp/example.com/article"
      )
      expect(result).toBeNull()
    })

    it("returns null when remainder after /amp/s/ is empty", () => {
      const result = detectRedirect("https://www.google.com/amp/s/")
      expect(result).toBeNull()
    })

    it("returns null for non-Google hostname", () => {
      const result = detectRedirect(
        "https://not-google.com/amp/s/example.com/article"
      )
      expect(result).toBeNull()
    })
  })

  // ─── Bing redirect ───

  describe("Bing redirect", () => {
    it("detects Bing redirect from www.bing.com", () => {
      const encoded = "a1" + btoa("https://example.com/page")
      const result = detectRedirect(
        `https://www.bing.com/ck/a?u=${encodeURIComponent(encoded)}`
      )
      expect(result).toEqual({
        destinationUrl: "https://example.com/page",
        destinationDomain: "example.com"
      })
    })

    it("detects Bing redirect from bing.com without www", () => {
      const encoded = "a1" + btoa("https://example.com")
      const result = detectRedirect(
        `https://bing.com/ck/a?u=${encodeURIComponent(encoded)}`
      )
      expect(result).toEqual({
        destinationUrl: "https://example.com/",
        destinationDomain: "example.com"
      })
    })

    it("handles URL-safe base64 encoding (- and _)", () => {
      const url = "https://example.com/path?a=1&b=2"
      const standardB64 = btoa(url)
      const urlSafe = standardB64
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")
      const encoded = "a1" + urlSafe
      const result = detectRedirect(
        `https://www.bing.com/ck/a?u=${encodeURIComponent(encoded)}`
      )
      expect(result).toEqual({
        destinationUrl: url,
        destinationDomain: "example.com"
      })
    })

    it("returns null for non-/ck/a pathname", () => {
      const encoded = "a1" + btoa("https://example.com")
      const result = detectRedirect(
        `https://www.bing.com/search?u=${encodeURIComponent(encoded)}`
      )
      expect(result).toBeNull()
    })

    it("returns null when u param is missing", () => {
      const result = detectRedirect("https://www.bing.com/ck/a?q=test")
      expect(result).toBeNull()
    })

    it("returns null when u param does not start with a1", () => {
      const encoded = "b2" + btoa("https://example.com")
      const result = detectRedirect(
        `https://www.bing.com/ck/a?u=${encodeURIComponent(encoded)}`
      )
      expect(result).toBeNull()
    })

    it("returns null when decoded URL is not http(s)", () => {
      const encoded = "a1" + btoa("ftp://example.com")
      const result = detectRedirect(
        `https://www.bing.com/ck/a?u=${encodeURIComponent(encoded)}`
      )
      expect(result).toBeNull()
    })

    it("returns null for non-Bing hostname", () => {
      const encoded = "a1" + btoa("https://example.com")
      const result = detectRedirect(
        `https://not-bing.com/ck/a?u=${encodeURIComponent(encoded)}`
      )
      expect(result).toBeNull()
    })

    it("returns null for invalid base64", () => {
      const result = detectRedirect(
        "https://www.bing.com/ck/a?u=a1!!!invalid!!!"
      )
      expect(result).toBeNull()
    })
  })

  // ─── General / edge cases ───

  describe("general behavior", () => {
    it("returns null for a regular URL with no redirect", () => {
      const result = detectRedirect("https://example.com")
      expect(result).toBeNull()
    })

    it("returns null for an invalid URL", () => {
      const result = detectRedirect("not a url")
      expect(result).toBeNull()
    })

    it("returns null for an empty string", () => {
      const result = detectRedirect("")
      expect(result).toBeNull()
    })

    it("normalizes destination domain (strips trailing dot)", () => {
      const result = detectRedirect(
        "https://www.google.com/url?q=https://example.com."
      )
      expect(result).not.toBeNull()
      expect(result!.destinationDomain).toBe("example.com")
    })

    it("handles http destination URLs", () => {
      const result = detectRedirect(
        "https://www.google.com/url?q=http://example.com/page"
      )
      expect(result).toEqual({
        destinationUrl: "http://example.com/page",
        destinationDomain: "example.com"
      })
    })

    it("returns first matching handler result", () => {
      // Google handler matches first
      const result = detectRedirect(
        "https://www.google.com/url?q=https://example.com"
      )
      expect(result).not.toBeNull()
    })
  })
})
