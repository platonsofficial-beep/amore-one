import { describe, expect, it } from 'vitest'
import { screenToWorld } from './camera'
import {
  computeResizeFromHandle,
  getTableMinSize,
  normalizeRotation,
  stepRotation,
} from './tableTransformUtils'

const floorBounds = { minX: 0, minY: 0, maxX: 2200, maxY: 1400 }
const viewportSize = { width: 1200, height: 800 }
const origin = {
  position: { x: 200, y: 200 },
  size: { width: 200, height: 200 },
  rotation: 0,
}

describe('stepRotation', () => {
  it('steps rotation by the requested delta', () => {
    expect(stepRotation(0, 45)).toBe(45)
    expect(stepRotation(350, 45)).toBe(35)
    expect(stepRotation(10, -45)).toBe(325)
  })

  it('normalizes invalid values before stepping', () => {
    expect(stepRotation('90', 45)).toBe(135)
    expect(normalizeRotation(-15)).toBe(345)
  })
})

describe('computeResizeFromHandle', () => {
  it('produces consistent workspace size at 70%, 100%, and 150% zoom', () => {
    const camera = { x: 600, y: 400, zoom: 1 }
    const targetWorld = { x: 420, y: 420 }
    const zoomLevels = [0.7, 1, 1.5]

    const results = zoomLevels.map((zoom) => {
      const halfW = viewportSize.width / 2
      const halfH = viewportSize.height / 2
      const screenPoint = {
        x: (targetWorld.x - camera.x) * zoom + halfW,
        y: (targetWorld.y - camera.y) * zoom + halfH,
      }
      const pointerWorld = screenToWorld(screenPoint, { ...camera, zoom }, viewportSize)

      expect(Math.round(pointerWorld.x)).toBe(Math.round(targetWorld.x))
      expect(Math.round(pointerWorld.y)).toBe(Math.round(targetWorld.y))

      return computeResizeFromHandle({
        handle: 'se',
        pointerWorld,
        origin,
        shape: 'square',
        floorBounds,
      })
    })

    results.forEach((result) => {
      expect(result.size).toEqual({ width: 220, height: 220 })
      expect(result.position).toEqual({ x: 200, y: 200 })
    })
  })

  it('shrinks and grows from the southeast handle', () => {
    const smaller = computeResizeFromHandle({
      handle: 'se',
      pointerWorld: { x: 360, y: 360 },
      origin,
      shape: 'square',
      floorBounds,
    })
    const larger = computeResizeFromHandle({
      handle: 'se',
      pointerWorld: { x: 460, y: 460 },
      origin,
      shape: 'square',
      floorBounds,
    })

    expect(smaller.size.width).toBeLessThan(origin.size.width)
    expect(larger.size.width).toBeGreaterThan(origin.size.width)
    expect(smaller.position).toEqual(origin.position)
  })

  it('keeps the northwest anchor stable when resizing from se', () => {
    const result = computeResizeFromHandle({
      handle: 'se',
      pointerWorld: { x: 450, y: 450 },
      origin,
      shape: 'rectangle',
      floorBounds,
    })

    expect(result.position).toEqual({ x: 200, y: 200 })
    expect(result.size.width).toBeGreaterThan(origin.size.width)
    expect(result.size.height).toBeGreaterThan(origin.size.height)
  })

  it('keeps the southeast anchor stable when resizing from nw', () => {
    const result = computeResizeFromHandle({
      handle: 'nw',
      pointerWorld: { x: 150, y: 150 },
      origin,
      shape: 'square',
      floorBounds,
    })

    const anchorX = origin.position.x + origin.size.width
    const anchorY = origin.position.y + origin.size.height
    expect(result.position.x + result.size.width).toBeCloseTo(anchorX, 5)
    expect(result.position.y + result.size.height).toBeCloseTo(anchorY, 5)
  })

  it('clamps to minimum size without jumping to top-left', () => {
    const result = computeResizeFromHandle({
      handle: 'se',
      pointerWorld: { x: 205, y: 205 },
      origin,
      shape: 'square',
      floorBounds,
    })
    const minSize = getTableMinSize('square')

    expect(result.size.width).toBe(minSize.width)
    expect(result.size.height).toBe(minSize.height)
    expect(result.position.x).toBeGreaterThanOrEqual(floorBounds.minX)
    expect(result.position.y).toBeGreaterThanOrEqual(floorBounds.minY)
  })
})
