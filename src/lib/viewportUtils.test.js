import { afterEach, describe, expect, it, vi } from 'vitest'

function mockViewport({
  width = 1280,
  height = 800,
  userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  platform = 'MacIntel',
  maxTouchPoints = 0,
  coarsePointer = false,
  forceMobileShell = false,
} = {}) {
  const storage = new Map()
  if (forceMobileShell) {
    storage.set('ONE_FORCE_MOBILE_SHELL', '1')
  }

  vi.stubGlobal('window', {
    innerWidth: width,
    innerHeight: height,
    matchMedia: vi.fn((query) => ({
      matches: query === '(pointer: coarse)' ? coarsePointer : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })

  vi.stubGlobal('navigator', {
    userAgent,
    platform,
    maxTouchPoints,
  })

  vi.stubGlobal('sessionStorage', {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  })

  vi.stubGlobal('localStorage', {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  })
}

describe('viewportUtils', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('uses desktop shell on wide MacBook Chrome viewports', async () => {
    mockViewport({ width: 1440, height: 900, maxTouchPoints: 2 })
    const { shouldUseMobileShell } = await import('./viewportUtils')
    expect(shouldUseMobileShell()).toBe(false)
  })

  it('ignores stale mobile shell lock on desktop-width viewports', async () => {
    mockViewport({ width: 1512, height: 982, maxTouchPoints: 2, forceMobileShell: true })
    const { shouldUseMobileShell, isIPhoneLikeDevice } = await import('./viewportUtils')
    expect(shouldUseMobileShell()).toBe(false)
    expect(isIPhoneLikeDevice()).toBe(false)
  })

  it('keeps mobile shell for narrow desktop windows', async () => {
    mockViewport({ width: 390, height: 844, maxTouchPoints: 2 })
    const { shouldUseMobileShell } = await import('./viewportUtils')
    expect(shouldUseMobileShell()).toBe(true)
  })

  it('keeps mobile shell for iPhone user agents even in wide landscape', async () => {
    mockViewport({
      width: 932,
      height: 430,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
    const { shouldUseMobileShell } = await import('./viewportUtils')
    expect(shouldUseMobileShell()).toBe(true)
  })
})
