import { describe, expect, it } from 'vitest'
import { BOOT_CACHE_MAX_AGE_MS, clearBootCache, readBootCache, readStoredSupabaseSession, writeBootCache } from './bootCache'

function memStore() {
  const m = new Map()
  return { get length() { return m.size }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, `${v}`), removeItem: (k) => m.delete(k) }
}

describe('bootCache', () => {
  it('round-trips for the same user only and expires', () => {
    const store = memStore()
    writeBootCache({ userId: 'u', membership: { id: 'm' }, workspace: { id: 'w' } }, { store, now: 1000 })
    expect(readBootCache('u', { store, now: 2000 })?.workspace.id).toBe('w')
    expect(readBootCache('other', { store, now: 2000 })).toBeNull()
    expect(readBootCache('u', { store, now: 1000 + BOOT_CACHE_MAX_AGE_MS + 1 })).toBeNull()
    clearBootCache({ store })
    expect(readBootCache('u', { store, now: 2000 })).toBeNull()
  })
  it('does not cache an incomplete context', () => {
    const store = memStore()
    writeBootCache({ userId: 'u', membership: null, workspace: { id: 'w' } }, { store })
    expect(store.length).toBe(0)
  })
  it('reads the persisted supabase session only with a refresh token', () => {
    const store = memStore()
    store.setItem('sb-abc-auth-token-code-verifier', 'x')
    expect(readStoredSupabaseSession({ store })).toBeNull()
    store.setItem('sb-abc-auth-token', JSON.stringify({ user: { id: 'u' }, refresh_token: '' }))
    expect(readStoredSupabaseSession({ store })).toBeNull()
    store.setItem('sb-abc-auth-token', JSON.stringify({ user: { id: 'u' }, refresh_token: 'r' }))
    expect(readStoredSupabaseSession({ store })?.user.id).toBe('u')
  })
})
