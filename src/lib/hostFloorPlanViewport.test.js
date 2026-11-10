import { describe, expect, it } from 'vitest'
import {
  clampHostFloorPan,
  computeHostFloorContainBox,
  computeHostFloorFit,
  computeHostFloorReadableBox,
  computeHostFloorTablesFit,
  snapHostFloorScroll,
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
      minTablePx: 0,
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

describe('computeHostFloorTablesFit readable minimum', () => {
  it('keeps the smallest table readable on a 956x440 phone and scrolls to the tables', () => {
    const tables = [
      { id: 'a', x: 20, y: 15, widthPercent: 4, heightPercent: 6 },
      { id: 'b', x: 80, y: 85, widthPercent: 4, heightPercent: 6 },
    ]
    const fit = computeHostFloorTablesFit({
      tables,
      viewportWidth: 495,
      viewportHeight: 233,
      aspectWidth: 2200,
      aspectHeight: 1400,
    })
    expect(fit.width * 0.04).toBeGreaterThanOrEqual(43.5)
    expect(fit.scrollLeft).toBeGreaterThan(0)
    expect(fit.scrollLeft).toBeLessThanOrEqual(fit.width * 0.18)
    expect(fit.scrollTop).toBeLessThanOrEqual(fit.height * 0.12)
  })
})

function tableBox(table, width, height) {
  return {
    left: width * ((table.x - table.widthPercent / 2) / 100),
    right: width * ((table.x + table.widthPercent / 2) / 100),
    top: height * ((table.y - table.heightPercent / 2) / 100),
    bottom: height * ((table.y + table.heightPercent / 2) / 100),
  }
}

function sliced(box, viewLeft, viewTop, viewWidth, viewHeight) {
  const viewRight = viewLeft + viewWidth
  const viewBottom = viewTop + viewHeight
  const overlapsX = box.right > viewLeft + 0.5 && box.left < viewRight - 0.5
  const overlapsY = box.bottom > viewTop + 0.5 && box.top < viewBottom - 0.5
  return {
    x: overlapsX && (box.left < viewLeft - 0.5 || box.right > viewRight + 0.5),
    y: overlapsY && (box.top < viewTop - 0.5 || box.bottom > viewBottom + 0.5),
  }
}

describe('snapHostFloorScroll', () => {
  it('opens at the start and keeps a right-edge table fully past the frame', () => {
    const tables = [
      { id: 'left', x: 12, y: 20, widthPercent: 10, heightPercent: 12 },
      { id: 'edge', x: 48, y: 20, widthPercent: 10, heightPercent: 12 },
      { id: 'last', x: 92, y: 20, widthPercent: 10, heightPercent: 12 },
    ]
    const snapped = snapHostFloorScroll({
      tables,
      viewportWidth: 250,
      viewportHeight: 400,
      contentWidth: 500,
      contentHeight: 400,
      paddingPx: 12,
    })
    expect(snapped.scrollLeft).toBe(0)
    expect(snapped.scrollTop).toBe(0)
    const edge = tableBox(tables[1], snapped.layoutWidth, snapped.layoutHeight)
    const left = tableBox(tables[0], snapped.layoutWidth, snapped.layoutHeight)
    expect(edge.left).toBeGreaterThanOrEqual(250 - 0.5)
    expect(sliced(left, 0, 0, 250, 400).x).toBe(false)
    expect(left.right).toBeLessThanOrEqual(250 + 0.5)
  })

  it('gives the last table room inside the frame once the plan is scrolled to the end', () => {
    const tables = [
      { id: 'before', x: 58, y: 30, widthPercent: 8, heightPercent: 10 },
      { id: 'last', x: 96, y: 30, widthPercent: 8, heightPercent: 10 },
    ]
    const viewportWidth = 200
    const viewportHeight = 220
    const pad = 12
    const snapped = snapHostFloorScroll({
      tables,
      viewportWidth,
      viewportHeight,
      contentWidth: 500,
      contentHeight: 300,
      paddingPx: pad,
    })
    const width = snapped.layoutWidth + snapped.extraWidth
    const height = snapped.layoutHeight + snapped.extraHeight
    const scrollLeft = Math.max(0, width - viewportWidth)
    const scrollTop = Math.max(0, height - viewportHeight)
    const last = tableBox(tables[1], snapped.layoutWidth, snapped.layoutHeight)
    const before = tableBox(tables[0], snapped.layoutWidth, snapped.layoutHeight)
    expect(sliced(last, scrollLeft, scrollTop, viewportWidth, viewportHeight).x).toBe(false)
    expect(sliced(before, scrollLeft, scrollTop, viewportWidth, viewportHeight).x).toBe(false)
    expect(last.right).toBeLessThanOrEqual(scrollLeft + viewportWidth - pad + 0.5)
    expect(last.left).toBeGreaterThanOrEqual(scrollLeft - 0.5)
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
