/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import {
  HOST_FLOOR_POINTER_MODE,
  HOST_FLOOR_TAP_MOVE_THRESHOLD_PX,
  advanceHostFloorPointerInteraction,
  beginHostFloorPointerInteraction,
  completeHostFloorPointerInteraction,
  createIdleHostFloorPointerState,
  getHostFloorPointerDistance,
  isHostFloorTapGesture,
  isInteractiveHostFloorTarget,
  resolveHostFloorTableState,
  resolveHostFloorTableTarget,
  shouldCaptureHostFloorPointer,
  shouldStartHostFloorPan,
} from './hostFloorPointerInteraction'

function buildTableDom(tableId = 't14') {
  const node = document.createElement('div')
  node.className = 'floor-table-node'
  node.dataset.tableId = tableId
  node.dataset.floorTableId = tableId

  const surface = document.createElement('div')
  surface.className = 'floor-table-node-surface'

  const pax = document.createElement('span')
  pax.className = 'floor-table-pax'
  pax.textContent = '4 pax'

  surface.appendChild(pax)
  node.appendChild(surface)
  document.body.appendChild(node)

  return { node, pax }
}

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

  it('stores table identity from pointerdown on the table wrapper', () => {
    const { node } = buildTableDom('t14')
    const event = { pointerId: 7, clientX: 40, clientY: 50 }

    const state = beginHostFloorPointerInteraction(event, node)

    expect(state.mode).toBe(HOST_FLOOR_POINTER_MODE.TABLE_PENDING)
    expect(state.tableId).toBe('t14')
    expect(shouldCaptureHostFloorPointer(state)).toBe(false)
    node.remove()
  })

  it('stores table identity when pointerdown starts on a child pax label', () => {
    const { pax } = buildTableDom('t22')
    const event = { pointerId: 3, clientX: 12, clientY: 18 }

    const state = beginHostFloorPointerInteraction(event, pax)

    expect(state.mode).toBe(HOST_FLOOR_POINTER_MODE.TABLE_PENDING)
    expect(state.tableId).toBe('t22')
    pax.closest('.floor-table-node')?.remove()
  })

  it('completes table tap from pointerup even when the target is a child label', () => {
    const { pax } = buildTableDom('t22')
    const down = { pointerId: 3, clientX: 12, clientY: 18, target: pax }
    const pending = beginHostFloorPointerInteraction(down, pax)
    const up = { pointerId: 3, clientX: 14, clientY: 19 }

    const { tableTap } = completeHostFloorPointerInteraction(pending, up)

    expect(tableTap).toEqual({ tableId: 't22' })
    pax.closest('.floor-table-node')?.remove()
  })

  it('cancels table activation when movement exceeds the threshold', () => {
    const { node } = buildTableDom('t14')
    const down = { pointerId: 2, clientX: 10, clientY: 10 }
    let state = beginHostFloorPointerInteraction(down, node)
    state = advanceHostFloorPointerInteraction(state, {
      pointerId: 2,
      clientX: 10 + HOST_FLOOR_TAP_MOVE_THRESHOLD_PX + 4,
      clientY: 10,
    })

    expect(state.mode).toBe(HOST_FLOOR_POINTER_MODE.IDLE)

    const { tableTap } = completeHostFloorPointerInteraction(
      beginHostFloorPointerInteraction(down, node),
      {
        pointerId: 2,
        clientX: 10 + HOST_FLOOR_TAP_MOVE_THRESHOLD_PX + 4,
        clientY: 10,
      },
    )
    expect(tableTap).toBeNull()
    node.remove()
  })

  it('starts empty-canvas pan only after the drag threshold', () => {
    const canvas = document.createElement('div')
    const down = { pointerId: 5, clientX: 100, clientY: 100 }
    let state = beginHostFloorPointerInteraction(down, canvas, { originX: 4, originY: 8 })

    expect(state.mode).toBe(HOST_FLOOR_POINTER_MODE.PAN_PENDING)
    expect(shouldCaptureHostFloorPointer(state)).toBe(true)

    state = advanceHostFloorPointerInteraction(state, {
      pointerId: 5,
      clientX: 100,
      clientY: 100,
    })
    expect(state.mode).toBe(HOST_FLOOR_POINTER_MODE.PAN_PENDING)

    state = advanceHostFloorPointerInteraction(state, {
      pointerId: 5,
      clientX: 130,
      clientY: 120,
    })
    expect(state.mode).toBe(HOST_FLOOR_POINTER_MODE.PANNING)
  })

  it('invokes the table callback once for a completed viewport tap', () => {
    const onTableClick = vi.fn()
    const tableStates = [{ table: { id: 't14' }, reservation: null }]
    const { pax } = buildTableDom('t14')

    const pending = beginHostFloorPointerInteraction(
      { pointerId: 1, clientX: 20, clientY: 30 },
      pax,
    )
    const { tableTap } = completeHostFloorPointerInteraction(
      pending,
      { pointerId: 1, clientX: 21, clientY: 31 },
    )

    const tableState = resolveHostFloorTableState(tableStates, tableTap.tableId)
    onTableClick(tableState, { pointerId: 1 })

    expect(onTableClick).toHaveBeenCalledTimes(1)
    expect(onTableClick.mock.calls[0][0].table.id).toBe('t14')
    pax.closest('.floor-table-node')?.remove()
  })

  it('detects non-table interactive targets without treating tables as blockers', () => {
    const seating = document.createElement('button')
    seating.className = 'floor-seating-selector-chip'
    const canvas = document.createElement('div')

    expect(isInteractiveHostFloorTarget(seating)).toBe(true)
    expect(isInteractiveHostFloorTarget(canvas)).toBe(false)
    expect(beginHostFloorPointerInteraction(
      { pointerId: 1, clientX: 0, clientY: 0 },
      canvas,
    ).mode).toBe(HOST_FLOOR_POINTER_MODE.PAN_PENDING)
    expect(beginHostFloorPointerInteraction(
      { pointerId: 1, clientX: 0, clientY: 0 },
      seating,
    )).toEqual(createIdleHostFloorPointerState())
  })
})
