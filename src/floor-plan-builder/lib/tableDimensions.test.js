import { describe, expect, it } from 'vitest'
import {
  buildTableSizeResetPatch,
  canDecreaseTableDimension,
  normalizeTableBounds,
  normalizeTableSize,
  resolveTableSizeFromPatch,
} from './tableDimensions'
import { getTableMinSize } from './tableTransformUtils'

describe('normalizeTableSize', () => {
  it('clamps corrupt tiny tables to shape minimum', () => {
    expect(normalizeTableSize({ width: 4, height: 3 }, 'square')).toEqual({
      width: 64,
      height: 64,
    })
  })

  it('preserves valid rectangle dimensions', () => {
    expect(normalizeTableSize({ width: 200, height: 120 }, 'rectangle')).toEqual({
      width: 200,
      height: 120,
    })
  })
})

describe('resolveTableSizeFromPatch', () => {
  it('decreases square width and height together from width-only patch', () => {
    const next = resolveTableSizeFromPatch({
      baseSize: { width: 200, height: 200 },
      shape: 'square',
      explicitWidth: 192,
      explicitHeight: undefined,
    })

    expect(next).toEqual({ width: 192, height: 192 })
  })

  it('decreases round tables from height-only patch', () => {
    const next = resolveTableSizeFromPatch({
      baseSize: { width: 160, height: 160 },
      shape: 'round',
      explicitWidth: undefined,
      explicitHeight: 152,
    })

    expect(next).toEqual({ width: 152, height: 152 })
  })

  it('allows independent rectangle axis changes', () => {
    const next = resolveTableSizeFromPatch({
      baseSize: { width: 200, height: 120 },
      shape: 'rectangle',
      explicitWidth: 192,
      explicitHeight: undefined,
    })

    expect(next).toEqual({ width: 192, height: 120 })
  })

  it('applies preset dimensions as canonical size fields', () => {
    const next = resolveTableSizeFromPatch({
      baseSize: { width: 200, height: 200 },
      shape: 'square',
      explicitWidth: 90,
      explicitHeight: 90,
    })

    expect(next).toEqual({ width: 90, height: 90 })
  })
})

describe('canDecreaseTableDimension', () => {
  it('blocks decrease at minimum size', () => {
    const min = getTableMinSize('square').width
    expect(canDecreaseTableDimension(min, -8, 'square', 'width')).toBe(false)
    expect(canDecreaseTableDimension(min + 8, -8, 'square', 'width')).toBe(true)
  })
})

describe('buildTableSizeResetPatch', () => {
  it('returns medium preset dimensions without guest fields', () => {
    expect(buildTableSizeResetPatch('square')).toEqual({
      sizePreset: 'medium',
      size: { width: 140, height: 140 },
      width: 140,
      height: 140,
    })
  })
})

describe('normalizeTableBounds', () => {
  it('preserves center while squaring mismatched square dimensions', () => {
    const next = normalizeTableBounds({
      position: { x: 100, y: 120 },
      size: { width: 200, height: 160 },
      shape: 'square',
    })

    expect(next.size).toEqual({ width: 200, height: 200 })
    expect(next.position).toEqual({ x: 100, y: 100 })
  })

  it('leaves rectangle width and height independent', () => {
    const next = normalizeTableBounds({
      position: { x: 80, y: 90 },
      size: { width: 200, height: 140 },
      shape: 'rectangle',
    })

    expect(next.size).toEqual({ width: 200, height: 140 })
    expect(next.position).toEqual({ x: 80, y: 90 })
  })

  it('height-only square patch path uses equal dimensions', () => {
    const next = resolveTableSizeFromPatch({
      baseSize: { width: 200, height: 200 },
      shape: 'square',
      explicitWidth: undefined,
      explicitHeight: 176,
    })

    expect(next).toEqual({ width: 176, height: 176 })
  })

  it('width-only square patch path uses equal dimensions', () => {
    const next = resolveTableSizeFromPatch({
      baseSize: { width: 200, height: 200 },
      shape: 'square',
      explicitWidth: 184,
      explicitHeight: undefined,
    })

    expect(next).toEqual({ width: 184, height: 184 })
  })
})
