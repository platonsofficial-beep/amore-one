/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { createElement, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { useCanvasViewport } from './useCanvasViewport'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const floorBounds = {
  minX: 0,
  minY: 0,
  maxX: 1000,
  maxY: 700,
  centerX: 500,
  centerY: 350,
  width: 1000,
  height: 700,
}

function Harness({ onCamera }) {
  const ref = useRef(null)
  const [camera, setCamera] = useState({ x: 500, y: 350, zoom: 1 })
  const controls = useCanvasViewport({
    camera,
    onCameraChange: (next) => {
      setCamera(next)
      onCamera(next)
    },
    containerRef: ref,
    floorBounds,
  })

  useEffect(() => {
    if (ref.current) ref.current.__controls = controls
  })

  return createElement('div', {
    ref,
    className: 'fpb-canvas-viewport',
    onPointerDown: (event) => controls.tryStartPan(event, 'select'),
    onPointerMove: (event) => controls.handlePointerMove(event),
    onPointerUp: (event) => controls.handlePointerUp(event),
    onPointerCancel: (event) => controls.handlePointerCancel(event),
  })
}

function renderViewport() {
  const cameras = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(Harness, { onCamera: (next) => cameras.push(next) }))
  })
  const viewport = container.querySelector('.fpb-canvas-viewport')
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 400 })
  Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 300 })
  viewport.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 400,
    height: 300,
    right: 400,
    bottom: 300,
    x: 0,
    y: 0,
    toJSON() { return {} },
  })
  return {
    cameras,
    viewport,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function pointer(type, { pointerId = 1, pointerType = 'touch', button = 0, clientX = 0, clientY = 0, isPrimary = true } = {}) {
  const event = new PointerEvent(type, {
    pointerId,
    pointerType,
    button,
    clientX,
    clientY,
    bubbles: true,
    cancelable: true,
  })
  Object.defineProperty(event, 'isPrimary', { value: isPrimary })
  return event
}

describe('editor touch pan and pinch', () => {
  it('pans on a second touch move and leaves mouse drags alone', () => {
    const view = renderViewport()
    act(() => {
      view.viewport.dispatchEvent(pointer('pointerdown', { clientX: 20, clientY: 20 }))
      view.viewport.dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 20 }))
    })
    expect(view.cameras.at(-1)).toEqual({ x: 500, y: 350, zoom: 1 })

    act(() => {
      view.viewport.dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 50 }))
    })
    expect(view.cameras.at(-1).x).not.toBe(500)
    expect(view.cameras.at(-1).zoom).toBe(1)
    const panned = view.cameras.at(-1)

    act(() => {
      view.viewport.dispatchEvent(pointer('pointerup', { clientX: 100, clientY: 50 }))
      view.viewport.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse', clientX: 20, clientY: 20 }))
      view.viewport.dispatchEvent(pointer('pointermove', { pointerType: 'mouse', clientX: 80, clientY: 20 }))
      view.viewport.dispatchEvent(pointer('pointermove', { pointerType: 'mouse', clientX: 140, clientY: 60 }))
    })
    expect(view.cameras.at(-1)).toEqual(panned)
    view.unmount()
  })

  it('stops a touch pan when the pointer is cancelled', () => {
    const view = renderViewport()
    act(() => {
      view.viewport.dispatchEvent(pointer('pointerdown', { clientX: 20, clientY: 20 }))
      view.viewport.dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 20 }))
      view.viewport.dispatchEvent(pointer('pointermove', { clientX: 90, clientY: 20 }))
      view.viewport.dispatchEvent(pointer('pointercancel', { clientX: 90, clientY: 20 }))
    })
    const cancelled = view.cameras.at(-1)
    act(() => {
      view.viewport.dispatchEvent(pointer('pointermove', { clientX: 160, clientY: 80 }))
    })
    expect(view.cameras.at(-1)).toEqual(cancelled)
    view.unmount()
  })

  it('zooms from two fingers and drops a one-finger pan', () => {
    const view = renderViewport()
    const controls = view.viewport.__controls
    act(() => {
      view.viewport.dispatchEvent(pointer('pointerdown', { clientX: 30, clientY: 30 }))
      view.viewport.dispatchEvent(pointer('pointermove', { clientX: 50, clientY: 30 }))
      view.viewport.dispatchEvent(pointer('pointermove', { clientX: 90, clientY: 30 }))
    })
    expect(controls.isPanning()).toBe(true)

    let started = false
    act(() => {
      started = controls.tryStartPinch({
        touches: [
          { clientX: 120, clientY: 140 },
          { clientX: 200, clientY: 140 },
        ],
      })
      controls.handlePinchMove({
        touches: [
          { clientX: 60, clientY: 140 },
          { clientX: 280, clientY: 160 },
        ],
      })
    })

    expect(started).toBe(true)
    expect(controls.isPanning()).toBe(false)
    expect(controls.isPinching()).toBe(true)
    expect(view.cameras.at(-1).zoom).toBeGreaterThan(1)
    view.unmount()
  })
})
