/**
 * Instant startup cache: the last loaded workspace context for one user.
 * Display-only hint so the shell can render before the network answers;
 * the server (RLS) stays the authority and the context is revalidated.
 */
export const BOOT_CACHE_KEY = 'one.bootCache.v1'
export const BOOT_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

function storage(store) {
  if (store) return store
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

const trimId = (value) => `${value ?? ''}`.trim()

export function writeBootCache({ userId, membership, memberships = [], workspace, permissionRows = null } = {}, { store, now = Date.now() } = {}) {
  const s = storage(store)
  const id = trimId(userId)
  if (!s || !id || !membership || !workspace) return
  try {
    s.setItem(BOOT_CACHE_KEY, JSON.stringify({
      v: 1, userId: id, savedAt: now, membership, memberships, workspace, permissionRows,
    }))
  } catch {
    // quota / private mode: cache is optional
  }
}

export function updateBootCachePermissions(userId, memberId, permissionRows, { store } = {}) {
  const cached = readBootCache(userId, { store })
  if (!cached || trimId(cached.membership?.id) !== trimId(memberId)) return
  writeBootCache({ ...cached, permissionRows }, { store, now: cached.savedAt })
}

export function readBootCache(userId, { store, now = Date.now() } = {}) {
  const s = storage(store)
  const id = trimId(userId)
  if (!s || !id) return null
  try {
    const parsed = JSON.parse(s.getItem(BOOT_CACHE_KEY) || 'null')
    if (!parsed || parsed.v !== 1 || parsed.userId !== id) return null
    if (!parsed.membership || !parsed.workspace) return null
    if (!(now - Number(parsed.savedAt) < BOOT_CACHE_MAX_AGE_MS)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearBootCache({ store } = {}) {
  const s = storage(store)
  try {
    s?.removeItem(BOOT_CACHE_KEY)
  } catch {
    // ignore
  }
}

/**
 * The Supabase session persisted by supabase-js (sb-<ref>-auth-token), read
 * synchronously. A session counts when it has a user and a refresh token,
 * even if the access token is expired (supabase-js refreshes it and every
 * query waits for that refresh before it is sent).
 */
export function readStoredSupabaseSession({ store } = {}) {
  const s = storage(store)
  if (!s) return null
  try {
    for (let index = 0; index < s.length; index += 1) {
      const key = s.key(index)
      if (!/^sb-[^-]+(?:-[^-]+)*-auth-token$/.test(key ?? '') || /code-verifier$/.test(key)) continue
      const parsed = JSON.parse(s.getItem(key) || 'null')
      const session = parsed?.currentSession ?? parsed
      if (trimId(session?.user?.id) && trimId(session?.refresh_token)) return session
    }
  } catch {
    return null
  }
  return null
}
