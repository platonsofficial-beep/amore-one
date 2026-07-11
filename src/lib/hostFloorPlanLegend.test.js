import { describe, expect, it } from 'vitest'
import { HOST_FLOOR_PLAN_LEGEND_ITEMS } from './hostFloorPlanLegend'
import { resolveHostFloorLegendToneToken } from './hostFloorSemanticTokens'

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

  it('uses semantic token references for every legend tone', () => {
    HOST_FLOOR_PLAN_LEGEND_ITEMS.forEach((entry) => {
      expect(resolveHostFloorLegendToneToken(entry.tone)).toMatch(/^var\(--host-floor-/)
    })
  })
})
