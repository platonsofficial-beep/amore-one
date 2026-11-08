import { describe, expect, it } from 'vitest'
import {
  cameraForPinch,
  isEmptyCanvasTarget,
  panExceededThreshold,
  shouldArmTouchBackgroundPan,
} from './editorTouchGestures'

function target(selectorMatch) {
  return {
    closest: (selector) => (selector.includes(selectorMatch) ? {} : null),
  }
}

describe('editor touch gestures', () => {
  it('arms a one-finger pan on empty floor and ignores tables, handles, and toolbar', () => {
    expect(shouldArmTouchBackgroundPan({
      pointerType: 'touch',
      button: 0,
      isPrimary: true,
      target: target('floor'),
    })).toBe(true)

    expect(shouldArmTouchBackgroundPan({
      pointerType: 'mouse',
      button: 0,
      target: target('floor'),
    })).toBe(false)

    expect(shouldArmTouchBackgroundPan({
      pointerType: 'touch',
      button: 0,
      isPrimary: false,
      target: target('floor'),
    })).toBe(false)

    expect(shouldArmTouchBackgroundPan({
      pointerType: 'touch',
      button: 0,
      target: { closest: (selector) => (selector.includes('fpb-canvas-object') ? {} : null) },
    })).toBe(false)

    expect(shouldArmTouchBackgroundPan({
      pointerType: 'touch',
      button: 0,
      target: { closest: (selector) => (selector.includes('fpb-handle') ? {} : null) },
    })).toBe(false)

    expect(isEmptyCanvasTarget({
      closest: (selector) => (selector.includes('fpb-editor-toolbar') ? {} : null),
    })).toBe(false)
  })

  it('waits until the finger actually moves before panning', () => {
    expect(panExceededThreshold(0, 0, 3, 4)).toBe(false)
    expect(panExceededThreshold(0, 0, 8, 0)).toBe(true)
  })

  it('zooms from the pinch distance and keeps the start point under the fingers', () => {
    const zoomed = cameraForPinch({
      startZoom: 1,
      startDistance: 100,
      distance: 200,
      startWorld: { x: 40, y: 60 },
      midX: 120,
      midY: 80,
      viewportWidth: 200,
      viewportHeight: 100,
      minZoom: 0.2,
      maxZoom: 4,
    })
    expect(zoomed.zoom).toBe(2)
    expect(zoomed.x).toBeCloseTo(40 - (120 - 100) / 2)
    expect(zoomed.y).toBeCloseTo(60 - (80 - 50) / 2)

    const clamped = cameraForPinch({
      startZoom: 1,
      startDistance: 100,
      distance: 10,
      startWorld: { x: 0, y: 0 },
      midX: 0,
      midY: 0,
      viewportWidth: 100,
      viewportHeight: 100,
      minZoom: 0.5,
      maxZoom: 3,
    })
    expect(clamped.zoom).toBe(0.5)
  })
})
