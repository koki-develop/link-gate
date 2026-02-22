import cssText from "data-text:./link-preview.css"

import type { RedirectInfo } from "~redirect"
import { normalizeHostname, STORAGE_KEY_ALLOWED_DOMAINS } from "~types"

type DialogState = {
  host: HTMLDivElement
  overlay: HTMLDivElement
  checkboxEl: HTMLInputElement
  url: string
  target: string
  savedOverflow: string
  escapeHandler: (e: KeyboardEvent) => void
  transitionEndHandler: (() => void) | null
  effectiveDomain: string
}

let activeDialog: DialogState | null = null

function removeHost(state: DialogState): void {
  if (state.transitionEndHandler) {
    state.overlay.removeEventListener(
      "transitionend",
      state.transitionEndHandler
    )
    state.transitionEndHandler = null
  }
  state.host.remove()
}

function closeDialog(): void {
  if (!activeDialog) return
  const state = activeDialog
  activeDialog = null

  document.body.style.overflow = state.savedOverflow
  document.removeEventListener("keydown", state.escapeHandler)

  state.overlay.classList.remove("overlayVisible")

  const cleanup = () => {
    clearTimeout(fallbackTimer)
    removeHost(state)
  }
  state.transitionEndHandler = cleanup
  state.overlay.addEventListener("transitionend", cleanup, { once: true })

  const fallbackTimer = setTimeout(cleanup, 300)
}

async function proceedNavigation(state: DialogState): Promise<void> {
  if (activeDialog !== state) return
  const { url, target, checkboxEl, effectiveDomain } = state

  if (checkboxEl.checked) {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY_ALLOWED_DOMAINS)
      const stored = result[STORAGE_KEY_ALLOWED_DOMAINS]
      const domains: string[] = Array.isArray(stored) ? stored : []
      if (!domains.includes(effectiveDomain)) {
        domains.push(effectiveDomain)
      }
      await chrome.storage.local.set({
        [STORAGE_KEY_ALLOWED_DOMAINS]: domains
      })
    } catch (err) {
      console.error(
        "[Link Gate] Failed to save allowed domain:",
        effectiveDomain,
        err
      )
    }
  }

  // Navigation intentionally uses the original redirect URL (state.url), not the resolved
  // destination URL. The intermediary may carry auth tokens, session IDs, or consent
  // parameters required by the destination. The dialog displays this original redirect URL
  // so users can see the full URL the browser will actually navigate to, including the
  // intermediary.
  if (target === "_blank") {
    window.open(url, "_blank", "noopener,noreferrer")
    closeDialog()
  } else if (target === "_self" || target === "") {
    closeDialog()
    window.location.href = url
  } else {
    window.open(url, target)
    closeDialog()
  }
}

export function showDialog(
  url: string,
  text: string,
  target: string,
  redirectInfo: RedirectInfo | null
): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch (err) {
    console.warn("[Link Gate] Failed to parse URL for dialog:", url, err)
    throw err
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`[Link Gate] Non-HTTP protocol: ${parsed.protocol}`)
  }

  if (activeDialog) {
    const prev = activeDialog
    activeDialog = null
    document.body.style.overflow = prev.savedOverflow
    document.removeEventListener("keydown", prev.escapeHandler)
    removeHost(prev)
  }

  const originalDomain = normalizeHostname(parsed.hostname)
  const effectiveDomain = redirectInfo?.destinationDomain ?? originalDomain

  const host = document.createElement("div")
  host.id = "link-gate-preview-host"
  const shadow = host.attachShadow({ mode: "open" })

  const styleEl = document.createElement("style")
  styleEl.textContent = cssText
  shadow.appendChild(styleEl)

  const overlay = document.createElement("div")
  overlay.className = "overlay"

  const card = document.createElement("div")
  card.className = "card"
  card.addEventListener("click", (e) => e.stopPropagation())

  const label = document.createElement("p")
  label.className = "label"
  label.textContent = redirectInfo
    ? "You are about to visit an external site via a redirect:"
    : "You are about to visit an external site:"
  card.appendChild(label)

  const domainEl = document.createElement("p")
  domainEl.className = "domain"
  domainEl.textContent = effectiveDomain
  card.appendChild(domainEl)

  if (redirectInfo) {
    const redirectViaEl = document.createElement("div")
    redirectViaEl.className = "redirectVia"

    const redirectViaLabelEl = document.createElement("span")
    redirectViaLabelEl.className = "redirectViaLabel"
    redirectViaLabelEl.textContent = "Redirected from "
    redirectViaEl.appendChild(redirectViaLabelEl)

    const redirectOrigDomainEl = document.createElement("span")
    redirectOrigDomainEl.className = "redirectOrigDomain"
    redirectOrigDomainEl.textContent = originalDomain
    redirectViaEl.appendChild(redirectOrigDomainEl)

    card.appendChild(redirectViaEl)
  }

  const trimmedText = text.trim()
  if (trimmedText) {
    const linkTextEl = document.createElement("p")
    linkTextEl.className = "linkText"
    linkTextEl.textContent = `\u201C${trimmedText}\u201D`
    card.appendChild(linkTextEl)
  }

  const urlEl = document.createElement("p")
  urlEl.className = "url"
  urlEl.textContent = url
  card.appendChild(urlEl)

  const checkboxRowEl = document.createElement("label")
  checkboxRowEl.className = "checkboxRow"

  const checkboxEl = document.createElement("input")
  checkboxEl.type = "checkbox"
  checkboxEl.className = "checkbox"
  checkboxRowEl.appendChild(checkboxEl)

  const checkboxLabelEl = document.createElement("span")
  checkboxLabelEl.className = "checkboxLabel"
  checkboxLabelEl.textContent = "Always allow links to "

  const checkboxDomainEl = document.createElement("span")
  checkboxDomainEl.className = "checkboxDomain"
  checkboxDomainEl.textContent = effectiveDomain
  checkboxLabelEl.appendChild(checkboxDomainEl)
  checkboxRowEl.appendChild(checkboxLabelEl)
  card.appendChild(checkboxRowEl)

  const buttonRow = document.createElement("div")
  buttonRow.className = "buttonRow"

  const backButton = document.createElement("button")
  backButton.className = "backButton"
  backButton.textContent = "Go back"
  backButton.addEventListener("click", closeDialog)
  buttonRow.appendChild(backButton)

  const proceedButton = document.createElement("button")
  proceedButton.className = "proceedButton"
  proceedButton.textContent = "Open"
  buttonRow.appendChild(proceedButton)

  card.appendChild(buttonRow)
  overlay.appendChild(card)
  shadow.appendChild(overlay)

  const savedOverflow = document.body.style.overflow
  document.body.style.overflow = "hidden"

  const escapeHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeDialog()
  }
  document.addEventListener("keydown", escapeHandler)

  overlay.addEventListener("click", closeDialog)

  const state: DialogState = {
    host,
    overlay,
    checkboxEl,
    url,
    target,
    savedOverflow,
    escapeHandler,
    transitionEndHandler: null,
    effectiveDomain
  }

  proceedButton.addEventListener("click", () => {
    proceedNavigation(state).catch((err) => {
      console.error(
        "[Link Gate] Failed to proceed with navigation:",
        state.url,
        err
      )
      closeDialog()
      if (state.target === "_blank") {
        window.open(state.url, "_blank", "noopener,noreferrer")
      } else if (state.target === "_self" || state.target === "") {
        window.location.href = state.url
      } else {
        window.open(state.url, state.target)
      }
    })
  })

  activeDialog = state

  document.documentElement.appendChild(host)

  requestAnimationFrame(() => {
    overlay.classList.add("overlayVisible")
  })
}
