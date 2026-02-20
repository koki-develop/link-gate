/**
 * popup.tsx — Extension Popup
 *
 * Plasmo popup page for managing the per-domain allow list.
 * Reads and writes allowed domains to chrome.storage.local under
 * the STORAGE_KEY_ALLOWED_DOMAINS key. Stays in sync with external
 * changes (e.g., the preview dialog's "Always allow" checkbox) via
 * chrome.storage.onChanged.
 */
import { useEffect, useRef, useState } from "react"

import { normalizeHostname, STORAGE_KEY_ALLOWED_DOMAINS } from "~types"

import s from "./popup.module.css"

/**
 * Extracts a normalized hostname from user input.
 *
 * Accepts either a bare domain (e.g., "example.com") or a full URL
 * (e.g., "https://example.com/path"). Input is lowercased and trimmed.
 *
 * Returns a result object indicating success or one of three failure reasons:
 *   - "empty": Input was empty or whitespace-only.
 *   - "non-http": URL uses a non-HTTP(S) protocol (e.g., ftp:, file:).
 *   - "invalid": Input could not be parsed as a valid URL.
 */
type NormalizeResult =
  | { ok: true; domain: string }
  | { ok: false; reason: "empty" | "non-http" | "invalid" }

type NormalizeFailureReason = Extract<NormalizeResult, { ok: false }>["reason"]

function normalizeDomain(input: string): NormalizeResult {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return { ok: false, reason: "empty" }
  try {
    let hostname: string
    if (trimmed.includes("://")) {
      const url = new URL(trimmed)
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { ok: false, reason: "non-http" }
      }
      hostname = normalizeHostname(url.hostname)
    } else {
      hostname = normalizeHostname(new URL(`https://${trimmed}`).hostname)
    }
    if (!hostname || hostname === ".") {
      return { ok: false, reason: "invalid" }
    }
    return { ok: true, domain: hostname }
  } catch {
    return { ok: false, reason: "invalid" }
  }
}

function normalizeErrorMessage(reason: NormalizeFailureReason): string {
  switch (reason) {
    case "empty":
      return "Please enter a domain or URL"
    case "non-http":
      return "Only HTTP and HTTPS domains are supported"
    case "invalid":
      return "Please enter a valid domain or URL"
  }
}

function IndexPopup() {
  const [domains, setDomains] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [addInput, setAddInput] = useState("")
  const [addError, setAddError] = useState("")
  const [editingDomain, setEditingDomain] = useState<string | null>(null)
  const [editInput, setEditInput] = useState("")
  const [editError, setEditError] = useState("")
  const [storageError, setStorageError] = useState("")
  const [saving, setSaving] = useState(false)

  const addInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    chrome.storage.local
      .get(STORAGE_KEY_ALLOWED_DOMAINS)
      .then((result) => {
        const stored = result[STORAGE_KEY_ALLOWED_DOMAINS]
        if (Array.isArray(stored)) {
          setDomains([...stored].sort())
        }
      })
      .catch((err) => {
        console.error("[Link Gate] Failed to load allowed domains:", err)
        setStorageError(
          "Failed to load allowed domains. Please close and reopen the popup."
        )
      })
      .finally(() => {
        setLoaded(true)
      })
  }, [])

  // Keep the domain list in sync with changes made by other contexts
  // (e.g., the preview dialog's "Always allow" checkbox or other tabs).
  useEffect(() => {
    const handler = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== "local") return
      const change = changes[STORAGE_KEY_ALLOWED_DOMAINS]
      if (!change) return
      const newValue = change.newValue
      setDomains(Array.isArray(newValue) ? [...newValue].sort() : [])
    }
    chrome.storage.onChanged.addListener(handler)
    return () => chrome.storage.onChanged.removeListener(handler)
  }, [])

  // Defer focus until after React has flushed the DOM update
  // so the edit input element is mounted and referenceable.
  useEffect(() => {
    if (editingDomain !== null) {
      setTimeout(() => {
        editInputRef.current?.focus()
        editInputRef.current?.select()
      }, 0)
    }
  }, [editingDomain])

  const saveDomains = async (updated: string[]): Promise<boolean> => {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY_ALLOWED_DOMAINS]: updated
      })
      return true
    } catch (err) {
      console.error("[Link Gate] Failed to save domains:", err)
      return false
    }
  }

  const loadDomains = async (): Promise<string[]> => {
    const result = await chrome.storage.local.get(STORAGE_KEY_ALLOWED_DOMAINS)
    const stored = result[STORAGE_KEY_ALLOWED_DOMAINS]
    return Array.isArray(stored) ? stored : []
  }

  const handleAdd = async () => {
    if (saving) return
    setAddError("")
    setStorageError("")
    const result = normalizeDomain(addInput)
    if (result.ok === false) {
      setAddError(normalizeErrorMessage(result.reason))
      return
    }
    if (domains.includes(result.domain)) {
      setAddError(`"${result.domain}" is already in the list`)
      return
    }
    setSaving(true)
    try {
      const current = await loadDomains()
      if (current.includes(result.domain)) {
        setAddError(`"${result.domain}" is already in the list`)
        return
      }
      const saved = await saveDomains([...current, result.domain])
      if (!saved) {
        setAddError("Failed to save. Please try again.")
        return
      }
      setAddInput("")
      addInputRef.current?.focus()
    } catch (err) {
      console.error("[Link Gate] Failed to load allowed domains:", err)
      setStorageError("Failed to load allowed domains. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (domain: string) => {
    if (saving) return
    setStorageError("")
    setSaving(true)
    try {
      const current = await loadDomains()
      const saved = await saveDomains(current.filter((d) => d !== domain))
      if (!saved) {
        setStorageError("Failed to remove domain. Please try again.")
      }
    } catch (err) {
      console.error("[Link Gate] Failed to load allowed domains:", err)
      setStorageError("Failed to load allowed domains. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleEditStart = (domain: string) => {
    setEditingDomain(domain)
    setEditInput(domain)
    setEditError("")
    setStorageError("")
  }

  const handleEditCancel = () => {
    setEditingDomain(null)
    setEditError("")
  }

  const handleEditSave = async () => {
    if (editingDomain === null || saving) return
    setEditError("")
    setStorageError("")
    const result = normalizeDomain(editInput)
    if (result.ok === false) {
      setEditError(normalizeErrorMessage(result.reason))
      return
    }
    if (result.domain !== editingDomain && domains.includes(result.domain)) {
      setEditError(`"${result.domain}" is already in the list`)
      return
    }
    setSaving(true)
    try {
      const current = await loadDomains()
      if (result.domain !== editingDomain && current.includes(result.domain)) {
        setEditError(`"${result.domain}" is already in the list`)
        return
      }
      const updated = current.map((d) =>
        d === editingDomain ? result.domain : d
      )
      const saved = await saveDomains(updated)
      if (!saved) {
        setEditError("Failed to save. Please try again.")
        return
      }
      setEditingDomain(null)
    } catch (err) {
      console.error("[Link Gate] Failed to load allowed domains:", err)
      setStorageError("Failed to load allowed domains. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <div className={s.container}>
        <div className={s.accentBar} />
      </div>
    )
  }

  return (
    <div className={s.container}>
      <div className={s.accentBar} />
      <div className={s.header}>
        <p className={s.brand}>Link Gate</p>
        <h1 className={s.heading}>Allowed Domains</h1>
      </div>

      <div className={s.addRow}>
        <input
          ref={addInputRef}
          type="text"
          value={addInput}
          onChange={(e) => {
            setAddInput(e.target.value)
            setAddError("")
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd()
          }}
          placeholder="Add domain..."
          aria-label="Add domain"
          className={`${s.addInput} ${addError ? s.addInputError : ""}`}
        />
        <button onClick={handleAdd} className={s.addButton} disabled={saving}>
          Add
        </button>
      </div>

      {addError && <p className={s.errorText}>{addError}</p>}
      {storageError && <p className={s.errorText}>{storageError}</p>}

      {domains.length === 0 ? (
        <div className={s.emptyState}>
          <svg
            width={40}
            height={40}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#d1d5db"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <p className={s.emptyTitle}>No domains allowed</p>
          <p className={s.emptySub}>Domains you allow will appear here</p>
        </div>
      ) : (
        <>
          <div className={s.list}>
            {domains.map((domain, i) => (
              <div key={domain}>
                <div
                  className={`${s.domainRow} ${editingDomain === domain ? s.domainRowEditing : ""}`}>
                  {editingDomain === domain ? (
                    <>
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editInput}
                        onChange={(e) => {
                          setEditInput(e.target.value)
                          setEditError("")
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleEditSave()
                          if (e.key === "Escape") handleEditCancel()
                        }}
                        aria-label={`Edit domain ${domain}`}
                        className={`${s.editInput} ${editError ? s.editInputError : ""}`}
                      />
                      <button
                        className={`${s.iconButton} ${s.saveButton}`}
                        onClick={handleEditSave}
                        title="Save">
                        ✓
                      </button>
                      <button
                        className={`${s.iconButton} ${s.cancelButton}`}
                        onClick={handleEditCancel}
                        title="Cancel">
                        ×
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={s.domainText}>{domain}</span>
                      <button
                        className={`${s.iconButton} ${s.editButton}`}
                        onClick={() => handleEditStart(domain)}
                        title={`Edit ${domain}`}>
                        ✎
                      </button>
                      <button
                        className={`${s.iconButton} ${s.deleteButton}`}
                        onClick={() => handleDelete(domain)}
                        title={`Remove ${domain}`}>
                        ×
                      </button>
                    </>
                  )}
                </div>
                {editingDomain === domain && editError && (
                  <p className={s.editErrorText}>{editError}</p>
                )}
                {i < domains.length - 1 && <hr className={s.separator} />}
              </div>
            ))}
          </div>
          <div className={s.footer}>
            {domains.length} domain{domains.length !== 1 ? "s" : ""} allowed
          </div>
        </>
      )}
    </div>
  )
}

export default IndexPopup
