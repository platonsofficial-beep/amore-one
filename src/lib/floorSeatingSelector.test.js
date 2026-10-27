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

    expect(container.querySelectorAll('.floor-plan-legend')).toHaveLength(1)
    expect(container.querySelector('.floor-seating-selector-legend')).toBeTruthy()
    expect(container.querySelector('.floor-seating-legend-popover')).toBeNull()
    expect(container.querySelectorAll('.floor-plan-legend-chip')).toHaveLength(2)
  })

  it('mounts the colour legend inside the info popover only after it opens on a short landscape', () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = (query) => ({
      matches: query.includes('max-height: 520px'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    try {
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

      expect(container.querySelector('.floor-seating-selector-legend')).toBeNull()
      expect(container.querySelector('.floor-seating-legend-disclosure-btn')).toBeTruthy()
      expect(container.querySelectorAll('.floor-plan-legend-chip')).toHaveLength(0)

      const details = container.querySelector('details')
      act(() => {
        details.open = true
        details.dispatchEvent(new Event('toggle', { bubbles: true }))
      })

      const chips = container.querySelectorAll('.floor-seating-legend-popover .floor-plan-legend-chip')
      expect(chips).toHaveLength(2)
      expect([...chips].map((chip) => chip.textContent)).toEqual(['Available', 'Reserved'])
      expect(container.querySelector('.floor-seating-selector-legend')).toBeNull()
      expect(container.querySelectorAll('.floor-plan-legend')).toHaveLength(1)
    } finally {
      window.matchMedia = originalMatchMedia
    }
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
              reservedTables: 17,
              seatedTables: 5,
              inHouseGuests: 9,
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
      .toBe('👥35 · 🍽17 · 🪑5 · 👤9')
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
              reservedTables: 17,
              seatedTables: 5,
              inHouseGuests: 9,
            },
          },
        },
      }))
    })

    expect(container.querySelector('.floor-seating-selector-chip-metrics')).toBeTruthy()
  })
})
