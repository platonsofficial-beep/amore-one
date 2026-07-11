/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MobileReservationsHostView } from './MobileReservationsHostView'
import { HOST_LIST_SECTION_COLLAPSE_STORAGE_KEY } from '../../reservations/hostReservationListUtils'

vi.mock('../../../lib/mobileHostReservationUtils', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    isMobileHostSplitViewport: () => true,
  }
})

function renderSplitHostView(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(MobileReservationsHostView, {
      reservations: [
        {
          id: 'up-1',
          guestName: 'Maria',
          guests: 4,
          time: '20:00',
          date: '2026-07-10',
          status: 'Confirmed',
          tableNumber: '15+16',
        },
        {
          id: 'prob-cancel',
          guestName: 'No Show',
          guests: 2,
          time: '17:00',
          date: '2026-07-10',
          status: 'Not Shown',
        },
        {
          id: 'up-unassigned',
          guestName: 'Alex',
          guests: 4,
          time: '20:30',
          date: '2026-07-10',
          status: 'Pending',
        },
        {
          id: 'prob-1',
          guestName: 'Late Guest',
          guests: 2,
          time: '18:00',
          date: '2026-07-10',
          status: 'Confirmed',
        },
      ],
      todayKey: '2026-07-10',
      nowMinutes: 19 * 60 + 15,
      renderRightPane: () => createElement('div', { 'data-testid': 'right-pane' }),
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

describe('MobileReservationsHostView compact tablet list', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('does not render old filter tabs in split layout', () => {
    const { container, unmount } = renderSplitHostView()

    expect(container.querySelector('.mobile-host-reservations-tabs')).toBeNull()
    expect(container.querySelector('.mobile-host-reservations-tab')).toBeNull()
    expect(container.querySelector('.mobile-host-reservation-row.is-compact')).toBeNull()

    unmount()
  })

  it('renders collapsible operational sections', () => {
    const { container, unmount } = renderSplitHostView()

    expect(container.querySelector('.host-reservation-list-sections')).not.toBeNull()
    expect(container.querySelector('.host-reservation-group-label')?.textContent).toBe('Upcoming')

    unmount()
  })

  it('expands Upcoming and Problems by default', () => {
    window.localStorage.setItem(
      HOST_LIST_SECTION_COLLAPSE_STORAGE_KEY,
      JSON.stringify(['arrived', 'seated', 'completed']),
    )

    const { container, unmount } = renderSplitHostView()

    const headers = [...container.querySelectorAll('.host-reservation-group-header')]
    const upcoming = headers.find((node) => node.textContent?.includes('Upcoming'))
    const problems = headers.find((node) => node.textContent?.includes('Problems'))

    expect(upcoming?.getAttribute('aria-expanded')).toBe('true')
    expect(problems?.getAttribute('aria-expanded')).toBe('true')

    const seated = headers.find((node) => node.textContent?.includes('Seated'))
    if (seated) {
      expect(seated.getAttribute('aria-expanded')).toBe('false')
    }

    unmount()
  })

  it('uses compact status labels that do not truncate', () => {
    const { container, unmount } = renderSplitHostView()

    const latePill = container.querySelector('.host-reservation-card-status-pill')
    expect(latePill?.textContent).not.toContain('LATE BOOK')
    expect(latePill?.textContent?.trim()).toBe('Late')

    unmount()
  })

  it('renders assigned table metadata as compact queue labels', () => {
    const { container, unmount } = renderSplitHostView()

    expect(container.textContent).toContain('👤4   🍽 T15 + T16')

    unmount()
  })

  it('renders unassigned metadata as compact queue labels', () => {
    const { container, unmount } = renderSplitHostView()

    expect(container.textContent).toContain('👤4   🍽 Unassigned')

    unmount()
  })

  it('keeps the overflow menu accessible', () => {
    const { container, unmount } = renderSplitHostView()

    expect(container.querySelector('.host-reservation-card-row-menu')).not.toBeNull()

    unmount()
  })
})
