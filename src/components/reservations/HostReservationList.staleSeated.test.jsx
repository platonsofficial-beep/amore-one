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
      todayKey: '2026-07-08',
      listFilter: 'All',
      isSelected: () => false,
      onOpenEdit: vi.fn(),
      onStatusChange: vi.fn(),
      onDragStart: vi.fn(),
      onDragEnd: vi.fn(),
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

describe('HostReservationList stale seated focus', () => {
  it('expands the seated section and shows the still-seated label', () => {
    const { container, unmount } = renderList([{
      id: 'marika',
      guestName: 'Marika',
      guests: 2,
      time: '20:00',
      date: '2026-07-08',
      status: 'Checked In',
    }], {
      focusReservationId: 'marika',
      serviceTodayKey: '2026-10-26',
    })

    const seatedHeader = [...container.querySelectorAll('.host-reservation-group-header')]
      .find((button) => button.textContent?.includes('Seated'))

    expect(seatedHeader?.getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain('Marika')
    expect(container.textContent).toContain('still seated from 8 Jul')
    expect(container.querySelector('[data-reservation-id="marika"]')?.className)
      .toContain('is-attention-focus')

    unmount()
  })

  it('expands completed auto-closed rows so the badge and undo are visible', () => {
    const { container, unmount } = renderList([{
      id: 'closed-guest',
      guestName: 'Closed Guest',
      guests: 2,
      time: '17:00',
      date: '2026-07-08',
      status: 'Checked Out',
      autoClosedAt: '2026-07-09T02:00:00.000Z',
    }], {
      canUndoAutoClose: true,
      onUndoAutoClose: vi.fn(),
    })

    const completedHeader = [...container.querySelectorAll('.host-reservation-group-header')]
      .find((button) => button.textContent?.includes('Completed'))

    expect(completedHeader?.getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain('κλείστηκε αυτόματα / Auto-closed')
    expect(container.querySelector('.reservation-auto-closed-undo')?.textContent).toBe('Undo')

    unmount()
  })
})
