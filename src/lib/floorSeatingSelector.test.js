/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FloorSeatingSelector } from '../components/floor/FloorSeatingSelector'

const SEATINGS = [
  {
    id: 'brunch',
    name: 'Brunch',
    startTime: '10:00',
    durationMinutes: 120,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    isActive: true,
  },
  {
    id: 'dinner',
    name: 'Dinner 1',
    startTime: '19:00',
    durationMinutes: 120,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    isActive: true,
  },
]

describe('FloorSeatingSelector', () => {
  let container
  let root

  afterEach(() => {
    root?.unmount()
    container?.remove()
  })

  it('updates selected seating when a pill is clicked', () => {
    const onSelect = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root.render(createElement(FloorSeatingSelector, {
        seatings: SEATINGS,
        selectedSeatingId: 'brunch',
        onSelect,
      }))
    })

    const dinnerChip = container.querySelectorAll('.floor-seating-selector-chip')[1]
    act(() => {
      dinnerChip.click()
    })

    expect(onSelect).toHaveBeenCalledWith('dinner')
  })

  it('marks the active seating pill with the active class', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root.render(createElement(FloorSeatingSelector, {
        seatings: SEATINGS,
        selectedSeatingId: 'dinner',
        onSelect: () => {},
      }))
    })

    const chips = [...container.querySelectorAll('.floor-seating-selector-chip')]
    expect(chips[0].classList.contains('is-active')).toBe(false)
    expect(chips[1].classList.contains('is-active')).toBe(true)
  })

  it('renders the floor plan legend beside seating chips when legendItems are provided', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root.render(createElement(FloorSeatingSelector, {
        seatings: SEATINGS,
        selectedSeatingId: 'brunch',
        onSelect: () => {},
        legendItems: [
          { id: 'available', label: 'Available', tone: 'host-available' },
          { id: 'reserved', label: 'Reserved', tone: 'host-reserved' },
        ],
      }))
    })

    expect(container.querySelector('.floor-seating-selector-legend')).toBeTruthy()
    expect(container.querySelectorAll('.floor-plan-legend-chip')).toHaveLength(2)
  })

  it('renders seating chip operational metrics line', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root.render(createElement(FloorSeatingSelector, {
        seatings: SEATINGS,
        selectedSeatingId: 'brunch',
        onSelect: () => {},
        summaries: {
          brunch: {
            tableAvailability: {
              availableTables: 19,
              totalTables: 37,
              unavailableTables: 18,
            },
            operationalMetrics: {
              expectedGuests: 35,
              expectedAssignedTables: 17,
              inHouseGuests: 2,
            },
          },
        },
      }))
    })

    expect(container.querySelector('.floor-seating-selector-chip-count')?.textContent)
      .toBe('19/37 available')
    expect(container.querySelector('.floor-seating-selector-chip-count')?.getAttribute('aria-label'))
      .toBe('19 of 37 tables available')
    expect(container.querySelector('.floor-seating-selector-chip-metrics')?.textContent)
      .toBe('👥35 · 🍽17 · 🪑2')
  })

  it('includes responsive hide rule for seating chip metrics', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root.render(createElement(FloorSeatingSelector, {
        seatings: SEATINGS,
        selectedSeatingId: 'brunch',
        onSelect: () => {},
        summaries: {
          brunch: {
            tableAvailability: {
              availableTables: 19,
              totalTables: 37,
              unavailableTables: 18,
            },
            operationalMetrics: {
              expectedGuests: 35,
              expectedAssignedTables: 17,
              inHouseGuests: 2,
            },
          },
        },
      }))
    })

    expect(container.querySelector('.floor-seating-selector-chip-metrics')).toBeTruthy()
  })
})
