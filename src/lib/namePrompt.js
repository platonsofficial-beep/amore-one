const KEY = 'one.namePrompt.v1'

export function namePromptStorageKey(userId) {
  return `${KEY}:${`${userId ?? ''}`.trim()}`
}

export function isNamePromptDismissed(userId, storage = globalThis.localStorage) {
  const id = `${userId ?? ''}`.trim()
  if (!id || !storage?.getItem) return false
  try {
    return storage.getItem(namePromptStorageKey(id)) === '1'
  } catch {
    return false
  }
}

export function dismissNamePrompt(userId, storage = globalThis.localStorage) {
  const id = `${userId ?? ''}`.trim()
  if (!id || !storage?.setItem) return
  try {
    storage.setItem(namePromptStorageKey(id), '1')
  } catch {
    // Private mode. The sheet still closes for this visit.
  }
}
