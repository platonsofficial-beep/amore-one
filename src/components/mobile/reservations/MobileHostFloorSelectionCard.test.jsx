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

  it('renders seated and no-show labels', () => {
    expect(getHostFloorSelectionStatusPresentation(
      { status: 'Checked In', date: '2026-07-10', time: '20:30' },
      1200,
      '2026-07-10',
    ).label).toBe('Seated')

    expect(getHostFloorSelectionStatusPresentation(
      { status: 'Not Shown', date: '2026-07-10', time: '20:30' },
      1200,
      '2026-07-10',
    )).toMatchObject({
      label: 'No Show',
      icon: '❌',
    })
  })
})

describe('MobileHostFloorSelectionCard', () => {
  it('renders premium toolbar layout with metadata and actions', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(MobileHostFloorSelectionCard, {
        reservation: {
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
        },
        todayKey: '2026-07-10',
        nowMinutes: 1200,
        reservationSeatings: SEATINGS,
        onEdit: () => {},
        onOpenRowMenu: () => {},
      }))
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

    const statusPill = container.querySelector('.host-reservation-card-status-pill')
    expect(statusPill?.classList.contains('tone-confirmed')).toBe(true)
    expect(statusPill?.textContent).toBe('✓ Confirmed')
    expect(container.querySelector('.mobile-host-floor-selection-edit-btn')).toBeTruthy()
    expect(container.querySelector('.mobile-host-floor-selection-menu-btn')).toBeTruthy()

    act(() => root.unmount())
    container.remove()
  })

  it('hides extra-chair and seating metadata when unavailable', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(MobileHostFloorSelectionCard, {
        reservation: {
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
        },
        todayKey: '2026-07-10',
        nowMinutes: 1200,
        reservationSeatings: [],
        onEdit: () => {},
      }))
    })

    const meta = container.querySelector('.mobile-host-floor-selection-meta')?.textContent ?? ''
    expect(meta).not.toContain('🪑')
    expect(meta).not.toContain('🍷')

    act(() => root.unmount())
    container.remove()
  })
})
