import { describe, expect, it } from 'vitest'
import {
  HOST_FLOOR_TAP_MOVE_THRESHOLD_PX,
  getHostFloorPointerDistance,
  isHostFloorTapGesture,
  isInteractiveHostFloorTarget,
  shouldStartHostFloorPan,
} from './hostFloorPointerInteraction'

describe('hostFloorPointerInteraction', () => {
  it('treats tiny movement as a tap', () => {
    const start = { clientX: 100, clientY: 200, pointerId: 1 }
    const end = { clientX: 104, clientY: 203, pointerId: 1 }

    expect(isHostFloorTapGesture(start, end)).toBe(true)
    expect(shouldStartHostFloorPan(getHostFloorPointerDistance(start, end))).toBe(false)
  })

  it('treats meaningful movement as a drag', () => {
    const start = { clientX: 100, clientY: 200, pointerId: 1 }
    const end = { clientX: 130, clientY: 220, pointerId: 1 }

    expect(isHostFloorTapGesture(start, end)).toBe(false)
    expect(shouldStartHostFloorPan(getHostFloorPointerDistance(start, end))).toBe(true)
  })

  it('does not treat mismatched pointer ids as a tap', () => {
    const start = { clientX: 100, clientY: 200, pointerId: 1 }
    const end = { clientX: 101, clientY: 201, pointerId: 2 }

    expect(isHostFloorTapGesture(start, end)).toBe(false)
  })

  it('uses the shared host floor tap threshold', () => {
    expect(HOST_FLOOR_TAP_MOVE_THRESHOLD_PX).toBe(10)
  })

  it('detects interactive host floor targets', () => {
    const table = {
      closest: (selector) => (selector === '.floor-table-node' ? table : null),
    }
    const seating = {
      closest: (selector) => (
        selector.includes('floor-seating-selector') ? seating : null
      ),
    }
    const canvas = {
      closest: () => null,
    }

    expect(isInteractiveHostFloorTarget(table)).toBe(true)
    expect(isInteractiveHostFloorTarget(seating)).toBe(true)
    expect(isInteractiveHostFloorTarget(canvas)).toBe(false)
  })
})
