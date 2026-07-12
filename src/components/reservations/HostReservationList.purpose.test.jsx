/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { HostReservationList } from './HostReservationList'
import { HOST_LIST_HELPERS } from './hostReservationListHelpers'

const HELPERS = {
  ...HOST_LIST_HELPERS,
  getHostReservationWarnings: () => [],
}

function renderList(reservations, props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(HostReservationList, {
      reservations,
      nowMinutes: 18 * 60,
      todayKey: '2026-07-10',
      listFilter: 'All',
      isSelected: () => false,
      onOpenEdit: vi.fn(),
      onStatusChange: vi.fn(),
      onDragStart: vi.fn(),
      onDragEnd: vi.fn(),
      useHostQueuePresentation: true,
      helpers: HELPERS,
      ...props,
    }))
  })

  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('HostReservationList reservation purpose display', () => {
  it('renders dinner beside the guest name without truncating a long name', () => {
    const { container, unmount } = renderList([{
      id: 'res-1',
      guestName: 'Konstantina Spanomitrou',
      guests: 3,
      time: '20:30',
      date: '2026-07-10',
      status: 'Pending',
      tableNumber: 'T110',
      reservationPurpose: 'dinner',
    }])

    const guestName = container.querySelector('.host-reservation-card-guest')
    const purposeLabel = container.querySelector('.host-reservation-card-purpose-label')

    expect(guestName?.textContent).toBe('Konstantina Spanomitrou')
    expect(purposeLabel?.textContent).toBe('🍽️ Dinner')
    expect(container.querySelector('.host-reservation-card-name-purpose')?.contains(guestName)).toBe(true)
    expect(container.querySelector('.host-reservation-card-name-purpose')?.contains(purposeLabel)).toBe(true)

    unmount()
  })

  it('renders drinks from notes metadata and keeps guest type badge distinct', () => {
    const { container, unmount } = renderList([{
      id: 'res-2',
      guestName: 'Andreas Nicolaou',
      guests: 2,
      time: '21:00',
      date: '2026-07-10',
      status: 'Pending',
      tableNumber: 'T12',
      notes: 'Bar table\n@@CUSTOMER@@VIP\n@@PURPOSE@@drinks',
      customerType: 'VIP',
    }])

    expect(container.querySelector('.host-reservation-card-guest')?.textContent).toBe('Andreas Nicolaou')
    expect(container.querySelector('.host-reservation-card-purpose-label')?.textContent).toBe('🍸 Drinks')
    expect(container.querySelector('.host-reservation-guest-type-badge')?.textContent).toBe('VIP')
    expect(container.querySelector('.host-reservation-card-status-pill')?.textContent).not.toBe('VIP')

    unmount()
  })
})
