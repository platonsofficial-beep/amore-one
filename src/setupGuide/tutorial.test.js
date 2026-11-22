import { describe, expect, it } from 'vitest'
import {
  markScreenSeen,
  readTutorial,
  replayTutorial,
  screenGuide,
  setTutorialChoice,
  tutorialScreenId,
} from './tutorial'

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  }
}

describe('tutorial choice', () => {
  it('asks once per user and venue, and remembers each screen on this device', () => {
    const storage = memoryStorage()
    expect(readTutorial('u1', 'v1', storage).choice).toBe('')
    setTutorialChoice('u1', 'v1', 'yes', storage)
    expect(readTutorial('u1', 'v1', storage).choice).toBe('yes')
    expect(readTutorial('u2', 'v1', storage).choice).toBe('')
    markScreenSeen('u1', 'v1', 'today', storage)
    expect(readTutorial('u1', 'v1', storage).seen.today).toBe(true)
    expect(readTutorial('u1', 'v1', storage).seen.reservations).toBeUndefined()
    replayTutorial('u1', 'v1', storage)
    expect(readTutorial('u1', 'v1', storage).choice).toBe('yes')
    expect(readTutorial('u1', 'v1', storage).seen.today).toBeUndefined()
    setTutorialChoice('u1', 'v1', 'no', storage)
    expect(readTutorial('u1', 'v1', storage).choice).toBe('no')
  })

  it('explains only the screens that role can open', () => {
    expect(screenGuide('owner', 'today')?.steps.map((step) => step.id)).toEqual(['today-home', 'today-search', 'today-menu'])
    expect(screenGuide('owner', 'stock:orders')?.steps.map((step) => step.id)).toContain('stock-create-order')
    expect(screenGuide('owner', 'settings:system')?.steps[0].id).toBe('set-system')
    expect(screenGuide('staff', 'stock:take')?.steps.map((step) => step.id)).toEqual(['stock-take', 'stock-take-where'])
    expect(screenGuide('staff', 'stock:orders')).toBeNull()
    expect(screenGuide('staff', 'reservations')).toBeNull()
    expect(screenGuide('staff', 'settings:profile')).toBeNull()
    expect(screenGuide('staff', 'my-week')?.steps[0].id).toBe('my-week')
    expect(screenGuide('owner', 'reservations')?.steps.map((step) => step.id)).toEqual(['res-list', 'res-floor', 'res-add'])
    expect(screenGuide('owner', 'settings:reservations')?.steps[0].id).toBe('set-seatings')
    expect(screenGuide('owner', 'team:schedule')).not.toBeNull()
    expect(screenGuide('owner', 'operations:tasks')).not.toBeNull()
    expect(screenGuide('owner', 'operations:checklists')).not.toBeNull()
    expect(screenGuide('owner', 'insights')).not.toBeNull()
    expect(['dashboard', 'take', 'count', 'storages', 'suppliers', 'orders', 'migration'].every((section) => screenGuide('owner', `stock:${section}`))).toBe(true)
    expect(screenGuide('host', 'reservations')).not.toBeNull()
    expect(tutorialScreenId({ view: 'today', mobile: true, mobileTab: 'tasks', operationsSection: 'dashboard' })).toBe('operations:dashboard')
    expect(screenGuide('host', 'stock:take')).toBeNull()
    expect(screenGuide('host', 'insights')).toBeNull()
    expect(tutorialScreenId({ view: 'stock', stockSection: 'count' })).toBe('stock:count')
    expect(tutorialScreenId({ view: 'team', teamSection: 'schedule' })).toBe('team:schedule')
    expect(tutorialScreenId({ view: 'settings', settingsSection: 'system' })).toBe('settings:system')
  })
})
