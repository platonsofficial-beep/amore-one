/**
 * @vitest-environment jsdom
 */
import { createClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'

const SUPABASE_URL = 'https://example.supabase.co'
const ANON_KEY = 'anon-key-fixture'
const STORAGE_KEY = 'sb-example-auth-token'

function memoryStorage() {
  const items = new Map()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value) },
    removeItem: (key) => { items.delete(key) },
  }
}

function expiredSession() {
  return {
    access_token: 'expired-access-fixture',
    refresh_token: 'refresh-fixture',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) - 120,
    token_type: 'bearer',
    user: {
      id: 'user-fixture',
      aud: 'authenticated',
      role: 'authenticated',
    },
  }
}

function clientFor(storageKey, storage, fetchMock) {
  storage.setItem(storageKey, JSON.stringify(expiredSession()))
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { fetch: fetchMock },
    auth: {
      storage,
      storageKey,
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })
}

describe('auth token refresh before data reads', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('retries one refresh on a network failure and does not start a table read while that refresh is outstanding', async () => {
    vi.useFakeTimers()
    const calls = []
    const fetchMock = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url
      calls.push(new URL(url).pathname)
      throw new TypeError('Failed to fetch')
    })
    const client = clientFor(STORAGE_KEY, memoryStorage(), fetchMock)
    const pendingRead = client.from('reservations').select('id')
    pendingRead.then(() => {}, () => {})

    await vi.advanceTimersByTimeAsync(0)
    expect(calls.filter((path) => path.startsWith('/auth/v1/token'))).toHaveLength(1)
    expect(calls.some((path) => path.startsWith('/rest/v1'))).toBe(false)

    await vi.advanceTimersByTimeAsync(700)
    expect(calls.filter((path) => path.startsWith('/auth/v1/token')).length).toBeGreaterThanOrEqual(3)
    expect(calls.some((path) => path.startsWith('/rest/v1'))).toBe(false)

    let settled = null
    pendingRead.then((result) => {
      settled = result
    }, () => {
      settled = { error: new Error('rejected') }
    })
    for (let step = 0; step < 40 && !settled; step += 1) {
      await vi.advanceTimersByTimeAsync(1000)
    }
    expect(settled?.error).toBeTruthy()
    expect(settled?.data ?? null).toBeFalsy()
    expect(calls.filter((path) => path.startsWith('/auth/v1/token')).length).toBeLessThan(30)
  })

  it('shares one in-flight refresh across overlapping session reads', async () => {
    vi.useFakeTimers()
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    let tokenStarts = 0
    const fetchMock = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url
      if (new URL(url).pathname.startsWith('/auth/v1/token')) {
        tokenStarts += 1
        await gate
        throw new TypeError('Failed to fetch')
      }
      throw new TypeError('Failed to fetch')
    })
    const client = clientFor('sb-overlap-auth-token', memoryStorage(), fetchMock)

    const first = client.auth.getSession()
    const second = client.auth.getSession()
    await vi.advanceTimersByTimeAsync(0)
    expect(tokenStarts).toBe(1)
    release()
    await vi.advanceTimersByTimeAsync(35_000)
    await Promise.allSettled([first, second])
  })
})
