const KEY = 'one.trialNotice.v1'

export function trialNoticeStorageKey(userId, workspaceId, dayKey) {
  return `${KEY}:${`${userId ?? ''}`.trim() || 'local'}:${`${workspaceId ?? ''}`.trim() || 'local'}:${`${dayKey ?? ''}`.trim()}`
}

export function isTrialNoticeDismissed(userId, workspaceId, dayKey, storage = globalThis.localStorage) {
  if (!storage?.getItem) return false
  try {
    return storage.getItem(trialNoticeStorageKey(userId, workspaceId, dayKey)) === '1'
  } catch {
    return false
  }
}

export function dismissTrialNotice(userId, workspaceId, dayKey, storage = globalThis.localStorage) {
  if (!storage?.setItem) return
  try {
    storage.setItem(trialNoticeStorageKey(userId, workspaceId, dayKey), '1')
  } catch {
    // Private mode. The notice still closes for this visit.
  }
}
