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

describe('online reservation badge', () => {
  it('shows Online on a reservation that came from the public link', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    act(() => {
      root.render(createElement(HostReservationList, {
        reservations: [{
          id: 'res-online',
          guestName: 'Elena Costa',
          guests: 4,
          time: '20:00',
          date: '2026-07-10',
          status: 'Confirmed',
          tableNumber: '12',
          source: 'online',
        }],
        nowMinutes: 18 * 60,
        todayKey: '2026-07-10',
        listFilter: 'All',
        isSelected: () => false,
        onOpenEdit: vi.fn(),
        onDragStart: vi.fn(),
        onDragEnd: vi.fn(),
        helpers: HELPERS,
      }))
    })
    expect(container.querySelector('.reservation-online-badge')?.textContent).toBe('Online')
    act(() => root.unmount())
    container.remove()
  })
})
