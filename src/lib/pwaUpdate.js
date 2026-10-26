export const PWA_RELOAD_GUARD_KEY = 'one_pwa_update_reload_at'
export const PWA_RELOAD_GUARD_MS = 15000

const listeners = new Set()
let updateAvailable = false
let formDirty = false
let lastReloadAt = 0
let formListenersBound = false
let updateChecksBound = false

function isElement(value) {
  return Boolean(value) && value.nodeType === 1
}

function isHiddenNode(element) {
  if (!isElement(element)) return true
  if (element.hidden) return true
  if (element.getAttribute?.('aria-hidden') === 'true') return true
  if (element.closest?.('[hidden]')) return true
  return false
}

export function hasOpenDialog(doc) {
  if (!doc?.querySelector) return false
  const nativeDialog = doc.querySelector('dialog[open]')
  if (isElement(nativeDialog) && !isHiddenNode(nativeDialog)) return true
  const nodes = doc.querySelectorAll?.('[role="dialog"], [aria-modal="true"]') ?? []
  for (const node of nodes) {
    if (!isHiddenNode(node)) return true
  }
  return false
}

export function isUnsavedFieldTarget(target) {
  if (!isElement(target)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag !== 'INPUT') return false
  const type = `${target.type || 'text'}`.toLowerCase()
  return type !== 'hidden'
    && type !== 'button'
    && type !== 'submit'
    && type !== 'reset'
    && type !== 'image'
}

export function noteFormEdit() {
  formDirty = true
}

export function isFormDirty() {
  return formDirty
}

export function shouldDeferPwaRefresh(doc) {
  return isFormDirty() || hasOpenDialog(doc)
}

function readGuard(storage) {
  try {
    const value = Number(storage?.getItem?.(PWA_RELOAD_GUARD_KEY))
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

function writeGuard(storage, now) {
  try {
    storage?.setItem?.(PWA_RELOAD_GUARD_KEY, String(now))
  } catch {
    // sessionStorage can be blocked. The in-memory stamp still covers this page.
  }
}

export function claimPwaUpdateReload(storage, now = Date.now()) {
  const previous = Math.max(lastReloadAt, readGuard(storage))
  if (previous > 0 && now >= previous && (now - previous) < PWA_RELOAD_GUARD_MS) {
    return false
  }
  lastReloadAt = now
  writeGuard(storage, now)
  return true
}

export function decidePwaUpdateAction(doc, storage, now = Date.now()) {
  if (shouldDeferPwaRefresh(doc)) return 'banner'
  if (!claimPwaUpdateReload(storage, now)) return 'ignore'
  return 'reload'
}

export function reloadPwaForUpdate(location, storage, { force = false, now = Date.now() } = {}) {
  if (!location || typeof location.reload !== 'function') return false
  if (force) {
    lastReloadAt = now
    writeGuard(storage, now)
  } else if (!claimPwaUpdateReload(storage, now)) {
    return false
  }
  location.reload()
  return true
}

export function markPwaUpdateAvailable() {
  updateAvailable = true
  listeners.forEach((listener) => listener(true))
}

export function isPwaUpdateAvailable() {
  return updateAvailable
}

export function subscribePwaUpdateAvailable(listener) {
  listeners.add(listener)
  listener(updateAvailable)
  return () => listeners.delete(listener)
}

export function bindPwaFormDirtyTracking(targetWindow) {
  const doc = targetWindow?.document
  if (!doc || formListenersBound) return () => {}
  formListenersBound = true

  const onEdit = (event) => {
    if (isUnsavedFieldTarget(event.target)) noteFormEdit()
  }

  doc.addEventListener('input', onEdit, true)
  doc.addEventListener('change', onEdit, true)

  return () => {
    doc.removeEventListener('input', onEdit, true)
    doc.removeEventListener('change', onEdit, true)
    formListenersBound = false
  }
}

export function bindPwaUpdateChecks(registration, targetWindow) {
  const doc = targetWindow?.document
  if (!registration || !doc || updateChecksBound) return () => {}
  updateChecksBound = true

  const update = () => {
    if (targetWindow.navigator?.onLine === false) return
    if (registration.installing) return
    const pending = registration.update?.()
    if (pending && typeof pending.catch === 'function') pending.catch(() => {})
  }

  const onVisibility = () => {
    if (doc.visibilityState === 'visible') update()
  }
  const onFocus = () => update()
  const onOnline = () => update()

  doc.addEventListener('visibilitychange', onVisibility)
  targetWindow.addEventListener('focus', onFocus)
  targetWindow.addEventListener('online', onOnline)
  update()

  return () => {
    doc.removeEventListener('visibilitychange', onVisibility)
    targetWindow.removeEventListener('focus', onFocus)
    targetWindow.removeEventListener('online', onOnline)
    updateChecksBound = false
  }
}

export function resetPwaUpdateSessionForTests() {
  updateAvailable = false
  formDirty = false
  lastReloadAt = 0
  formListenersBound = false
  updateChecksBound = false
  listeners.forEach((listener) => listener(false))
}
