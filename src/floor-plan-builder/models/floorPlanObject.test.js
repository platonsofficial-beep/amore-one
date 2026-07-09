import { describe, expect, it } from 'vitest'
import {
  getTableShapeSize,
  resolveTableSizeForNewTable,
  TABLE_SHAPE_SIZES,
} from './floorPlanObject'

describe('resolveTableSizeForNewTable', () => {
  it('uses larger default sizes for new tables without a reference', () => {
    expect(resolveTableSizeForNewTable('round', null)).toEqual(TABLE_SHAPE_SIZES.round)
    expect(resolveTableSizeForNewTable('rectangle', null)).toEqual(TABLE_SHAPE_SIZES.rectangle)
    expect(TABLE_SHAPE_SIZES.round.width).toBeGreaterThanOrEqual(200)
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
  it('returns practical defaults for each supported shape', () => {
    expect(getTableShapeSize('round')).toEqual({ width: 200, height: 200 })
    expect(getTableShapeSize('square')).toEqual({ width: 196, height: 196 })
    expect(getTableShapeSize('rectangle').width).toBeGreaterThan(getTableShapeSize('rectangle').height)
  })
})
