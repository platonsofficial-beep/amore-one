import { describe, expect, it } from 'vitest'
import { getRolePreset } from '../lib/permissions'
import {
  floorSetupDone,
  isProfileSetupDone,
  isVenueSetupDone,
  nextDateKey,
  nextWizardStep,
  shouldAutoOpenSetupGuide,
  readSetupProgress,
  readStaffTourProgress,
  readStockTourProgress,
  shouldShowSetupChecklist,
  shouldShowStaffTour,
  shouldShowStockTour,
  visibleSetupSteps,
  visibleStaffTourSteps,
  visibleStockTourSteps,
  withSetupDone,
  writeSetupProgress,
  writeStaffTourProgress,
  writeStockTourProgress,
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
  it('shows the nine setup steps to the owner and hides settings steps from a manager', () => {
    expect(visibleSetupSteps('owner').map((step) => step.id)).toEqual([
      'venue', 'team', 'employees', 'roles', 'schedule', 'reservations', 'stock', 'operations', 'chat',
    ])
    expect(visibleSetupSteps('general_manager').map((step) => step.id)).toContain('team')
    expect(visibleSetupSteps('manager').map((step) => step.id)).toEqual([
      'employees', 'roles', 'schedule', 'reservations', 'stock', 'operations', 'chat',
    ])
    expect(visibleSetupSteps('staff')).toEqual([])
    expect(visibleSetupSteps('host')).toEqual([])
  })

  it('marks a step done only from saved venue data', () => {
    expect(isProfileSetupDone({ businessName: 'Amore' })).toBe(false)
    expect(isProfileSetupDone(openProfile)).toBe(true)
    expect(isVenueSetupDone({ businessName: '  ' })).toBe(false)
    expect(isVenueSetupDone({ businessName: 'Amore' })).toBe(true)
    const readyVenue = {
      businessName: 'Amore',
      city: 'Nicosia',
      countryCode: 'CY',
      timezone: 'Europe/Nicosia',
    }
    expect(isVenueSetupDone(readyVenue)).toBe(true)
    const steps = withSetupDone(visibleSetupSteps('owner'), {
      profile: readyVenue,
      positions: [{ id: 'server' }],
      seatings: [{ id: 'dinner', isActive: true }],
      employees: [{ id: 'e1', role: 'staff' }],
      shifts: [{ id: 's1' }],
      suppliers: [{ id: 'sup' }],
      stockItems: [{ id: 'item' }],
      tasks: [{ id: 'task' }],
      announcements: [{ id: 'note' }],
      floor: {
        publishedAt: '2026-11-22T12:00:00Z',
        zones: [{ label: 'Main' }],
        tables: [{ id: 't1' }],
      },
    })
    expect(steps.every((step) => step.done)).toBe(true)
    expect(steps.find((step) => step.id === 'reservations').target).toBe('setup.online')
    expect(floorSetupDone({ zones: [{ label: 'Main' }], tables: [] })['floor-publish']).toBe(false)
    const open = withSetupDone(visibleSetupSteps('owner'), {
      profile: readyVenue,
      positions: [],
      seatings: [],
      floor: {},
    })
    expect(nextWizardStep(open, 'venue').id).toBe('team')
    expect(nextWizardStep(open, '', ['venue', 'team']).id).toBe('employees')
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

  it('shows a staff member only the screens their role can open', () => {
    const staffIds = visibleStaffTourSteps('staff').map((step) => step.id)
    expect(staffIds).toEqual([
      'staff-today',
      'staff-week',
      'staff-clock',
      'staff-schedule',
      'staff-chat',
      'staff-stock',
      'staff-tasks',
      'staff-profile',
    ])
    expect(visibleStaffTourSteps('staff', { mobile: true }).map((step) => step.id)).not.toContain('staff-schedule')
    expect(visibleStaffTourSteps('staff', { mobile: true }).map((step) => step.id)).not.toContain('staff-reservations')
    const withFloor = getRolePreset('staff')
    withFloor.reservations = 'view'
    expect(visibleStaffTourSteps({ role: 'staff', permissions: withFloor }).map((step) => step.id)).toContain('staff-reservations')
    const withoutChat = getRolePreset('staff')
    withoutChat.chat = 'none'
    withoutChat.stock = 'none'
    withoutChat.operations = 'none'
    withoutChat.mobile_tasks = 'none'
    withoutChat.today = 'none'
    const limited = visibleStaffTourSteps({ role: 'staff', permissions: withoutChat }).map((step) => step.id)
    expect(limited).toEqual(['staff-week', 'staff-clock', 'staff-schedule', 'staff-profile'])
    expect(visibleStaffTourSteps('owner')).toEqual([])
    expect(visibleStaffTourSteps('host')).toEqual([])
    expect(visibleSetupSteps('staff')).toEqual([])
  })

  it('hides the staff tour after skip or finish until replay', () => {
    const steps = visibleStaffTourSteps('staff')
    const storage = memoryStorage()
    expect(shouldShowStaffTour({ steps, progress: readStaffTourProgress('u', 'v', storage) })).toBe(true)
    writeStaffTourProgress('u', 'v', { skipped: true, replay: false, finished: false }, storage)
    expect(shouldShowStaffTour({ steps, progress: readStaffTourProgress('u', 'v', storage) })).toBe(false)
    writeStaffTourProgress('u', 'v', { skipped: false, replay: false, finished: true }, storage)
    expect(shouldShowStaffTour({ steps, progress: readStaffTourProgress('u', 'v', storage) })).toBe(false)
    writeStaffTourProgress('u', 'v', { skipped: true, replay: true, finished: true }, storage)
    expect(shouldShowStaffTour({ steps, progress: readStaffTourProgress('u', 'v', storage) })).toBe(true)
    expect(readSetupProgress('u', 'v', storage).skipped).toBe(false)
  })

  it('walks managers through every stock tab and staff through take and counts', () => {
    const manager = visibleStockTourSteps('owner').map((step) => step.id)
    expect(manager).toEqual([
      'stock-dashboard',
      'stock-take',
      'stock-take-where',
      'stock-count',
      'stock-start-count',
      'stock-storages',
      'stock-receive',
      'stock-transfer',
      'stock-orders',
      'stock-create-order',
      'stock-suppliers',
      'stock-import',
    ])
    expect(visibleStockTourSteps('manager').map((step) => step.section)).toContain('orders')
    expect(visibleStockTourSteps('staff').map((step) => step.id)).toEqual([
      'stock-take',
      'stock-take-where',
      'stock-count-staff',
    ])
    expect(visibleStockTourSteps('host')).toEqual([])
    const storage = memoryStorage()
    writeStockTourProgress('u', 'v', { skipped: true, replay: false, finished: false }, storage)
    expect(shouldShowStockTour({
      steps: visibleStockTourSteps('staff'),
      progress: readStockTourProgress('u', 'v', storage),
    })).toBe(false)
    expect(readSetupProgress('u', 'v', storage).skipped).toBe(false)
  })

  it('stays closed after dismiss and opens again only from continue or replay', () => {
    expect(shouldAutoOpenSetupGuide({ skipped: false, remindAfter: '', replay: false, walking: false, paused: false, dismissed: false })).toBe(true)
    expect(shouldAutoOpenSetupGuide({ skipped: false, remindAfter: '', replay: false, walking: true, paused: false, dismissed: false })).toBe(true)
    expect(shouldAutoOpenSetupGuide({ skipped: false, remindAfter: '', replay: false, walking: false, paused: true, dismissed: true })).toBe(false)
    expect(shouldAutoOpenSetupGuide({ skipped: false, remindAfter: '', replay: true, walking: true, paused: false, dismissed: false })).toBe(true)
    expect(shouldAutoOpenSetupGuide({ skipped: false, remindAfter: '', replay: false, walking: true, paused: false, dismissed: false })).toBe(true)
    const named = withSetupDone(visibleSetupSteps('owner'), { profile: { businessName: 'SENTIO NICOSIA' } })
    expect(named.find((step) => step.id === 'venue').done).toBe(true)
    expect(nextWizardStep(named, 'venue').id).toBe('team')
  })

  it('stores skip state per user and venue', () => {
    const storage = memoryStorage()
    writeSetupProgress('user-1', 'venue-1', { skipped: true, remindAfter: '', replay: false }, storage)
    expect(readSetupProgress('user-1', 'venue-1', storage).skipped).toBe(true)
    expect(readSetupProgress('user-2', 'venue-1', storage).skipped).toBe(false)
    writeSetupProgress('user-1', 'venue-1', { dismissed: true, walking: false, paused: true, replay: false }, storage)
    expect(readSetupProgress('user-1', 'venue-1', storage).dismissed).toBe(true)
    expect(shouldAutoOpenSetupGuide(readSetupProgress('user-1', 'venue-1', storage))).toBe(false)
    expect(readSetupProgress('user-1', 'venue-2', storage).dismissed).toBe(false)
  })
})
