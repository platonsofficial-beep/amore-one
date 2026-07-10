import { describe, expect, it } from 'vitest'
import {
  buildTableSizeResetPatch,
  canDecreaseTableDimension,
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
      size: { width: 140, height: 140 },
      width: 140,
      height: 140,
    })
  })
})
