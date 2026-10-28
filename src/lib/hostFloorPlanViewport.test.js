import { describe, expect, it } from 'vitest'
import {
  clampHostFloorPan,
  computeHostFloorContainBox,
  computeHostFloorFit,
  computeHostFloorReadableBox,
  computeHostFloorTablesFit,
} from './hostFloorPlanViewport'

describe('computeHostFloorFit', () => {
  it('does not apply a second fit-to-table-bounds zoom on published layouts', () => {
    const fit = computeHostFloorFit({
      tables: [
        { x: 20, y: 30, widthPercent: 8, heightPercent: 8 },
        { x: 70, y: 60, widthPercent: 10, heightPercent: 10 },
      ],
      viewportWidth: 1024,
      viewportHeight: 768,
    })

    expect(fit).toEqual({
      zoom: 1,
      pan: { x: 0, y: 0 },
    })
  })
})

describe('computeHostFloorContainBox', () => {
  it('fits the whole plan inside the visible area', () => {
    const box = computeHostFloorContainBox({
      viewportWidth: 480,
      viewportHeight: 160,
      aspectWidth: 1000,
      aspectHeight: 700,
    })
    expect(box.width).toBeLessThanOrEqual(480)
    expect(box.height).toBeLessThanOrEqual(160)
    expect(box.width / box.height).toBeCloseTo(1000 / 700, 1)
  })

  it('does not pan the map past its edges', () => {
    expect(clampHostFloorPan({ x: 20, y: 30 }, {
      viewportWidth: 200,
      viewportHeight: 100,
      contentWidth: 400,
      contentHeight: 300,
    })).toEqual({ x: 0, y: 0 })
    expect(clampHostFloorPan({ x: -500, y: -400 }, {
      viewportWidth: 200,
      viewportHeight: 100,
      contentWidth: 400,
      contentHeight: 300,
    })).toEqual({ x: -200, y: -200 })
  })
})

describe('computeHostFloorTablesFit', () => {
  it('fits every table, including the left edge and the bottom row, into the visible plan', () => {
    const tables = [
      { id: 't10', x: 8, y: 18, widthPercent: 10, heightPercent: 8 },
      { id: 'side', x: 94, y: 40, widthPercent: 8, heightPercent: 8 },
      { id: 'bottom', x: 50, y: 90, widthPercent: 12, heightPercent: 10 },
    ]
    const viewportWidth = 667
    const viewportHeight = 220
    const fit = computeHostFloorTablesFit({
      tables,
      viewportWidth,
      viewportHeight,
      aspectWidth: 1000,
      aspectHeight: 700,
      paddingPx: 8,
    })

    tables.forEach((table) => {
      const halfW = table.widthPercent / 2
      const halfH = table.heightPercent / 2
      const left = fit.width * ((table.x - halfW) / 100) - fit.scrollLeft
      const right = fit.width * ((table.x + halfW) / 100) - fit.scrollLeft
      const top = fit.height * ((table.y - halfH) / 100) - fit.scrollTop
      const bottom = fit.height * ((table.y + halfH) / 100) - fit.scrollTop
      expect(left).toBeGreaterThanOrEqual(-1)
      expect(top).toBeGreaterThanOrEqual(-1)
      expect(right).toBeLessThanOrEqual(viewportWidth + 1)
      expect(bottom).toBeLessThanOrEqual(viewportHeight + 1)
    })
  })
})

describe('computeHostFloorReadableBox', () => {
  const tables = [
    { widthPercent: 8, heightPercent: 8 },
    { widthPercent: 14, heightPercent: 14 },
  ]

  it('fills a short wide viewport and keeps the smallest table readable', () => {
    const box = computeHostFloorReadableBox({
      tables,
      viewportWidth: 500,
      viewportHeight: 120,
      aspectWidth: 1000,
      aspectHeight: 700,
    })

    expect(box.width).toBeGreaterThanOrEqual(Math.ceil(44 / 0.08))
    expect(box.width / box.height).toBeCloseTo(1000 / 700, 1)
    expect(box.width * 0.08).toBeGreaterThanOrEqual(44)
  })

  it('grows to the viewport height when that makes the plan larger', () => {
    const box = computeHostFloorReadableBox({
      tables,
      viewportWidth: 400,
      viewportHeight: 500,
      aspectWidth: 1000,
      aspectHeight: 700,
    })

    expect(box.height).toBeGreaterThanOrEqual(500)
    expect(box.width).toBeGreaterThanOrEqual(400)
  })
})
