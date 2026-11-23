import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAuthEmailRedirect } from './authRedirect'
import { clearPendingInviteToken, writePendingInviteToken } from './inviteTokenStorage'

function installStorage() {
  const memory = new Map()
  const storage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null },
    setItem(key, value) { memory.set(key, `${value}`) },
    removeItem(key) { memory.delete(key) },
  }
  vi.stubGlobal('window', { sessionStorage: storage, localStorage: storage })
}

describe('auth email redirect', () => {
  afterEach(() => {
    clearPendingInviteToken()
    vi.unstubAllGlobals()
  })

  it('sends confirmation to the public app with the invite token', () => {
    installStorage()
    writePendingInviteToken('tok-en')
    expect(buildAuthEmailRedirect({
      hostname: 'amore-one-sandy.vercel.app',
      origin: 'https://amore-one-sandy.vercel.app',
    })).toBe('https://app.onehospitality.app/?invite=tok-en')
  })

  it('keeps localhost only while developing', () => {
    installStorage()
    writePendingInviteToken('local')
    expect(buildAuthEmailRedirect(
      { hostname: 'localhost', origin: 'http://localhost:5173' },
    )).toBe('http://localhost:5173/?invite=local')
  })
})
