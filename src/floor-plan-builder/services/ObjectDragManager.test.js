/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
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
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

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
    vi.runAllTimers()

    expect(onMoveObject).toHaveBeenCalledWith(
      'table-1',
      { x: 150, y: 170 },
      expect.objectContaining({ historyKey: expect.any(String) }),
    )
    expect(move.preventDefault).toHaveBeenCalled()

    const up = createPointerEvent('pointerup', { clientX: 160, clientY: 180 })
    manager.end(up)

    expect(onMoveObject).toHaveBeenLastCalledWith(
      'table-1',
      { x: 150, y: 170 },
      expect.objectContaining({ historyKey: onMoveObject.mock.calls[0][2].historyKey }),
    )
    expect(onDragComplete).toHaveBeenCalledWith({ objectId: 'table-1', moved: true })
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

  it('disposes safely when no drag is active', () => {
    const { manager } = createDragManager()
    expect(() => manager.dispose()).not.toThrow()
    expect(() => manager.cancel()).not.toThrow()
    expect(manager.isActive()).toBe(false)
  })

  it('reverts a committed drag when a second finger takes over', () => {
    const { manager, onMoveObject, onDragComplete } = createDragManager()
    const object = {
      id: 'table-pinch',
      position: { x: 10, y: 20 },
      size: { width: 80, height: 80 },
      rotation: 0,
    }
    manager.start(createPointerEvent('pointerdown', { clientX: 10, clientY: 20 }), object, {
      snapEnabled: false,
      floorBounds: {},
    })
    manager.move(createPointerEvent('pointermove', { clientX: 40, clientY: 50 }))
    vi.runAllTimers()
    expect(onMoveObject).toHaveBeenCalled()

    expect(manager.abort()).toBe(true)
    expect(onMoveObject).toHaveBeenLastCalledWith(
      'table-pinch',
      { x: 10, y: 20 },
      expect.objectContaining({ historyKey: expect.any(String) }),
    )
    expect(onDragComplete).not.toHaveBeenCalled()
    expect(manager.isActive()).toBe(false)
  })

  it('keeps the first drag when a second finger lands, so abort can revert it', () => {
    const { manager, onMoveObject, onDragComplete } = createDragManager()
    const object = {
      id: 'table-pinch',
      position: { x: 10, y: 20 },
      size: { width: 80, height: 80 },
      rotation: 0,
    }
    manager.start(createPointerEvent('pointerdown', { clientX: 10, clientY: 20 }), object, {
      snapEnabled: false,
      floorBounds: {},
    })
    manager.move(createPointerEvent('pointermove', { clientX: 40, clientY: 50 }))
    vi.runAllTimers()

    const secondFinger = createPointerEvent('pointerdown', { pointerId: 2, clientX: 80, clientY: 90 })
    secondFinger.isPrimary = false
    expect(manager.start(secondFinger, {
      ...object,
      position: { x: 40, y: 50 },
    }, { snapEnabled: false, floorBounds: {} })).toBe(false)

    expect(manager.abort()).toBe(true)
    expect(onMoveObject).toHaveBeenLastCalledWith(
      'table-pinch',
      { x: 10, y: 20 },
      expect.objectContaining({ historyKey: expect.any(String) }),
    )
    expect(onDragComplete).not.toHaveBeenCalled()
    expect(manager.isActive()).toBe(false)
  })

  it('reverts a drag when the browser cancels the pointer', () => {
    const onDragCancelled = vi.fn()
    const { manager, onMoveObject, onDragComplete } = createDragManager()
    manager.onDragCancelled = onDragCancelled
    const object = {
      id: 'table-cancel',
      position: { x: 10, y: 20 },
      size: { width: 80, height: 80 },
      rotation: 0,
    }
    manager.start(createPointerEvent('pointerdown', { clientX: 10, clientY: 20 }), object, {
      snapEnabled: false,
      floorBounds: {},
    })
    manager.move(createPointerEvent('pointermove', { clientX: 48, clientY: 36 }))
    vi.runAllTimers()

    window.dispatchEvent(new PointerEvent('pointercancel', {
      pointerId: 1,
      bubbles: true,
      cancelable: true,
    }))

    expect(onDragCancelled).toHaveBeenCalledTimes(1)
    expect(onMoveObject).toHaveBeenLastCalledWith(
      'table-cancel',
      { x: 10, y: 20 },
      expect.objectContaining({ historyKey: expect.any(String) }),
    )
    expect(onDragComplete).not.toHaveBeenCalled()
    expect(manager.isActive()).toBe(false)
  })

  it('does not preventDefault on pointerdown start', () => {
    const { manager } = createDragManager()
    const down = createPointerEvent('pointerdown', { clientX: 50, clientY: 50 })
    manager.start(down, {
      id: 'table-3',
      position: { x: 0, y: 0 },
      size: { width: 80, height: 80 },
    }, { snapEnabled: true, floorBounds: {} })

    expect(down.preventDefault).not.toHaveBeenCalled()
  })
})
