/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MobileReservationsHostView } from './MobileReservationsHostView'
import { HOST_LIST_SECTION_COLLAPSE_STORAGE_KEY } from '../../reservations/hostReservationListUtils'
import {
  HOST_QUEUE_SORT_STORAGE_KEY,
  writeHostQueueSortPreference,
} from '../../../lib/hostQueuePersistence'

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
          id: 'up-2',
          guestName: 'Sam',
          guests: 2,
          time: '20:00',
          date: '2026-07-10',
          status: 'Pending',
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
    writeHostQueueSortPreference('time-asc')
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

  it('uses compact late status labels in sentence case', () => {
    const { container, unmount } = renderSplitHostView()

    const latePill = container.querySelector('.host-reservation-card-status-pill')
    expect(latePill?.textContent).not.toContain('LATE')
    expect(latePill?.textContent?.trim()).toBe('Late 75m')

    unmount()
  })

  it('renders compact service summary metrics with icons in the header', () => {
    const { container, unmount } = renderSplitHostView()

    const summary = container.querySelector('.host-queue-service-summary')
    expect(summary).not.toBeNull()
    expect(summary?.querySelectorAll('.host-queue-metric-icon')).toHaveLength(3)
    expect(summary?.textContent).toContain('expected')
    expect(summary?.textContent).toMatch(/\d+\/\d+/)
    expect(summary?.textContent).toContain('in house')

    unmount()
  })

  it('groups reservations by exact time when time sort is active', () => {
    const { container, unmount } = renderSplitHostView()

    const timeGroups = container.querySelectorAll('.host-queue-time-group-header')
    expect(timeGroups.length).toBeGreaterThan(0)
    expect([...timeGroups].some((node) => node.textContent?.includes('20:00'))).toBe(true)

    const groupedRows = container.querySelectorAll('.host-reservation-card.is-time-grouped')
    expect(groupedRows.length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.host-reservation-card.is-time-grouped .host-reservation-card-time').length).toBe(0)
    expect(container.querySelectorAll('.host-reservation-card-main.is-time-grouped').length).toBeGreaterThan(0)

    const groupedRow = groupedRows[0]
    expect(groupedRow.querySelector('.host-reservation-card-guest')?.textContent?.length).toBeGreaterThan(0)
    expect(groupedRow.querySelector('.host-queue-row-meta-line')?.textContent).toMatch(/👤 \d+ guests/)

    unmount()
  })

  it('uses the same reservation row layout for table sort', () => {
    writeHostQueueSortPreference('table')
    const { container, unmount } = renderSplitHostView()

    expect(container.querySelectorAll('.host-queue-time-group-header').length).toBe(0)
    expect(container.querySelectorAll('.host-reservation-card-main.is-time-grouped').length).toBe(0)
    expect(container.querySelectorAll('.host-reservation-card-time').length).toBeGreaterThan(0)
    expect(container.querySelector('.host-reservation-card-status-pill')).toBeTruthy()
    expect(container.querySelector('.host-reservation-card-row-menu')).toBeTruthy()

    unmount()
  })

  it('renders assigned table metadata with separator spacing', () => {
    const { container, unmount } = renderSplitHostView()

    expect(container.textContent).toContain('👤 4 guests  •  🍽 T15 + T16')

    unmount()
  })

  it('renders unassigned metadata with separator spacing', () => {
    const { container, unmount } = renderSplitHostView()

    expect(container.textContent).toContain('👤 4 guests  •  🍽 Unassigned')

    unmount()
  })

  it('keeps the overflow menu accessible', () => {
    const { container, unmount } = renderSplitHostView()

    expect(container.querySelector('.host-reservation-card-row-menu')).not.toBeNull()

    unmount()
  })

  it('renders list transition wrapper for filter changes', () => {
    const { container, unmount } = renderSplitHostView()

    expect(container.querySelector('.host-queue-list-transition')).not.toBeNull()

    unmount()
  })

  it('shows compact empty state with clear filters action', () => {
    const { container, unmount } = renderSplitHostView({
      reservations: [],
    })

    expect(container.textContent).toContain('No reservations match the current filters.')
    expect(container.querySelector('.host-queue-toolbar-clear')).not.toBeNull()

    unmount()
  })
})

describe('MobileReservationsHostView clear filters behavior', () => {
  beforeEach(() => {
    window.localStorage.clear()
    writeHostQueueSortPreference('name-asc')
  })

  it('preserves selected seating and sort when clearing filters', async () => {
    const seatings = [
      {
        id: 'dinner-1',
        name: 'Dinner 1',
        startTime: '19:00',
        durationMinutes: 120,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        sortOrder: 0,
        isActive: true,
      },
    ]

    const { container, unmount } = renderSplitHostView({
      reservations: [],
      reservationSeatings: seatings,
      selectedSeating: seatings[0],
      selectedServiceSeatingId: 'dinner-1',
    })

    const clearButton = container.querySelector('.host-queue-toolbar-clear')
    expect(clearButton).not.toBeNull()

    await act(async () => {
      clearButton?.click()
    })

    expect(window.localStorage.getItem(HOST_QUEUE_SORT_STORAGE_KEY)).toBe('name-asc')

    unmount()
  })
})
