import { describe, expect, it } from 'vitest'
import {
  DINING_TIMER_EXTERNAL_LABEL_CANVAS_BOUNDS,
  DINING_TIMER_EXTERNAL_LABEL_SAFETY_GAP_PERCENT,
  buildDiningTimerExternalLabelPlacementMap,
  compareTablesForDiningTimerLabelPlacement,
  getDiningTimerExternalLabelBounds,
  getFloorTableBounds,
  isDiningTimerExternalLabelPlacementBlocked,
  resolveDiningTimerExternalLabelPlacement,
} from './hostDiningTimerExternalLabelPlacement'

function buildTable(overrides = {}) {
  return {
    id: 'table-1',
    label: '1',
    x: 50,
    y: 50,
    ...overrides,
  }
}

describe('resolveDiningTimerExternalLabelPlacement', () => {
  it('prefers below when there is plenty of space', () => {
    const table = buildTable({ id: 't-open', x: 50, y: 40 })
    expect(resolveDiningTimerExternalLabelPlacement({
      table,
      allTables: [table],
    })).toEqual({ position: 'below', offsetX: 0, offsetY: 0 })
  })

  it('places above when the table is near the bottom edge', () => {
    const table = buildTable({ id: 't-bottom', x: 50, y: 92 })
    expect(resolveDiningTimerExternalLabelPlacement({
      table,
      allTables: [table],
      canvasBounds: DINING_TIMER_EXTERNAL_LABEL_CANVAS_BOUNDS,
    }).position).toBe('above')
  })

  it('places above when another table sits directly below', () => {
    const upper = buildTable({ id: 't22', x: 48, y: 28 })
    const lower = buildTable({ id: 't23', x: 48, y: 42 })
    expect(resolveDiningTimerExternalLabelPlacement({
      table: upper,
      allTables: [upper, lower],
    }).position).toBe('above')
  })

  it('keeps below when another table sits directly above', () => {
    const upper = buildTable({ id: 't22', x: 48, y: 28 })
    const lower = buildTable({ id: 't23', x: 48, y: 42 })
    expect(resolveDiningTimerExternalLabelPlacement({
      table: lower,
      allTables: [upper, lower],
    }).position).toBe('below')
  })

  it('uses a horizontal fallback when both vertical positions are blocked', () => {
    const center = buildTable({ id: 't-middle', x: 50, y: 50 })
    const above = buildTable({ id: 't-above', x: 50, y: 36 })
    const below = buildTable({ id: 't-below', x: 50, y: 64 })
    const placement = resolveDiningTimerExternalLabelPlacement({
      table: center,
      allTables: [above, center, below],
    })

    expect(['left', 'right']).toContain(placement.position)
  })

  it('avoids right overflow near the right edge', () => {
    const table = buildTable({ id: 't-right', x: 94, y: 50 })
    const placement = resolveDiningTimerExternalLabelPlacement({
      table,
      allTables: [table],
    })

    expect(placement.position).not.toBe('right')
  })

  it('avoids left overflow near the left edge', () => {
    const table = buildTable({ id: 't-left', x: 6, y: 50 })
    const placement = resolveDiningTimerExternalLabelPlacement({
      table,
      allTables: [table],
    })

    expect(placement.position).not.toBe('left')
  })

  it('is deterministic for the same geometry', () => {
    const tables = [
      buildTable({ id: 't22', x: 48, y: 28 }),
      buildTable({ id: 't23', x: 48, y: 42 }),
      buildTable({ id: 't24', x: 48, y: 56 }),
    ]

    const first = buildDiningTimerExternalLabelPlacementMap({
      labelTables: tables.map((table) => ({ id: table.id, table })),
      allTables: tables,
    })
    const second = buildDiningTimerExternalLabelPlacementMap({
      labelTables: tables.map((table) => ({ id: table.id, table })),
      allTables: tables,
    })

    expect([...first.entries()]).toEqual([...second.entries()])
  })

  it('respects the safety gap against neighbouring tables', () => {
    const table = buildTable({ id: 't-gap', x: 50, y: 40 })
    const neighbour = buildTable({ id: 't-neighbour', x: 50, y: 49.8 })
    const belowBounds = getDiningTimerExternalLabelBounds(
      getFloorTableBounds(table),
      { position: 'below', offsetX: 0, offsetY: 0 },
    )

    expect(isDiningTimerExternalLabelPlacementBlocked({
      table,
      placement: { position: 'below', offsetX: 0, offsetY: 0 },
      allTables: [table, neighbour],
    })).toBe(true)

    expect(belowBounds.top).toBeGreaterThan(getFloorTableBounds(table).bottom)
  })
})

describe('buildDiningTimerExternalLabelPlacementMap', () => {
  it('keeps two vertically stacked labels from overlapping', () => {
    const upper = buildTable({ id: 't22', x: 48, y: 28 })
    const lower = buildTable({ id: 't23', x: 48, y: 42 })
    const placements = buildDiningTimerExternalLabelPlacementMap({
      labelTables: [
        { id: upper.id, table: upper },
        { id: lower.id, table: lower },
      ],
      allTables: [upper, lower],
    })

    const upperBounds = getDiningTimerExternalLabelBounds(
      getFloorTableBounds(upper),
      placements.get(upper.id),
    )
    const lowerBounds = getDiningTimerExternalLabelBounds(
      getFloorTableBounds(lower),
      placements.get(lower.id),
    )

    expect(placements.get(upper.id)?.position).toBe('above')
    expect(placements.get(lower.id)?.position).toBe('below')
    expect(upperBounds.bottom).toBeLessThanOrEqual(lowerBounds.top - DINING_TIMER_EXTERNAL_LABEL_SAFETY_GAP_PERCENT * 0.4)
  })

  it('keeps three vertically stacked labels from overlapping', () => {
    const tables = [
      buildTable({ id: 't22', x: 48, y: 24 }),
      buildTable({ id: 't23', x: 48, y: 40 }),
      buildTable({ id: 't24', x: 48, y: 56 }),
    ]
    const placements = buildDiningTimerExternalLabelPlacementMap({
      labelTables: tables.map((table) => ({ id: table.id, table })),
      allTables: tables,
    })

    const bounds = tables.map((table) => getDiningTimerExternalLabelBounds(
      getFloorTableBounds(table),
      placements.get(table.id),
    ))

    expect(new Set([...placements.values()].map((entry) => entry.position)).size).toBeGreaterThan(1)
    expect(bounds[0].bottom).toBeLessThan(bounds[1].top)
    expect(bounds[1].bottom).toBeLessThan(bounds[2].top)
  })

  it('assigns independent positions for multi-table reservations with identical values', () => {
    const tables = [
      buildTable({ id: 't101', x: 30, y: 35 }),
      buildTable({ id: 't102', x: 62, y: 35 }),
    ]
    const placements = buildDiningTimerExternalLabelPlacementMap({
      labelTables: tables.map((table) => ({ id: table.id, table })),
      allTables: tables,
    })

    expect(placements.get('t101')).toEqual({ position: 'below', offsetX: 0, offsetY: 0 })
    expect(placements.get('t102')).toEqual({ position: 'below', offsetX: 0, offsetY: 0 })
  })

  it('orders tables deterministically by y then x then id', () => {
    const tables = [
      buildTable({ id: 'b', x: 60, y: 40 }),
      buildTable({ id: 'a', x: 40, y: 40 }),
      buildTable({ id: 'c', x: 50, y: 20 }),
    ]

    const sorted = [...tables].sort(compareTablesForDiningTimerLabelPlacement)
    expect(sorted.map((table) => table.id)).toEqual(['c', 'a', 'b'])
  })
})
