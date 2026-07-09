import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canShowIosInstallHint,
  isIosDevice,
  isStandaloneDisplayMode,
  readNetworkStatus,
} from './pwaUtils.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pwaUtils', () => {
  it('detects standalone display mode', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn((query) => ({
        matches: query === '(display-mode: standalone)',
      })),
      navigator: { standalone: false },
    })
    vi.stubGlobal('navigator', { standalone: false })

    expect(isStandaloneDisplayMode()).toBe(true)
  })

  it('detects iOS devices from user agent', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })

    expect(isIosDevice()).toBe(true)
  })

  it('shows iOS install hint only when not installed', () => {
    const storage = new Map()

    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => ({ matches: false })),
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
    })
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
      standalone: false,
    })

    expect(canShowIosInstallHint()).toBe(true)
  })

  it('reads network status from navigator.onLine', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(readNetworkStatus()).toBe(false)
  })
})
