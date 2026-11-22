import { describe, expect, it } from 'vitest'
import {
  floorSetupDone,
  isProfileSetupDone,
  nextDateKey,
  readSetupProgress,
  shouldShowSetupChecklist,
  visibleSetupSteps,
  withSetupDone,
  writeSetupProgress,
} from './setupGuide'

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  }
}

const openProfile = { businessName: 'Amore', timezone: 'Europe/Athens', defaultPhoneCountryCode: 'GR' }

describe('setup guide', () => {
  it('shows every phase-1 step to the owner and only the floor to a manager', () => {
    expect(visibleSetupSteps('owner').map((step) => step.id)).toEqual([
      'profile', 'positions', 'seatings', 'floor-area', 'floor-tables', 'floor-publish',
    ])
    expect(visibleSetupSteps('general_manager').map((step) => step.id)).toContain('positions')
    expect(visibleSetupSteps('manager').map((step) => step.id)).toEqual([
      'floor-area', 'floor-tables', 'floor-publish',
    ])
    expect(visibleSetupSteps('staff')).toEqual([])
    expect(visibleSetupSteps('host')).toEqual([])
  })

  it('marks a step done only from saved venue data', () => {
    expect(isProfileSetupDone({ businessName: 'Amore' })).toBe(false)
    expect(isProfileSetupDone(openProfile)).toBe(true)
    const steps = withSetupDone(visibleSetupSteps('owner'), {
      profile: openProfile,
      positions: [{ id: 'server' }],
      seatings: [{ id: 'dinner', isActive: true }],
      floor: {
        publishedAt: '2026-11-22T12:00:00Z',
        zones: [{ label: 'Main' }],
        tables: [{ id: 't1' }],
      },
    })
    expect(steps.every((step) => step.done)).toBe(true)
    expect(floorSetupDone({ zones: [{ label: 'Main' }], tables: [] })['floor-publish']).toBe(false)
  })

  it('hides a finished venue until replay, and honors skip and remind tomorrow', () => {
    const steps = withSetupDone(visibleSetupSteps('owner'), {
      profile: openProfile,
      positions: [],
      seatings: [],
      floor: {},
    })
    expect(shouldShowSetupChecklist({ steps, progress: { skipped: false, remindAfter: '', replay: false }, todayKey: '2026-11-22' })).toBe(true)
    expect(shouldShowSetupChecklist({
      steps: steps.map((step) => ({ ...step, done: true })),
      progress: { skipped: false, remindAfter: '', replay: false },
      todayKey: '2026-11-22',
    })).toBe(false)
    expect(shouldShowSetupChecklist({
      steps,
      progress: { skipped: true, remindAfter: '', replay: false },
      todayKey: '2026-11-22',
    })).toBe(false)
    expect(shouldShowSetupChecklist({
      steps,
      progress: { skipped: false, remindAfter: '2026-11-23', replay: false },
      todayKey: '2026-11-22',
    })).toBe(false)
    expect(shouldShowSetupChecklist({
      steps,
      progress: { skipped: false, remindAfter: '2026-11-23', replay: false },
      todayKey: '2026-11-23',
    })).toBe(true)
    expect(nextDateKey('2026-11-22')).toBe('2026-11-23')
  })

  it('stores skip state per user and venue', () => {
    const storage = memoryStorage()
    writeSetupProgress('user-1', 'venue-1', { skipped: true, remindAfter: '', replay: false }, storage)
    expect(readSetupProgress('user-1', 'venue-1', storage).skipped).toBe(true)
    expect(readSetupProgress('user-2', 'venue-1', storage).skipped).toBe(false)
  })
})
