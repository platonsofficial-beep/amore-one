/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import {
  buildHostFilterCounts,
  countHostListFilterMatches,
  filterHostListReservations,
  HOST_LIST_OPERATIONAL_FILTERS,
  hostListFilterMatch,
  isReservationArrivedForHostFilter,
  isReservationUpcomingForHostFilter,
  sortHostListFilterReservations,
} from './hostServiceDashboard'
import { isReservationLate } from './reservationHostStatus'
import { getHostListEmptyState } from './reservationServiceIntelligence'

const TODAY = '2026-07-10'
const NOW = 19 * 60 + 15

const reservations = [
  { id: 'up-future', date: TODAY, time: '20:00', guests: 2, status: 'Confirmed' },
  { id: 'up-late', date: TODAY, time: '19:00', guests: 2, status: 'Confirmed' },
  { id: 'up-late-booking', date: TODAY, time: '19:30', guests: 2, status: 'Late Booking' },
  { id: 'arrived-waiting', date: TODAY, time: '19:00', guests: 2, status: 'Waiting' },
  { id: 'arrived-seated', date: TODAY, time: '19:15', guests: 4, status: 'Checked In' },
  { id: 'completed', date: TODAY, time: '18:30', guests: 2, status: 'Checked Out', updatedAt: '2026-07-10T18:45:00.000Z' },
  { id: 'completed-older', date: TODAY, time: '17:30', guests: 2, status: 'Checked Out', updatedAt: '2026-07-10T17:40:00.000Z' },
  { id: 'problem-no-show', date: TODAY, time: '18:00', guests: 2, status: 'Not Shown' },
  { id: 'problem-cancelled', date: TODAY, time: '18:15', guests: 2, status: 'Cancelled' },
]

function renderFilterHarness({ listFilter = 'Upcoming', filterCounts = {}, onChange = () => {} } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement('div', { className: 'host-reservation-list-filters' },
      HOST_LIST_OPERATIONAL_FILTERS.map((filter) => {
        const count = Number(filterCounts[filter]) || 0
        const isActive = listFilter === filter

        return createElement('button', {
          key: filter,
          type: 'button',
          className: `host-list-filter-chip${isActive ? ' is-active active' : ''}`,
          'aria-pressed': isActive,
          onClick: () => onChange(filter),
        },
          createElement('span', { className: 'host-list-filter-chip-label' }, filter),
          createElement('span', { className: 'host-list-filter-chip-count' }, String(count)),
        )
      }),
    ))
  })

  return { container, root }
}

describe('host operational list filters', () => {
  it('defines four full-label operational filters', () => {
    expect(HOST_LIST_OPERATIONAL_FILTERS).toEqual([
      'Upcoming',
      'Arrived',
      'Completed',
      'Problems',
    ])
  })

  it('shows only upcoming reservations in Upcoming filter', () => {
    const upcoming = filterHostListReservations(reservations, 'Upcoming', NOW, TODAY)

    expect(upcoming.map((entry) => entry.id)).toEqual([
      'up-future',
      'up-late',
      'up-late-booking',
    ])
  })

  it('sorts Upcoming with late reservations before future reservations', () => {
    const sorted = sortHostListFilterReservations(
      filterHostListReservations(reservations, 'Upcoming', NOW, TODAY),
      'Upcoming',
      NOW,
      TODAY,
    )

    expect(sorted.map((entry) => entry.id)).toEqual([
      'up-late',
      'up-late-booking',
      'up-future',
    ])
  })

  it('shows arrived, waiting, and in-house reservations in Arrived filter', () => {
    const arrived = filterHostListReservations(reservations, 'Arrived', NOW, TODAY)

    expect(arrived.map((entry) => entry.id)).toEqual([
      'arrived-waiting',
      'arrived-seated',
    ])
    expect(isReservationArrivedForHostFilter({ status: 'Waiting' })).toBe(true)
    expect(isReservationArrivedForHostFilter({ status: 'Checked In' })).toBe(true)
    expect(isReservationUpcomingForHostFilter({ status: 'Confirmed', date: TODAY, time: '20:00' }, NOW, TODAY)).toBe(true)
  })

  it('sorts Arrived with waiting before seated guests', () => {
    const sorted = sortHostListFilterReservations(
      filterHostListReservations(reservations, 'Arrived', NOW, TODAY),
      'Arrived',
      NOW,
      TODAY,
    )

    expect(sorted.map((entry) => entry.id)).toEqual([
      'arrived-waiting',
      'arrived-seated',
    ])
  })

  it('shows only completed reservations in Completed filter', () => {
    const completed = filterHostListReservations(reservations, 'Completed', NOW, TODAY)
    expect(completed.map((entry) => entry.id)).toEqual(['completed', 'completed-older'])
  })

  it('sorts Completed by most recently completed first', () => {
    const sorted = sortHostListFilterReservations(
      filterHostListReservations(reservations, 'Completed', NOW, TODAY),
      'Completed',
      NOW,
      TODAY,
    )

    expect(sorted.map((entry) => entry.id)).toEqual(['completed', 'completed-older'])
  })

  it('sorts problem reservations by severity before delay', () => {
    const sorted = sortHostListFilterReservations([
      { id: 'arrived-waiting', date: TODAY, time: '19:00', status: 'Waiting' },
      { id: 'up-late', date: TODAY, time: '19:00', status: 'Confirmed' },
    ], 'Problems', NOW, TODAY)

    expect(sorted.map((entry) => entry.id)).toEqual(['up-late', 'arrived-waiting'])
  })

  it('reuses existing problem classification for Problems filter', () => {
    expect(isReservationLate(
      reservations.find((entry) => entry.id === 'up-late'),
      NOW,
      TODAY,
    )).toBe(true)

    const problems = sortHostListFilterReservations(
      filterHostListReservations(reservations, 'Problems', NOW, TODAY),
      'Problems',
      NOW,
      TODAY,
    )

    expect(problems.map((entry) => entry.id)).toEqual([
      'problem-no-show',
      'problem-cancelled',
      'up-late',
      'up-late-booking',
      'arrived-waiting',
    ])
  })

  it('keeps count badges aligned with visible group lengths', () => {
    const counts = buildHostFilterCounts(reservations, NOW, TODAY)

    HOST_LIST_OPERATIONAL_FILTERS.forEach((filter) => {
      expect(counts[filter]).toBe(filterHostListReservations(reservations, filter, NOW, TODAY).length)
    })
  })

  it('removes a reservation from Upcoming after status changes to Arrived', () => {
    const reservation = { id: 'move-me', date: TODAY, time: '20:00', guests: 2, status: 'Confirmed' }
    const before = hostListFilterMatch(reservation, 'Upcoming', NOW, TODAY)
    const afterReservation = { ...reservation, status: 'Waiting' }

    expect(before).toBe(true)
    expect(hostListFilterMatch(afterReservation, 'Upcoming', NOW, TODAY)).toBe(false)
    expect(hostListFilterMatch(afterReservation, 'Arrived', NOW, TODAY)).toBe(true)
  })

  it('moves a reservation to Completed after checkout', () => {
    const reservation = { id: 'seat-me', date: TODAY, time: '19:00', guests: 2, status: 'Checked In' }

    expect(hostListFilterMatch(reservation, 'Arrived', NOW, TODAY)).toBe(true)
    expect(hostListFilterMatch({ ...reservation, status: 'Checked Out' }, 'Completed', NOW, TODAY)).toBe(true)
    expect(hostListFilterMatch({ ...reservation, status: 'Checked Out' }, 'Arrived', NOW, TODAY)).toBe(false)
  })

  it('applies search within the selected filter scope', () => {
    const upcoming = filterHostListReservations(reservations, 'Upcoming', NOW, TODAY)
    const searched = upcoming.filter((reservation) => (
      `${reservation.id}`.includes('late')
    ))

    expect(searched.map((entry) => entry.id)).toEqual(['up-late', 'up-late-booking'])
  })

  it('returns compact empty states for each filter', () => {
    expect(getHostListEmptyState({ filter: 'Upcoming' }).title).toBe('No upcoming reservations')
    expect(getHostListEmptyState({ filter: 'Arrived' }).title).toBe('No arrived guests')
    expect(getHostListEmptyState({ filter: 'Completed' }).title).toBe('No completed reservations')
    expect(getHostListEmptyState({ filter: 'Problems' }).title).toBe('No current problems')
  })

  it('renders full filter labels without truncation and exposes selected state', () => {
    const { container, root } = renderFilterHarness({
      listFilter: 'Arrived',
      filterCounts: buildHostFilterCounts(reservations, NOW, TODAY),
    })

    const labels = [...container.querySelectorAll('.host-list-filter-chip-label')]
      .map((node) => node.textContent)

    expect(labels).toEqual(HOST_LIST_OPERATIONAL_FILTERS)
    labels.forEach((label) => {
      expect(label.endsWith('...')).toBe(false)
      expect(label.length).toBeGreaterThan(3)
    })

    const activeButton = container.querySelector('.host-list-filter-chip.is-active')
    expect(activeButton?.getAttribute('aria-pressed')).toBe('true')
    expect(activeButton?.querySelector('.host-list-filter-chip-label')?.textContent).toBe('Arrived')

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})
