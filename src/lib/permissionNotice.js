import { t } from '../i18n/i18n'

export function permissionNoticeCopy(kind) {
  if (kind === 'location') {
    return {
      title: t("Location for clock-in"),
      body: t("Clock location permission body"),
    }
  }
  if (kind === 'push') {
    return {
      title: t("Notifications"),
      body: t("Push permission body"),
    }
  }
  return null
}

const storageKey = (kind) => `one.permissionNotice.${kind}`

export function hasSeenPermissionNotice(kind, storage = globalThis.localStorage) {
  try {
    return storage?.getItem(storageKey(kind)) === 'accepted'
  } catch {
    return false
  }
}

function rememberPermissionNotice(kind, storage = globalThis.localStorage) {
  try {
    storage?.setItem(storageKey(kind), 'accepted')
  } catch {
    // ignore (private mode)
  }
}

/**
 * Shows a short in-app explanation before the OS permission prompt (once per device).
 * Resolves true when the user continues, false when they cancel.
 */
export function explainBeforePermission(kind, { doc = globalThis.document, storage = globalThis.localStorage } = {}) {
  const notice = permissionNoticeCopy(kind)
  if (!notice || hasSeenPermissionNotice(kind, storage) || !doc?.body) return Promise.resolve(true)

  return new Promise((resolve) => {
    const backdrop = doc.createElement('div')
    backdrop.className = 'permission-notice-backdrop'
    backdrop.setAttribute('role', 'presentation')
    const dialog = doc.createElement('div')
    dialog.className = 'permission-notice'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    const title = doc.createElement('h3')
    title.textContent = notice.title
    const body = doc.createElement('p')
    body.textContent = notice.body
    const actions = doc.createElement('div')
    actions.className = 'permission-notice-actions'
    const cancel = doc.createElement('button')
    cancel.type = 'button'
    cancel.className = 'ghost-btn'
    cancel.textContent = t("Not now")
    const ok = doc.createElement('button')
    ok.type = 'button'
    ok.className = 'primary-btn'
    ok.textContent = t("Continue")
    const finish = (accepted) => {
      backdrop.remove()
      if (accepted) rememberPermissionNotice(kind, storage)
      resolve(accepted)
    }
    cancel.addEventListener('click', () => finish(false))
    ok.addEventListener('click', () => finish(true))
    actions.append(cancel, ok)
    dialog.append(title, body, actions)
    backdrop.append(dialog)
    doc.body.append(backdrop)
    ok.focus?.()
  })
}
