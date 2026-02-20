import cssText from "data-text:./link-preview.css"

import { normalizeHostname, STORAGE_KEY_ALLOWED_DOMAINS } from "~types"

type DialogState = {
  host: HTMLDivElement
  overlay: HTMLDivElement
  checkboxEl: HTMLInputElement
  url: string
  domain: string
  target: string
  savedOverflow: string
  escapeHandler: (e: KeyboardEvent) => void
  transitionEndHandler: (() => void) | null
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

function showPopupBlockedMessage(state: DialogState): void {
  const card = state.overlay.querySelector(".card")
  if (!card || card.querySelector(".popupBlocked")) return
  const msg = document.createElement("p")
  msg.className = "popupBlocked"
  msg.textContent =
    "Pop-up was blocked by your browser. Please allow pop-ups for this site and try again."
  const buttonRow = card.querySelector(".buttonRow")
  if (buttonRow) {
    card.insertBefore(msg, buttonRow)
  } else {
    card.appendChild(msg)
  }
}

async function proceedNavigation(state: DialogState): Promise<void> {
  if (activeDialog !== state) return
  const { url, domain, target, checkboxEl } = state

  if (checkboxEl.checked) {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY_ALLOWED_DOMAINS)
      const stored = result[STORAGE_KEY_ALLOWED_DOMAINS]
      const domains: string[] = Array.isArray(stored) ? stored : []
      if (!domains.includes(domain)) {
        domains.push(domain)
      }
      await chrome.storage.local.set({
        [STORAGE_KEY_ALLOWED_DOMAINS]: domains
      })
    } catch (err) {
      console.warn("[Link Gate] Failed to save allowed domain:", domain, err)
    }
  }

  if (target === "_blank") {
    const w = window.open(url, "_blank", "noopener,noreferrer")
    if (!w) {
      console.warn("[Link Gate] Popup blocked for:", url)
      showPopupBlockedMessage(state)
      return
    }
    closeDialog()
  } else if (target === "_self" || target === "") {
    closeDialog()
    window.location.href = url
  } else {
    const w = window.open(url, target)
    if (!w) {
      console.warn("[Link Gate] Popup blocked for:", url)
      showPopupBlockedMessage(state)
      return
    }
    closeDialog()
  }
}

export function showDialog(url: string, text: string, target: string): void {
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

  const domain = normalizeHostname(parsed.hostname)

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
  label.textContent = "You are about to visit an external site:"
  card.appendChild(label)

  const domainEl = document.createElement("p")
  domainEl.className = "domain"
  domainEl.textContent = domain
  card.appendChild(domainEl)

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
  checkboxDomainEl.textContent = domain
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
    domain,
    target,
    savedOverflow,
    escapeHandler,
    transitionEndHandler: null
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
