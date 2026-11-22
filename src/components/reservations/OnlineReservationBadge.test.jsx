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

  it('lays out confirm and call on their own even row with a phone icon', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    act(() => {
      root.render(createElement(HostReservationList, {
        reservations: [{
          id: 'res-call',
          guestName: 'Elena Costa',
          guests: 4,
          phone: '+30 210 000 0000',
          time: '20:00',
          date: '2026-07-10',
          status: 'Pending',
          tableNumber: '12',
          source: 'online',
          confirmationMethod: 'venue_call',
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
    const rows = [...container.querySelectorAll('.host-reservation-quick-row')]
    expect(rows).toHaveLength(2)
    expect([...rows[0].querySelectorAll('.host-reservation-card-quick-action')].map((node) => node.textContent)).toEqual(['Confirm', 'Call'])
    expect(rows[0].querySelector('a.is-call .reservation-call-icon')).toBeTruthy()
    expect([...rows[1].querySelectorAll('.host-reservation-card-quick-action')].map((node) => node.textContent)).toEqual(['Arrived', 'Seat', 'No-show'])
    const call = rows[0].querySelector('a.is-call')
    expect(call?.getAttribute('href')).toBe('tel:+302100000000')
    act(() => root.unmount())
    container.remove()
  })
})
