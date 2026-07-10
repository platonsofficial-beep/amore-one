/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { HostReservationList } from '../components/reservations/HostReservationList'

const helpers = {
  formatReservationGuestName: (name) => `${name ?? 'Guest'}`.trim() || 'Guest',
  getHostReservationWarnings: () => [],
}

describe('HostReservationList operational sections', () => {
  it('renders collapsible sections instead of flat filter lists', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(HostReservationList, {
        reservations: [
          { id: '1', guestName: 'Maria', guests: 2, time: '19:00', date: '2026-07-10', status: 'Confirmed', tableNumber: '12' },
        ],
        nowMinutes: 18 * 60,
        todayKey: '2026-07-10',
        listFilter: 'All',
        isSelected: () => false,
        onOpenEdit: vi.fn(),
        onStatusChange: vi.fn(),
        onDragStart: vi.fn(),
        onDragEnd: vi.fn(),
        helpers,
      }))
    })

    expect(container.querySelector('.host-reservation-group')).not.toBeNull()
    expect(container.querySelector('.host-reservation-group-label')?.textContent).toBe('Upcoming')
    expect(container.querySelectorAll('.host-reservation-card')).toHaveLength(1)
    expect(container.querySelector('.host-reservation-card-meta')?.textContent).toBe('2 • T12')
    expect(container.querySelector('.host-reservation-card-status-pill')?.textContent?.trim()).toBe('Confirmed')

    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('shows the default empty state copy when no reservations match', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(HostReservationList, {
        reservations: [],
        nowMinutes: 18 * 60,
        todayKey: '2026-07-10',
        listFilter: 'All',
        isSelected: () => false,
        onOpenEdit: vi.fn(),
        onStatusChange: vi.fn(),
        onDragStart: vi.fn(),
        onDragEnd: vi.fn(),
        helpers,
      }))
    })

    expect(container.textContent).toContain('No reservations in this view')

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})
