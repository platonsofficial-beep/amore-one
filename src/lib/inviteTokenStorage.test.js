import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  captureInviteTokenFromLocation,
  readPendingInviteToken,
  stripInviteTokenFromLocation,
  writePendingInviteToken,
} from './inviteTokenStorage'

describe('inviteTokenStorage', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      sessionStorage: {
        store: new Map(),
        getItem(key) {
          return this.store.get(key) ?? null
        },
        setItem(key, value) {
          this.store.set(key, value)
        },
        removeItem(key) {
          this.store.delete(key)
        },
      },
      localStorage: {
        store: new Map(),
        getItem(key) {
          return this.store.get(key) ?? null
        },
        setItem(key, value) {
          this.store.set(key, value)
        },
        removeItem(key) {
          this.store.delete(key)
        },
      },
      history: {
        state: null,
        replaceState(_state, _title, url) {
          this.url = url
        },
        url: '/',
      },
      location: {
        href: 'http://localhost:5173/?invite=abc123',
        pathname: '/',
        search: '?invite=abc123',
        hash: '',
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('captures invite tokens from query params and stores them', () => {
    const token = captureInviteTokenFromLocation(window.location)
    expect(token).toBe('abc123')
    expect(readPendingInviteToken()).toBe('abc123')
  })

  it('captures invite tokens from /invite/:token paths', () => {
    window.location.href = 'http://localhost:5173/invite/xyz789'
    window.location.pathname = '/invite/xyz789'
    window.location.search = ''

    const token = captureInviteTokenFromLocation(window.location)
    expect(token).toBe('xyz789')
    expect(readPendingInviteToken()).toBe('xyz789')
  })

  it('strips invite tokens from the location after capture', () => {
    stripInviteTokenFromLocation(window.location)
    expect(window.history.url).toBe('/')
  })

  it('persists manually written invite tokens', () => {
    writePendingInviteToken('manual-token')
    expect(readPendingInviteToken()).toBe('manual-token')
  })

  it('reads invite tokens from localStorage when session storage is empty', () => {
    window.sessionStorage.store.delete('one.pendingInviteToken')
    window.localStorage.setItem('one.pendingInviteToken.local', 'stored-token')
    expect(readPendingInviteToken()).toBe('stored-token')
  })
})
