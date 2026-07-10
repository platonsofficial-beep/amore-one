/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { ObjectDragManager } from './ObjectDragManager'

function createDragManager() {
  const onMoveObject = vi.fn()
  const onDragComplete = vi.fn()
  const manager = new ObjectDragManager({
    snapService: {
      applyIfEnabled: (position) => position,
    },
    boundaryService: {
      clampToFloor: (position) => position,
    },
    getClientToWorld: (clientX, clientY) => ({ x: clientX, y: clientY }),
    onMoveObject,
    onDragComplete,
  })

  return { manager, onMoveObject, onDragComplete }
}

function createPointerEvent(type, { pointerId = 1, clientX = 0, clientY = 0, pointerType = 'touch' } = {}) {
  return {
    type,
    pointerId,
    clientX,
    clientY,
    pointerType,
    button: 0,
    cancelable: true,
    preventDefault: vi.fn(),
    currentTarget: {
      classList: { add: vi.fn(), remove: vi.fn() },
      style: {},
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    },
  }
}

describe('ObjectDragManager', () => {
  it('commits table position during move and on release', () => {
    const { manager, onMoveObject, onDragComplete } = createDragManager()
    const object = {
      id: 'table-1',
      position: { x: 100, y: 120 },
      size: { width: 80, height: 80 },
      rotation: 0,
    }

    const down = createPointerEvent('pointerdown', { clientX: 110, clientY: 130 })
    manager.start(down, object, { snapEnabled: true, floorBounds: {} })

    const move = createPointerEvent('pointermove', { clientX: 160, clientY: 180 })
    manager.move(move)

    expect(onMoveObject).toHaveBeenCalledWith('table-1', { x: 150, y: 170 })

    const up = createPointerEvent('pointerup', { clientX: 160, clientY: 180 })
    manager.end(up)

    expect(onMoveObject).toHaveBeenLastCalledWith('table-1', { x: 150, y: 170 })
    expect(onDragComplete).toHaveBeenCalledWith({ objectId: 'table-1', moved: true })
    expect(down.preventDefault).toHaveBeenCalled()
    expect(move.preventDefault).toHaveBeenCalled()
  })

  it('does not commit a move when the pointer is released without movement', () => {
    const { manager, onMoveObject, onDragComplete } = createDragManager()
    const object = {
      id: 'table-2',
      position: { x: 40, y: 40 },
      size: { width: 80, height: 80 },
      rotation: 15,
    }

    const down = createPointerEvent('pointerdown', { clientX: 50, clientY: 50 })
    manager.start(down, object, { snapEnabled: true, floorBounds: {} })

    const up = createPointerEvent('pointerup', { clientX: 50, clientY: 50 })
    const moved = manager.end(up)

    expect(moved).toBe(false)
    expect(onMoveObject).not.toHaveBeenCalled()
    expect(onDragComplete).toHaveBeenCalledWith({ objectId: 'table-2', moved: false })
  })
})
