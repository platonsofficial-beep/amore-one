import { describe, expect, it } from 'vitest'
import {
  getHostSeatingAssignmentAdvisory,
  getHostAssignmentScrollPolicy,
  HOST_ASSIGNMENT_STANDARD_LANDSCAPE_HEIGHT_BUDGET,
  isHostAssignmentModeActive,
  isHostCompactAssignmentSelection,
  isReservationEligibleForHostTableAssignment,
  resolveHostAssignmentSeatingId,
  shouldHostAssignmentEnableScroll,
  shouldShowHostSeatingDrawer,
} from './hostAssignmentPanelUtils'
import { computeSeatingAssignmentTotals } from './seatingAssignment'

describe('host assignment panel utils', () => {
  it('enters assignment mode when an unassigned reservation is selected on compact host', () => {
    expect(isHostAssignmentModeActive({
      selectedReservation: { id: 'res-1', status: 'Confirmed' },
      floorPlanMode: 'view',
      isCompact: true,
    })).toBe(true)
  })

  it('does not enter assignment mode for assigned reservations on compact host', () => {
    expect(isHostAssignmentModeActive({
      selectedReservation: {
        id: 'res-1',
        status: 'Confirmed',
        seatingAssignment: { assignedUnits: [{ id: 't1', label: 'T1' }] },
      },
      floorPlanMode: 'view',
      isCompact: true,
    })).toBe(false)
  })

  it('does not enter assignment mode while editing layout', () => {
    expect(isHostAssignmentModeActive({
      selectedReservation: { id: 'res-1' },
      floorPlanMode: 'edit',
      isCompact: true,
    })).toBe(false)
  })

  it('identifies compact assignment selection for unassigned reservations', () => {
    expect(isHostCompactAssignmentSelection({
      isCompact: true,
      selectedReservation: { id: 'res-1', status: 'Confirmed' },
    })).toBe(true)
    expect(isReservationEligibleForHostTableAssignment({
      id: 'res-1',
      status: 'Completed',
    })).toBe(false)
  })

  it('retires the legacy host seating drawer', () => {
    expect(shouldShowHostSeatingDrawer()).toBe(false)
  })

  it('resolves assignment seating from reservation and manual override', () => {
    const seatings = [{
      id: 'dinner-1',
      name: 'Dinner 1',
      startTime: '19:00',
      durationMinutes: 120,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      sortOrder: 0,
      isActive: true,
    }]

    expect(resolveHostAssignmentSeatingId({
      reservation: { seatingId: 'dinner-1', time: '20:45' },
      seatings,
    })).toBe('dinner-1')

    expect(resolveHostAssignmentSeatingId({
      reservation: { time: '19:00', date: '2026-07-10' },
      seatings,
      selectedSeatingId: 'manual-seating',
    })).toBe('manual-seating')
  })

  it('returns advisory states for selection and capacity', () => {
    expect(getHostSeatingAssignmentAdvisory({ hasSelection: false }).message)
      .toBe('No tables selected.')

    const totals = computeSeatingAssignmentTotals({
      assignedUnits: [{ id: 'u1', label: 'T1', seatedCapacity: 2, maxGuestCapacity: 2 }],
      extraChairs: 0,
      standingGuests: 0,
    }, 4)

    expect(getHostSeatingAssignmentAdvisory({ hasSelection: true, totals }).message)
      .toBe('Selected capacity is below party size.')

    const fittingTotals = computeSeatingAssignmentTotals({
      assignedUnits: [{ id: 'u2', label: 'T2', seatedCapacity: 2, maxGuestCapacity: 4 }],
      extraChairs: 0,
      standingGuests: 0,
    }, 2)

    expect(getHostSeatingAssignmentAdvisory({ hasSelection: true, totals: fittingTotals }).message)
      .toBe('Capacity fits this party.')
  })

  it('uses content-fit scroll policy on landscape when content fits', () => {
    expect(getHostAssignmentScrollPolicy({ needsScroll: false, isPortrait: false }))
      .toBe('content-fit')
  })

  it('uses overflow scroll policy on portrait or when content exceeds space', () => {
    expect(getHostAssignmentScrollPolicy({ needsScroll: false, isPortrait: true }))
      .toBe('overflow')
    expect(getHostAssignmentScrollPolicy({ needsScroll: true, isPortrait: false }))
      .toBe('overflow')
  })

  it('defines a standard iPad landscape height budget for assignment content', () => {
    expect(HOST_ASSIGNMENT_STANDARD_LANDSCAPE_HEIGHT_BUDGET).toBeGreaterThanOrEqual(300)
    expect(HOST_ASSIGNMENT_STANDARD_LANDSCAPE_HEIGHT_BUDGET).toBeLessThanOrEqual(380)
  })

  it('enables scroll fallback only when portrait or body content exceeds available height', () => {
    expect(shouldHostAssignmentEnableScroll({ isPortrait: true })).toBe(true)
    expect(shouldHostAssignmentEnableScroll({
      bodyScrollHeight: 360,
      availableBodyHeight: 340,
      isPortrait: false,
    })).toBe(true)
    expect(shouldHostAssignmentEnableScroll({
      bodyScrollHeight: 300,
      availableBodyHeight: 340,
      isPortrait: false,
    })).toBe(false)
  })
})

/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MobileReservationsHostRightPane } from '../components/mobile/reservations/MobileReservationsHostRightPane'

describe('MobileReservationsHostRightPane assignment mode', () => {
  it('hides duplicate bottom reservation summary during assignment mode', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(MobileReservationsHostRightPane, {
        hasLayout: true,
        floorPlanContent: createElement('div', { 'data-testid': 'floor' }, 'Floor'),
        selectedReservation: { id: 'res-1', guestName: 'Guest' },
        isAssignmentMode: true,
      }))
    })

    expect(container.querySelector('[data-assignment-mode="true"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="host-floor-selection-summary"]')).toBeNull()

    act(() => root.unmount())
    container.remove()
  })

  it('restores bottom reservation summary when assignment mode closes', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(MobileReservationsHostRightPane, {
        hasLayout: true,
        floorPlanContent: createElement('div', null, 'Floor'),
        selectedReservation: { id: 'res-1', guestName: 'Guest', guests: 2, time: '17:00' },
        isAssignmentMode: false,
        todayKey: '2026-07-10',
        nowMinutes: 900,
      }))
    })

    expect(container.querySelector('[data-testid="host-floor-selection-summary"]')).toBeTruthy()
    expect(container.getAttribute('data-assignment-mode')).toBeNull()
    expect(container.querySelector('.mobile-host-reservations-right-pane')?.getAttribute('data-assignment-mode'))
      .toBe('false')

    act(() => root.unmount())
    container.remove()
  })
})
