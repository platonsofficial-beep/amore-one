/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { TableTransformManager } from './TableTransformManager'

function createElement() {
  const element = document.createElement('div')
  element.className = 'fpb-canvas-object'
  const body = document.createElement('div')
  body.className = 'fpb-canvas-object-body'
  body.setAttribute('data-fpb-object-body', '')
  element.appendChild(body)
  document.body.appendChild(element)
  return element
}

describe('TableTransformManager', () => {
  let manager
  let onTransformTable
  let element

  beforeEach(() => {
    vi.useFakeTimers()
    onTransformTable = vi.fn()
    manager = new TableTransformManager({
      getClientToWorld: () => ({ x: 300, y: 300 }),
      onTransformTable,
    })
    element = createElement()
    manager.element = element
    manager.session = {
      mode: 'resize',
      objectId: 'table-1',
      pointerId: 1,
      handle: 'se',
      shape: 'square',
      floorBounds: { minX: 0, minY: 0, maxX: 2200, maxY: 1400 },
      origin: {
        position: { x: 100, y: 100 },
        size: { width: 200, height: 200 },
        rotation: 0,
      },
      preview: {
        position: { x: 100, y: 100 },
        size: { width: 240, height: 240 },
        rotation: 0,
      },
      lastCommitted: {
        position: { x: 100, y: 100 },
        size: { width: 200, height: 200 },
        rotation: 0,
      },
    }
    element.classList.add('is-transforming')
  })

  afterEach(() => {
    vi.useRealTimers()
    element?.remove()
    manager.dispose()
  })

  it('updates canonical object size through onTransformTable during resize move', () => {
    manager.scheduleCommit({
      position: { x: 100, y: 100 },
      size: { width: 240, height: 240 },
      rotation: 0,
    })

    vi.runAllTimers()

    expect(onTransformTable).toHaveBeenCalledWith('table-1', {
      position: { x: 100, y: 100 },
      size: { width: 240, height: 240 },
      rotation: 0,
    })
    expect(element.style.width).toBe('')
    expect(element.style.height).toBe('')
  })

  it('does not apply inline width/height preview styles during resize', () => {
    manager.scheduleCommit({
      position: { x: 100, y: 100 },
      size: { width: 240, height: 240 },
      rotation: 0,
    })

    vi.runAllTimers()

    expect(element.style.width).toBe('')
    expect(element.style.height).toBe('')
    expect(element.style.left).toBe('')
    expect(element.style.top).toBe('')
    const body = element.querySelector('[data-fpb-object-body]')
    expect(body.style.transform).toBe('')
  })

  it('flushes pending commit before ending the session', () => {
    manager.rafId = 42
    manager.session.preview = {
      position: { x: 120, y: 120 },
      size: { width: 180, height: 180 },
      rotation: 0,
    }

    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame')
    manager.end({ pointerId: 1 })

    expect(cancelSpy).toHaveBeenCalledWith(42)
    expect(onTransformTable).toHaveBeenCalledWith('table-1', {
      position: { x: 120, y: 120 },
      size: { width: 180, height: 180 },
      rotation: 0,
    })
    expect(element.style.width).toBe('')
    expect(element.classList.contains('is-transforming')).toBe(false)
  })

  it('does not duplicate commit on pointerup when preview already committed', () => {
    manager.session.preview = {
      position: { x: 100, y: 100 },
      size: { width: 240, height: 240 },
      rotation: 0,
    }
    manager.session.lastCommitted = {
      position: { x: 100, y: 100 },
      size: { width: 240, height: 240 },
      rotation: 0,
    }

    manager.end({ pointerId: 1 })

    expect(onTransformTable).not.toHaveBeenCalled()
    expect(element.style.width).toBe('')
  })

  it('cleans up session styles on pointercancel', () => {
    manager.end({ pointerId: 1, type: 'pointercancel' })

    expect(element.style.width).toBe('')
    expect(element.classList.contains('is-transforming')).toBe(false)
  })
})
