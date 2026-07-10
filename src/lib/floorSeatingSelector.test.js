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
})
