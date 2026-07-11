/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { FloorPlanLegend } from './FloorPlanLegend'
import { HOST_FLOOR_PLAN_LEGEND_ITEMS } from '../../lib/hostFloorPlanLegend'

describe('FloorPlanLegend', () => {
  let container
  let root

  afterEach(() => {
    root?.unmount()
    container?.remove()
  })

  function renderLegend(props = {}) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root.render(createElement(FloorPlanLegend, {
        items: HOST_FLOOR_PLAN_LEGEND_ITEMS,
        variant: 'compact',
        ...props,
      }))
    })
  }

  it('renders all five host legend items', () => {
    renderLegend()

    const chips = container.querySelectorAll('.floor-plan-legend-chip')
    expect(chips).toHaveLength(5)
    expect([...chips].map((chip) => chip.textContent.trim())).toEqual([
      'Available',
      'Reserved',
      'Seated',
      'Problem',
      'Combined',
    ])
  })

  it('renders the host border-color tone classes', () => {
    renderLegend()

    expect(container.querySelector('.tone-host-available')).toBeTruthy()
    expect(container.querySelector('.tone-host-reserved')).toBeTruthy()
    expect(container.querySelector('.tone-host-seated')).toBeTruthy()
    expect(container.querySelector('.tone-host-problem')).toBeTruthy()
    expect(container.querySelector('.tone-host-combined')).toBeTruthy()
  })

  it('uses compact dot markers and a horizontal layout class', () => {
    renderLegend()

    expect(container.querySelector('.floor-plan-legend.is-compact')).toBeTruthy()
    expect(container.querySelectorAll('.floor-plan-legend-dot')).toHaveLength(5)
    expect(container.querySelectorAll('.floor-plan-legend-swatch')).toHaveLength(0)
  })

  it('supports compact horizontal layout classes for responsive wrapping', () => {
    renderLegend()

    const legend = container.querySelector('.floor-plan-legend.is-compact')
    expect(legend).toBeTruthy()
    expect(legend.classList.contains('is-compact')).toBe(true)
    expect(legend.querySelectorAll('.floor-plan-legend-chip')).toHaveLength(5)
  })

  it('renders nothing when items are empty', () => {
    renderLegend({ items: [] })
    expect(container.querySelector('.floor-plan-legend')).toBeNull()
  })
})
