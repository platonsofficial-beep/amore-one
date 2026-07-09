import { describe, expect, it } from 'vitest'
import {
  clampTableCapacity,
  getTablePresetCapacity,
  getTablePresetDetails,
  getTableShapeSize,
  getTableSizeForPreset,
  resolveTableSizeForNewTable,
  TABLE_SHAPE_SIZES,
  TABLE_SIZE_PRESETS,
} from './floorPlanObject'

describe('resolveTableSizeForNewTable', () => {
  it('uses medium preset sizes for new tables without a reference', () => {
    expect(resolveTableSizeForNewTable('round', null)).toEqual(TABLE_SHAPE_SIZES.round)
    expect(resolveTableSizeForNewTable('rectangle', null)).toEqual(TABLE_SHAPE_SIZES.rectangle)
    expect(TABLE_SHAPE_SIZES.round).toEqual({ width: 140, height: 140 })
  })

  it('preserves saved dimensions from an existing reference table', () => {
    const referenceTable = {
      size: { width: 144, height: 144 },
    }

    expect(resolveTableSizeForNewTable('round', referenceTable)).toEqual({
      width: 144,
      height: 144,
    })
  })
})

describe('getTableShapeSize', () => {
  it('returns medium preset defaults for each supported shape', () => {
    expect(getTableShapeSize('round')).toEqual({ width: 140, height: 140 })
    expect(getTableShapeSize('square')).toEqual({ width: 140, height: 140 })
    expect(getTableShapeSize('rectangle').width).toBeGreaterThan(getTableShapeSize('rectangle').height)
  })
})

describe('table size presets', () => {
  it('returns explicit restaurant-sized dimensions per shape and preset', () => {
    expect(getTableSizeForPreset('square', 'small')).toEqual({ width: 90, height: 90 })
    expect(getTableSizeForPreset('square', 'large')).toEqual({ width: 200, height: 200 })
    expect(getTableSizeForPreset('round', 'medium')).toEqual({ width: 140, height: 140 })
    expect(getTableSizeForPreset('rectangle', 'large')).toEqual({ width: 280, height: 150 })
  })

  it('includes capacity suggestions that can be applied independently from shape', () => {
    expect(getTablePresetCapacity('square', 'medium')).toBe(4)
    expect(getTablePresetDetails('rectangle', 'small')).toEqual({
      width: 140,
      height: 90,
      capacity: 4,
    })
  })

  it('keeps small, medium, and large visually distinct for squares', () => {
    const small = TABLE_SIZE_PRESETS.square.small.width
    const medium = TABLE_SIZE_PRESETS.square.medium.width
    const large = TABLE_SIZE_PRESETS.square.large.width

    expect(medium - small).toBeGreaterThanOrEqual(40)
    expect(large - medium).toBeGreaterThanOrEqual(50)
  })
})

describe('clampTableCapacity', () => {
  it('clamps guest capacity between 1 and 20', () => {
    expect(clampTableCapacity(0)).toBe(1)
    expect(clampTableCapacity(3)).toBe(3)
    expect(clampTableCapacity(25)).toBe(20)
    expect(clampTableCapacity('4')).toBe(4)
    expect(clampTableCapacity('')).toBe(1)
  })
})
