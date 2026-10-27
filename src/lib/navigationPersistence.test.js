import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolvePermittedActiveView } from './permissions'
import {
  normalizeActiveView,
  persistNavigation,
  readPersistedNavigation,
  resolveInitialScheduleWeekStart,
} from './navigationPersistence'

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

  it('redirects host away from persisted manager-only views', () => {
    expect(resolvePermittedActiveView('host', normalizeActiveView('settings'))).toBe('settings')
    expect(resolvePermittedActiveView('host', normalizeActiveView('stock'))).toBe('reservations')
    expect(resolvePermittedActiveView('host', normalizeActiveView('reservations'))).toBe('reservations')
  })

  it('opens the schedule on the current week instead of a stored previous week', () => {
    const store = new Map([
      ['one.navigation.v2', JSON.stringify({
        activeView: 'team',
        teamSection: 'schedule',
        scheduleWeekStart: '2026-10-19',
      })],
    ])
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, value),
        removeItem: (key) => store.delete(key),
      },
    })

    expect(readPersistedNavigation().scheduleWeekStart).toBeNull()
    expect(resolveInitialScheduleWeekStart('2026-10-26')).toBe('2026-10-26')
    expect(resolveInitialScheduleWeekStart('2026-10-19')).toBe('2026-10-19')

    persistNavigation({ activeView: 'team', teamSection: 'schedule', scheduleWeekStart: '2026-10-19' })
    expect(JSON.parse(store.get('one.navigation.v2')).scheduleWeekStart).toBeUndefined()
    expect(resolveInitialScheduleWeekStart('2026-10-26')).toBe('2026-10-26')
  })

  it('lets managers open reservation seating settings', () => {
    expect(resolvePermittedActiveView('manager', normalizeActiveView('settings'))).toBe('settings')
    expect(resolvePermittedActiveView('manager', normalizeActiveView('reservations'))).toBe('reservations')
  })
})
