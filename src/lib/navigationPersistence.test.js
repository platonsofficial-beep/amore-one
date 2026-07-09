import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolvePermittedActiveView } from './permissions'
import { normalizeActiveView, readPersistedNavigation } from './navigationPersistence'

describe('navigationPersistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('normalizes invalid persisted views to today', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => JSON.stringify({ activeView: 'not-a-module' }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    })

    expect(readPersistedNavigation().activeView).toBe('today')
  })

  it('redirects staff away from persisted manager-only views', () => {
    expect(resolvePermittedActiveView('staff', normalizeActiveView('settings'))).toBe('today')
    expect(resolvePermittedActiveView('staff', normalizeActiveView('insights'))).toBe('today')
    expect(resolvePermittedActiveView('staff', normalizeActiveView('reservations'))).toBe('today')
  })

  it('redirects managers away from persisted settings', () => {
    expect(resolvePermittedActiveView('manager', normalizeActiveView('settings'))).toBe('today')
    expect(resolvePermittedActiveView('manager', normalizeActiveView('reservations'))).toBe('reservations')
  })
})
