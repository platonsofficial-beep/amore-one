import { describe, expect, it } from 'vitest'
import {
  getHandleScreenOffsetFromTableCorner,
  getSelectionHandleCenters,
} from './selectionChromeLayout'
import { computeResizeFromHandle } from './tableTransformUtils'

const viewportSize = { width: 1024, height: 768 }
const tablePosition = { x: 200, y: 180 }
const tableSize = { width: 140, height: 140 }

describe('getSelectionHandleCenters', () => {
  it('positions handles in workspace units relative to the object box', () => {
    const layout = getSelectionHandleCenters(tableSize)

    expect(layout.nw.x).toBeLessThan(0)
    expect(layout.nw.y).toBeLessThan(0)
    expect(layout.se.x).toBeGreaterThan(tableSize.width)
    expect(layout.se.y).toBeGreaterThan(tableSize.height)
    expect(layout.ne.x).toBe(layout.se.x)
    expect(layout.sw.x).toBe(layout.nw.x)
  })
})

describe('handle positions across zoom', () => {
  const layout = getSelectionHandleCenters(tableSize)
  const zoomLevels = [0.5, 0.8, 1, 1.3, 1.5]

  it('scales handle offsets with zoom while staying attached to table corners', () => {
    const offsets = zoomLevels.map((zoom) => {
      const camera = { x: 500, y: 350, zoom }
      return getHandleScreenOffsetFromTableCorner({
        tablePosition,
        handleCenter: layout.nw,
        camera,
        viewportSize,
      })
    })

    offsets.forEach((offset, index) => {
      const zoom = zoomLevels[index]
      expect(offset.x).toBeCloseTo(layout.nw.x * zoom, 4)
      expect(offset.y).toBeCloseTo(layout.nw.y * zoom, 4)
    })
  })

  it('keeps workspace handle geometry unchanged when zoom changes', () => {
    const first = getSelectionHandleCenters(tableSize)
    const second = getSelectionHandleCenters(tableSize)
    expect(second).toEqual(first)
  })
})

describe('resize after zoom', () => {
  it('commits the same workspace size regardless of viewport zoom', () => {
    const origin = {
      position: tablePosition,
      size: tableSize,
      rotation: 0,
    }
    const floorBounds = { minX: 0, minY: 0, maxX: 2200, maxY: 1400 }
    const pointerWorld = { x: 360, y: 360 }

    const results = [0.52, 0.8, 1, 1.3, 1.5].map(() => computeResizeFromHandle({
      handle: 'se',
      pointerWorld,
      origin,
      shape: 'square',
      floorBounds,
    }))

    results.forEach((result) => {
      expect(result.size).toEqual({ width: 180, height: 180 })
      expect(result.position).toEqual(tablePosition)
    })
  })
})
