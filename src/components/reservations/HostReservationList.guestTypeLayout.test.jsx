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

describe('HostReservationList guest type layout', () => {
  it('renders guest type badge below the guest name, not inside the title row', () => {
    const { container, unmount } = renderList([{
      id: 'res-1',
      guestName: 'Konstantina Spanomitrou',
      guests: 3,
      time: '20:30',
      date: '2026-07-10',
      status: 'Confirmed',
      tableNumber: 'T110',
      notes: 'Window seat\n@@CUSTOMER@@House Guest',
      customerType: 'House Guest',
    }])

    const titleRow = container.querySelector('.host-reservation-card-title-row')
    const badgeRow = container.querySelector('.host-reservation-card-guest-type-row')
    const guestName = container.querySelector('.host-reservation-card-guest')
    const details = container.querySelector('.host-reservation-card-details')

    expect(titleRow?.querySelector('.host-reservation-guest-type-badge')).toBeNull()
    expect(badgeRow?.querySelector('.host-reservation-guest-type-badge')?.textContent).toBe('HOUSE GUEST')
    expect(guestName?.textContent).toBe('Konstantina Spanomitrou')
    expect(details?.textContent).toContain('3 guests')
    expect(details?.textContent).toContain('T110')

    unmount()
  })

  it('does not render a guest type row for Normal reservations', () => {
    const { container, unmount } = renderList([{
      id: 'res-2',
      guestName: 'Regular Guest',
      guests: 2,
      time: '19:00',
      date: '2026-07-10',
      status: 'Pending',
      tableNumber: 'T12',
      customerType: 'Regular',
    }])

    expect(container.querySelector('.host-reservation-card-guest-type-row')).toBeNull()

    unmount()
  })
})
