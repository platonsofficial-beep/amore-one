import { describe, expect, it } from 'vitest'
import {
  buildTableSizePresetPatch,
  clampTableCapacity,
  getDefaultGuestRangeForShape,
  getTablePresetCapacity,
  getTablePresetDetails,
  getTableShapeSize,
  getTableSizeForPreset,
  matchTableSizePreset,
  normalizeFloorPlanTableObject,
  normalizeTableGuestRange,
  resolveTableGuestRange,
  resolveTableSizeForNewTable,
  TABLE_SIZE_PRESET_ORDER,
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
    expect(getTableShapeSize('rectangle')).toEqual({ width: 210, height: 120 })
    expect(getTableShapeSize('rectangle').width).toBeGreaterThan(getTableShapeSize('rectangle').height)
  })
})

describe('table size presets', () => {
  it('returns explicit restaurant-sized dimensions per shape and preset', () => {
    expect(getTableSizeForPreset('square', 'small')).toEqual({ width: 110, height: 110 })
    expect(getTableSizeForPreset('square', 'large')).toEqual({ width: 200, height: 200 })
    expect(getTableSizeForPreset('round', 'medium')).toEqual({ width: 140, height: 140 })
    expect(getTableSizeForPreset('rectangle', 'large')).toEqual({ width: 320, height: 160 })
    expect(getTableSizeForPreset('island', 'xxl')).toEqual({ width: 650, height: 260 })
  })

  it('exposes eight distinct presets per shape', () => {
    expect(TABLE_SIZE_PRESET_ORDER).toHaveLength(8)
    expect(Object.keys(TABLE_SIZE_PRESETS.square)).toEqual(TABLE_SIZE_PRESET_ORDER)
  })

  it('uses shape guest defaults independent of preset size', () => {
    expect(getTablePresetCapacity('square')).toBe(4)
    expect(getDefaultGuestRangeForShape('rectangle')).toEqual({
      minGuests: 4,
      maxGuests: 6,
    })
    expect(getTablePresetDetails('rectangle', 'small')).toEqual({
      width: 160,
      height: 90,
    })
  })

  it('builds a preset patch that updates only canvas dimensions', () => {
    expect(buildTableSizePresetPatch('square', 'small')).toEqual({
      sizePreset: 'small',
      size: { width: 110, height: 110 },
      width: 110,
      height: 110,
    })
    expect(buildTableSizePresetPatch('rectangle', 'large')).toEqual({
      sizePreset: 'large',
      size: { width: 320, height: 160 },
      width: 320,
      height: 160,
    })
    expect(buildTableSizePresetPatch('square', 'small')).not.toHaveProperty('minGuests')
    expect(buildTableSizePresetPatch('square', 'small')).not.toHaveProperty('maxGuests')
    expect(buildTableSizePresetPatch('square', 'small')).not.toHaveProperty('capacity')
  })

  it('matches active preset from current dimensions and falls back to custom', () => {
    expect(matchTableSizePreset('square', { width: 140, height: 140 })).toBe('medium')
    expect(matchTableSizePreset('rectangle', { width: 144, height: 88 })).toBeNull()
  })
})

describe('normalizeFloorPlanTableObject', () => {
  it('preserves custom saved dimensions when loading existing layouts', () => {
    const normalized = normalizeFloorPlanTableObject({
      id: 'table-custom',
      type: 'table',
      position: { x: 120, y: 80 },
      size: { width: 144, height: 88 },
      properties: {
        shape: 'rectangle',
        minGuests: 3,
        maxGuests: 5,
        tableNumber: '7',
      },
    })

    expect(normalized.size).toEqual({ width: 144, height: 88 })
    expect(normalized.properties.minGuests).toBe(3)
    expect(normalized.properties.maxGuests).toBe(5)
    expect(matchTableSizePreset('rectangle', normalized.size)).toBeNull()
  })
})

describe('resolveTableGuestRange', () => {
  it('migrates legacy single capacity values to matching min/max guests', () => {
    expect(resolveTableGuestRange({ capacity: 4 }, 'square')).toEqual({
      minGuests: 4,
      maxGuests: 4,
    })
  })

  it('uses stored min/max guests when present', () => {
    expect(resolveTableGuestRange({ minGuests: 2, maxGuests: 6 }, 'rectangle')).toEqual({
      minGuests: 2,
      maxGuests: 6,
    })
  })
})

describe('normalizeTableGuestRange', () => {
  it('keeps max greater than or equal to min', () => {
    expect(normalizeTableGuestRange(6, 3)).toEqual({ minGuests: 6, maxGuests: 6 })
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
