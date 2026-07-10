/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import {
  beginHostFloorDirectTableTap,
  cancelHostFloorDirectTableTap,
  completeHostFloorDirectTableTap,
  createHostFloorTableTapRegistry,
  isHostFloorTableTapConsumedForTable,
  shouldSkipViewportTableTap,
} from './hostFloorTableTapSession'
import { HOST_FLOOR_TAP_MOVE_THRESHOLD_PX } from './hostFloorPointerInteraction'

describe('hostFloorTableTapSession', () => {
  it('activates on direct pointerdown + pointerup through session completion', () => {
    const registry = createHostFloorTableTapRegistry()
    const onTableClick = vi.fn()

    beginHostFloorDirectTableTap(registry, {
      pointerId: 1,
      tableId: 't10',
      clientX: 20,
      clientY: 30,
    })

    const result = completeHostFloorDirectTableTap(registry, {
      pointerId: 1,
      clientX: 22,
      clientY: 31,
    })

    expect(result.activated).toBe(true)
    expect(result.tableId).toBe('t10')
    onTableClick({ table: { id: 't10' } })
    expect(onTableClick).toHaveBeenCalledTimes(1)
  })

  it('activates when tap starts on pax text child coordinates', () => {
    const registry = createHostFloorTableTapRegistry()

    beginHostFloorDirectTableTap(registry, {
      pointerId: 2,
      tableId: 't10',
      clientX: 40,
      clientY: 50,
    })

    const result = completeHostFloorDirectTableTap(registry, {
      pointerId: 2,
      clientX: 41,
      clientY: 51,
    })

    expect(result.activated).toBe(true)
  })

  it('activates when tap starts on chair dot coordinates', () => {
    const registry = createHostFloorTableTapRegistry()

    beginHostFloorDirectTableTap(registry, {
      pointerId: 3,
      tableId: 't10',
      clientX: 60,
      clientY: 70,
    })

    const result = completeHostFloorDirectTableTap(registry, {
      pointerId: 3,
      clientX: 62,
      clientY: 72,
    })

    expect(result.activated).toBe(true)
  })

  it('activates when movement stays under the 10px threshold', () => {
    const registry = createHostFloorTableTapRegistry()

    beginHostFloorDirectTableTap(registry, {
      pointerId: 4,
      tableId: 't10',
      clientX: 0,
      clientY: 0,
    })

    const result = completeHostFloorDirectTableTap(registry, {
      pointerId: 4,
      clientX: HOST_FLOOR_TAP_MOVE_THRESHOLD_PX,
      clientY: 0,
    })

    expect(result.activated).toBe(true)
  })

  it('cancels when movement exceeds the threshold', () => {
    const registry = createHostFloorTableTapRegistry()

    beginHostFloorDirectTableTap(registry, {
      pointerId: 5,
      tableId: 't10',
      clientX: 0,
      clientY: 0,
    })

    const result = completeHostFloorDirectTableTap(registry, {
      pointerId: 5,
      clientX: HOST_FLOOR_TAP_MOVE_THRESHOLD_PX + 5,
      clientY: 0,
    })

    expect(result.activated).toBe(false)
  })

  it('marks consumed taps so viewport fallback skips duplicate activation', () => {
    const registry = createHostFloorTableTapRegistry()

    beginHostFloorDirectTableTap(registry, {
      pointerId: 6,
      tableId: 't10',
      clientX: 10,
      clientY: 10,
    })
    completeHostFloorDirectTableTap(registry, {
      pointerId: 6,
      clientX: 11,
      clientY: 11,
    })

    expect(isHostFloorTableTapConsumedForTable(registry, 't10')).toBe(true)
    expect(shouldSkipViewportTableTap(registry, { tableId: 't10' })).toBe(true)
  })

  it('prevents touchend + pointerup double activation for the same table', () => {
    const registry = createHostFloorTableTapRegistry()
    const onTableClick = vi.fn()

    beginHostFloorDirectTableTap(registry, {
      pointerId: 7,
      tableId: 't10',
      clientX: 5,
      clientY: 5,
    })

    const touchResult = completeHostFloorDirectTableTap(registry, {
      pointerId: 7,
      clientX: 6,
      clientY: 6,
    })
    expect(touchResult.activated).toBe(true)
    onTableClick({ table: { id: 't10' } })

    const pointerResult = completeHostFloorDirectTableTap(registry, {
      pointerId: 7,
      clientX: 6,
      clientY: 6,
    })
    if (pointerResult.activated) onTableClick({ table: { id: 't10' } })

    expect(onTableClick).toHaveBeenCalledTimes(1)
  })

  it('cleans up cancelled pointer sessions', () => {
    const registry = createHostFloorTableTapRegistry()

    beginHostFloorDirectTableTap(registry, {
      pointerId: 9,
      tableId: 't10',
      clientX: 1,
      clientY: 1,
    })
    cancelHostFloorDirectTableTap(registry, 9)

    const result = completeHostFloorDirectTableTap(registry, {
      pointerId: 9,
      clientX: 2,
      clientY: 2,
    })

    expect(result.activated).toBe(false)
  })
})
