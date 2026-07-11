import { describe, expect, it } from 'vitest'
import { HOST_FLOOR_PLAN_LEGEND_ITEMS } from './hostFloorPlanLegend'

describe('hostFloorPlanLegend', () => {
  it('defines five host floor legend entries', () => {
    expect(HOST_FLOOR_PLAN_LEGEND_ITEMS).toHaveLength(5)
    expect(HOST_FLOOR_PLAN_LEGEND_ITEMS.map((entry) => entry.label)).toEqual([
      'Available',
      'Reserved',
      'Seated',
      'Problem',
      'Combined',
    ])
  })
})
