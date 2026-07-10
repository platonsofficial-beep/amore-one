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
  findHostFloorTableAtPoint,
  findHostFloorTableFromEvent,
  findHostFloorTableInComposedPath,
  getHostFloorPointerDistance,
  isHostFloorTapGesture,
  isInteractiveHostFloorTarget,
  readFloorTableIdFromNode,
  resolveHostFloorTableState,
  resolveHostFloorTableTarget,
  shouldCaptureHostFloorPointer,
  shouldStartHostFloorPan,
} from './hostFloorPointerInteraction'

function buildTableDom(tableId = 't14', label = 'T10') {
  const node = document.createElement('div')
  node.className = 'floor-table-node'
  node.dataset.tableId = tableId
  node.dataset.floorTableId = tableId
  node.dataset.floorTableLabel = label

  const surface = document.createElement('div')
  surface.className = 'floor-table-node-surface'

  const pax = document.createElement('span')
  pax.className = 'floor-table-pax'
  pax.textContent = '4 pax'

  surface.appendChild(pax)
  node.appendChild(surface)
  document.body.appendChild(node)

  return { node, surface, pax }
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

  it('reads stable table ids from data-floor-table-id', () => {
    const { node } = buildTableDom('uuid-14', 'T10')
    expect(readFloorTableIdFromNode(node)).toBe('uuid-14')
    expect(node.classList.contains('floor-table-node')).toBe(true)
    expect(node.dataset.floorTableId).toBe('uuid-14')
    expect(node.dataset.floorTableLabel).toBe('T10')
    node.remove()
  })

  it('stores table identity from pointerdown on the table wrapper', () => {
    const { node } = buildTableDom('t14')
    const event = { pointerId: 7, clientX: 40, clientY: 50, target: node }

    const state = beginHostFloorPointerInteraction(event)

    expect(state.mode).toBe(HOST_FLOOR_POINTER_MODE.TABLE_PENDING)
    expect(state.tableId).toBe('t14')
    expect(shouldCaptureHostFloorPointer(state)).toBe(false)
    node.remove()
  })

  it('stores table identity when pointerdown starts on a child pax label', () => {
    const { pax } = buildTableDom('t22')
    const event = { pointerId: 3, clientX: 12, clientY: 18, target: pax }

    const state = beginHostFloorPointerInteraction(event)

    expect(state.mode).toBe(HOST_FLOOR_POINTER_MODE.TABLE_PENDING)
    expect(state.tableId).toBe('t22')
    pax.closest('.floor-table-node')?.remove()
  })

  it('resolves table from composedPath when the target is a canvas child', () => {
    const { node, surface } = buildTableDom('t33', 'T10')
    const canvas = document.createElement('div')
    canvas.className = 'floor-plan-canvas'
    document.body.appendChild(canvas)

    const event = {
      target: canvas,
      composedPath: () => [surface, node, canvas],
    }

    expect(findHostFloorTableInComposedPath(event)?.tableId).toBe('t33')
    expect(findHostFloorTableFromEvent(event)?.tableId).toBe('t33')

    node.remove()
    canvas.remove()
  })

  it('resolves table from elementsFromPoint when the target misses the table node', () => {
    const { node } = buildTableDom('t44', 'T10')
    node.getBoundingClientRect = () => ({
      left: 10,
      top: 20,
      right: 110,
      bottom: 120,
      width: 100,
      height: 100,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    })

    const canvas = document.createElement('div')
    canvas.className = 'floor-plan-canvas'
    document.body.appendChild(canvas)

    document.elementsFromPoint = vi.fn(() => [canvas, node])

    const result = findHostFloorTableAtPoint(60, 70)
    expect(result?.tableId).toBe('t44')

    node.remove()
    canvas.remove()
    delete document.elementsFromPoint
  })

  it('completes table tap from pointerup even when the target is a child label', () => {
    const { pax } = buildTableDom('t22')
    const down = { pointerId: 3, clientX: 12, clientY: 18, target: pax }
    const pending = beginHostFloorPointerInteraction(down)
    const up = { pointerId: 3, clientX: 14, clientY: 19 }

    const { tableTap } = completeHostFloorPointerInteraction(pending, up)

    expect(tableTap).toEqual({ tableId: 't22' })
    pax.closest('.floor-table-node')?.remove()
  })

  it('cancels table activation when movement exceeds the threshold', () => {
    const { node } = buildTableDom('t14')
    const down = { pointerId: 2, clientX: 10, clientY: 10, target: node }
    let state = beginHostFloorPointerInteraction(down)
    state = advanceHostFloorPointerInteraction(state, {
      pointerId: 2,
      clientX: 10 + HOST_FLOOR_TAP_MOVE_THRESHOLD_PX + 4,
      clientY: 10,
    })

    expect(state.mode).toBe(HOST_FLOOR_POINTER_MODE.IDLE)

    const { tableTap } = completeHostFloorPointerInteraction(
      beginHostFloorPointerInteraction(down),
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
    const down = { pointerId: 5, clientX: 100, clientY: 100, target: canvas }
    let state = beginHostFloorPointerInteraction(down, { originX: 4, originY: 8 })

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
      { pointerId: 1, clientX: 20, clientY: 30, target: pax },
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

  it('resolves captured table ids with string normalization', () => {
    const tableStates = [{ table: { id: 14 }, reservation: null }]
    expect(resolveHostFloorTableState(tableStates, '14')?.table.id).toBe(14)
  })

  it('detects non-table interactive targets without treating tables as blockers', () => {
    const seating = document.createElement('button')
    seating.className = 'floor-seating-selector-chip'
    const canvas = document.createElement('div')

    expect(isInteractiveHostFloorTarget(seating)).toBe(true)
    expect(isInteractiveHostFloorTarget(canvas)).toBe(false)
    expect(beginHostFloorPointerInteraction(
      { pointerId: 1, clientX: 0, clientY: 0, target: canvas },
    ).mode).toBe(HOST_FLOOR_POINTER_MODE.PAN_PENDING)
    expect(beginHostFloorPointerInteraction(
      { pointerId: 1, clientX: 0, clientY: 0, target: seating },
    )).toEqual(createIdleHostFloorPointerState())
  })

  it('still resolves child targets through closest fallback', () => {
    const { pax } = buildTableDom('child-id')
    expect(resolveHostFloorTableTarget(pax)?.tableId).toBe('child-id')
    pax.closest('.floor-table-node')?.remove()
  })
})
