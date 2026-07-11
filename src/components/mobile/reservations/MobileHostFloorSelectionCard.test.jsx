/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { MobileHostFloorSelectionCard } from './MobileReservationsHostRightPane'
import { getHostFloorSelectionStatusPresentation } from '../../../lib/reservationHostStatus'

const SEATINGS = [
  {
    id: 'dinner-2',
    name: 'Dinner 2',
    startTime: '21:00',
    durationMinutes: 120,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  },
]

function renderSelectionCard(reservation, options = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(MobileHostFloorSelectionCard, {
      reservation,
      todayKey: '2026-07-10',
      nowMinutes: options.nowMinutes ?? 1200,
      reservationSeatings: SEATINGS,
      onEdit: () => {},
      onOpenRowMenu: () => {},
      ...options,
    }))
  })

  return {
    container,
    root,
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('getHostFloorSelectionStatusPresentation', () => {
  it('renders premium confirmed status copy', () => {
    expect(getHostFloorSelectionStatusPresentation(
      { status: 'Confirmed', date: '2026-07-10', time: '20:30' },
      1200,
      '2026-07-10',
    )).toEqual({
      label: 'Confirmed',
      icon: '✓',
      tone: 'confirmed',
      severity: null,
    })
  })

  it('renders late duration in the status pill', () => {
    const presentation = getHostFloorSelectionStatusPresentation(
      { status: 'Confirmed', date: '2026-07-10', time: '18:00' },
      19 * 60 + 12,
      '2026-07-10',
    )

    expect(presentation.icon).toBe('⏰')
    expect(presentation.label).toBe('Late 72m')
    expect(presentation.severity).toBe('severe')
  })

  it('renders seated and no-show labels with shared icon mapping', () => {
    expect(getHostFloorSelectionStatusPresentation(
      { status: 'Checked In', date: '2026-07-10', time: '20:30' },
      1200,
      '2026-07-10',
    )).toMatchObject({
      label: 'Seated',
      icon: '🍽',
    })

    expect(getHostFloorSelectionStatusPresentation(
      { status: 'Not Shown', date: '2026-07-10', time: '20:30' },
      1200,
      '2026-07-10',
    )).toMatchObject({
      label: 'No Show',
      icon: '⚠',
    })

    expect(getHostFloorSelectionStatusPresentation(
      { status: 'Waiting', date: '2026-07-10', time: '20:30' },
      1200,
      '2026-07-10',
    )).toMatchObject({
      label: 'Arrived',
      icon: '👋',
    })
  })
})

describe('MobileHostFloorSelectionCard', () => {
  it('renders premium toolbar layout with metadata and actions', () => {
    const { container, cleanup } = renderSelectionCard({
      id: 'res-1',
      guestName: 'Fournie',
      guests: 2,
      time: '20:30',
      date: '2026-07-10',
      status: 'Confirmed',
      seatingId: 'dinner-2',
      seatingAssignment: {
        assignedUnits: [{ id: 't102', label: 'T102' }],
        extraChairs: 1,
        standingGuests: 0,
      },
    })

    expect(container.querySelector('.mobile-host-floor-selection-guest')?.textContent).toBe('Fournie')
    expect(container.querySelector('.mobile-host-floor-selection-meta')?.textContent)
      .toContain('👤 2 guests')
    expect(container.querySelector('.mobile-host-floor-selection-meta')?.textContent)
      .toContain('🍽 T102')
    expect(container.querySelector('.mobile-host-floor-selection-meta')?.textContent)
      .toContain('🪑 +1')
    expect(container.querySelector('.mobile-host-floor-selection-meta')?.textContent)
      .toContain('🍷 Dinner 2')

    const statusPill = container.querySelector('.selected-reservation-status')
    expect(statusPill?.classList.contains('tone-confirmed')).toBe(true)
    expect(statusPill?.querySelector('.selected-reservation-status-icon')?.textContent).toBe('✓')
    expect(statusPill?.querySelector('.selected-reservation-status-label')?.textContent).toBe('Confirmed')
    expect(statusPill?.getAttribute('aria-label')).toBe('Reservation status: Confirmed')
    expect(container.querySelector('.mobile-host-floor-selection-edit-btn')).toBeTruthy()
    expect(container.querySelector('.mobile-host-floor-selection-menu-btn')).toBeTruthy()

    cleanup()
  })

  it('renders seated status with a dedicated icon circle and separate label', () => {
    const { container, cleanup } = renderSelectionCard({
      id: 'res-seated',
      guestName: 'Fournie',
      guests: 2,
      time: '20:30',
      date: '2026-07-10',
      status: 'Checked In',
      seatingAssignment: {
        assignedUnits: [{ id: 't102', label: 'T102' }],
        extraChairs: 0,
        standingGuests: 0,
      },
    })

    const statusPill = container.querySelector('.selected-reservation-status')
    const icon = statusPill?.querySelector('.selected-reservation-status-icon')
    const label = statusPill?.querySelector('.selected-reservation-status-label')

    expect(icon).not.toBeNull()
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    expect(icon?.textContent).toBe('🍽')
    expect(label?.textContent).toBe('Seated')
    expect(statusPill?.textContent).toBe('🍽Seated')
    expect(statusPill?.getAttribute('aria-label')).toBe('Reservation status: Seated')
    expect(statusPill?.classList.contains('tone-checked-in')).toBe(true)

    cleanup()
  })

  it('uses the shared icon-circle structure for late and no-show statuses', () => {
    const late = renderSelectionCard({
      id: 'res-late',
      guestName: 'Late Guest',
      guests: 2,
      time: '18:00',
      date: '2026-07-10',
      status: 'Confirmed',
    }, { nowMinutes: 19 * 60 + 12 })

    const latePill = late.container.querySelector('.selected-reservation-status')
    expect(latePill?.querySelector('.selected-reservation-status-icon')?.textContent).toBe('⏰')
    expect(latePill?.querySelector('.selected-reservation-status-label')?.textContent).toBe('Late 72m')
    late.cleanup()

    const noShow = renderSelectionCard({
      id: 'res-noshow',
      guestName: 'No Show Guest',
      guests: 2,
      time: '20:30',
      date: '2026-07-10',
      status: 'Not Shown',
    })

    const noShowPill = noShow.container.querySelector('.selected-reservation-status')
    expect(noShowPill?.querySelector('.selected-reservation-status-icon')?.textContent).toBe('⚠')
    expect(noShowPill?.querySelector('.selected-reservation-status-label')?.textContent).toBe('No Show')
    noShow.cleanup()
  })

  it('hides extra-chair and seating metadata when unavailable', () => {
    const { container, cleanup } = renderSelectionCard({
      id: 'res-2',
      guestName: 'Paparas',
      guests: 2,
      time: '20:30',
      date: '2026-07-10',
      status: 'Confirmed',
      seatingAssignment: {
        assignedUnits: [{ id: 't11', label: 'T11' }],
        extraChairs: 0,
        standingGuests: 0,
      },
    }, { reservationSeatings: [] })

    const meta = container.querySelector('.mobile-host-floor-selection-meta')?.textContent ?? ''
    expect(meta).not.toContain('🪑')
    expect(meta).not.toContain('🍷')

    cleanup()
  })
})
