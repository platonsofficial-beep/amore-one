import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { anchorScrollDelta, edgeThumb, pinchZoom, touchDistance, touchMidpoint } from './floorPinch.js'

describe('floor pinch (t405u)', () => {
  it('measures the fingers', () => {
    expect(touchDistance({ clientX: 0, clientY: 0 }, { clientX: 30, clientY: 40 })).toBe(50)
    expect(touchMidpoint({ clientX: 0, clientY: 0 }, { clientX: 30, clientY: 40 })).toEqual({ x: 15, y: 20 })
  })
  it('scales with the spread and clamps to min/max', () => {
    expect(pinchZoom({ startZoom: 1, startDistance: 100, distance: 150, min: 0.65, max: 2.4 })).toBeCloseTo(1.5)
    expect(pinchZoom({ startZoom: 1, startDistance: 100, distance: 400, min: 0.65, max: 2.4 })).toBe(2.4)
    expect(pinchZoom({ startZoom: 1, startDistance: 100, distance: 10, min: 0.65, max: 2.4 })).toBe(0.65)
  })
  it('keeps the point under the fingers in place', () => {
    const mid = { x: 300, y: 200 }
    const before = { left: 100, top: 100 }
    // At zoom 2 with the same left edge, the point 200px in is now 400px in.
    expect(anchorScrollDelta({ mid, before, after: { left: 100, top: 100 }, fromZoom: 1, toZoom: 2 })).toEqual({ dx: 200, dy: 100 })
  })
  it('edge thumbs only when there is something to scroll', () => {
    expect(edgeThumb({ client: 200, scroll: 200, offset: 0, track: 192 })).toBeNull()
    expect(edgeThumb({ client: 200, scroll: 400, offset: 200, track: 192 })).toEqual({ size: 96, start: 96 })
  })
  it('hides the native bars on the host plan', () => {
    const css = readFileSync('src/safeOverlay.css', 'utf8')
    expect(css).toContain('.floor-plan-viewport.is-host-viewport::-webkit-scrollbar')
    expect(css).toContain('.floor-edge-scrollbar.is-vertical')
  })
})
