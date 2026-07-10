import { describe, expect, it } from 'vitest'
import { screenToWorld } from './camera'
import {
  computeResizeFromHandle,
  finalizeResizeFromHandle,
  getResizeAnchorWorld,
  getTableMinSize,
  normalizeRotation,
  preserveResizeAnchor,
  stepRotation,
} from './tableTransformUtils'

const floorBounds = { minX: 0, minY: 0, maxX: 2200, maxY: 1400 }
const viewportSize = { width: 1024, height: 768 }

const squareOrigin = {
  position: { x: 200, y: 200 },
  size: { width: 200, height: 200 },
  rotation: 0,
}

const roundOrigin = {
  position: { x: 300, y: 240 },
  size: { width: 160, height: 160 },
  rotation: 0,
}

const rectangleOrigin = {
  position: { x: 180, y: 220 },
  size: { width: 220, height: 140 },
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

describe('square resize', () => {
  const zoomLevels = [0.67, 1, 1.5]

  it.each(zoomLevels)('grows at %p zoom with stable top-left anchor', (zoom) => {
    const camera = { x: 500, y: 350, zoom }
    const targetWorld = { x: 420, y: 420 }
    const halfW = viewportSize.width / 2
    const halfH = viewportSize.height / 2
    const pointerWorld = screenToWorld({
      x: (targetWorld.x - camera.x) * zoom + halfW,
      y: (targetWorld.y - camera.y) * zoom + halfH,
    }, camera, viewportSize)
    const anchorWorld = getResizeAnchorWorld('se', squareOrigin)

    const result = computeResizeFromHandle({
      handle: 'se',
      pointerWorld,
      origin: squareOrigin,
      shape: 'square',
      floorBounds,
      anchorWorld,
    })

    expect(result.size).toEqual({ width: 220, height: 220 })
    expect(result.position).toEqual(squareOrigin.position)
  })

  it('shrinks from the southeast handle', () => {
    const anchorWorld = getResizeAnchorWorld('se', squareOrigin)
    const result = computeResizeFromHandle({
      handle: 'se',
      pointerWorld: { x: 360, y: 360 },
      origin: squareOrigin,
      shape: 'square',
      floorBounds,
      anchorWorld,
    })

    expect(result.size).toEqual({ width: 160, height: 160 })
    expect(result.position).toEqual(squareOrigin.position)
  })

  it.each(['se', 'sw', 'ne', 'nw'])('keeps opposite anchor fixed for %s handle', (handle) => {
    const anchorWorld = getResizeAnchorWorld(handle, squareOrigin)
    const pointerByHandle = {
      se: { x: 430, y: 430 },
      sw: { x: 170, y: 430 },
      ne: { x: 430, y: 170 },
      nw: { x: 170, y: 170 },
    }

    const result = computeResizeFromHandle({
      handle,
      pointerWorld: pointerByHandle[handle],
      origin: squareOrigin,
      shape: 'square',
      floorBounds,
      anchorWorld,
    })

    expect(result.size.width).toBe(result.size.height)

    if (handle === 'se') {
      expect(result.position).toEqual(anchorWorld)
    } else if (handle === 'sw') {
      expect(result.position.y).toBeCloseTo(anchorWorld.y, 5)
      expect(result.position.x + result.size.width).toBeCloseTo(anchorWorld.x, 5)
    } else if (handle === 'ne') {
      expect(result.position.x).toBeCloseTo(anchorWorld.x, 5)
      expect(result.position.y + result.size.height).toBeCloseTo(anchorWorld.y, 5)
    } else {
      expect(result.position.x + result.size.width).toBeCloseTo(anchorWorld.x, 5)
      expect(result.position.y + result.size.height).toBeCloseTo(anchorWorld.y, 5)
    }
  })

  it('keeps NE anchor fixed across sequential live commits', () => {
    const anchorWorld = getResizeAnchorWorld('ne', squareOrigin)

    const step1 = computeResizeFromHandle({
      handle: 'ne',
      pointerWorld: { x: 380, y: 220 },
      origin: squareOrigin,
      shape: 'square',
      floorBounds,
      anchorWorld,
    })

    const step2 = computeResizeFromHandle({
      handle: 'ne',
      pointerWorld: { x: 360, y: 240 },
      origin: {
        position: step1.position,
        size: step1.size,
        rotation: 0,
      },
      shape: 'square',
      floorBounds,
      anchorWorld,
    })

    expect(step1.position.y + step1.size.height).toBeCloseTo(anchorWorld.y, 5)
    expect(step2.position.y + step2.size.height).toBeCloseTo(anchorWorld.y, 5)
    expect(step1.size.width).toBe(step1.size.height)
    expect(step2.size.width).toBe(step2.size.height)
    expect(step2.size.width).toBeLessThan(step1.size.width)
  })

  it('does not jump to top-left when clamped to minimum size', () => {
    const anchorWorld = getResizeAnchorWorld('se', squareOrigin)
    const result = computeResizeFromHandle({
      handle: 'se',
      pointerWorld: { x: 205, y: 205 },
      origin: squareOrigin,
      shape: 'square',
      floorBounds,
      anchorWorld,
    })
    const minSize = getTableMinSize('square')

    expect(result.size).toEqual(minSize)
    expect(result.position).toEqual(squareOrigin.position)
  })

  it('returns null for invalid pointer world instead of snapping to origin', () => {
    const anchorWorld = getResizeAnchorWorld('nw', squareOrigin)
    const result = finalizeResizeFromHandle({
      handle: 'nw',
      pointerWorld: null,
      origin: squareOrigin,
      shape: 'square',
      floorBounds,
      anchorWorld,
    })

    expect(result).toBeNull()
  })

  it('re-applies anchor after floor fit shrinks square dimensions', () => {
    const anchorWorld = getResizeAnchorWorld('ne', squareOrigin)
    const fitted = {
      position: { x: 200, y: 180 },
      size: { width: 180, height: 200 },
    }
    const corrected = preserveResizeAnchor('ne', anchorWorld, fitted, 0)

    expect(corrected.position.x).toBeCloseTo(200, 5)
    expect(corrected.position.y + corrected.size.height).toBeCloseTo(anchorWorld.y, 5)
    expect(corrected.size).toEqual(fitted.size)
  })
})

describe('round resize', () => {
  it('still resizes with the same anchor model as square', () => {
    const anchorWorld = getResizeAnchorWorld('se', roundOrigin)
    const result = computeResizeFromHandle({
      handle: 'se',
      pointerWorld: { x: 500, y: 420 },
      origin: roundOrigin,
      shape: 'round',
      floorBounds,
      anchorWorld,
    })

    expect(result.size.width).toBe(result.size.height)
    expect(result.position).toEqual(roundOrigin.position)
  })
})

describe('rectangle resize', () => {
  it('keeps independent width and height', () => {
    const anchorWorld = getResizeAnchorWorld('se', rectangleOrigin)
    const result = computeResizeFromHandle({
      handle: 'se',
      pointerWorld: { x: 430, y: 340 },
      origin: rectangleOrigin,
      shape: 'rectangle',
      floorBounds,
      anchorWorld,
    })

    expect(result.size.width).toBe(250)
    expect(result.size.height).toBe(120)
    expect(result.size.width).not.toBe(result.size.height)
    expect(result.position).toEqual(rectangleOrigin.position)
  })
})
