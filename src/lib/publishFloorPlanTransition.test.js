import { describe, expect, it } from 'vitest'
import {
  buildPublishTransitionResult,
  isValidPublishedBuilderLayout,
  resolveActiveFloorAreaId,
  resolveActiveFloorAreaIdFromBuilderLayout,
} from './publishFloorPlanTransition'

const sampleBuilderLayout = {
  version: 1,
  floors: [{ id: 'main-dining', label: 'Main Dining', workspace: { width: 2200, height: 1400, x: 0, y: 0 } }],
  activeFloorId: 'main-dining',
  objects: [{
    id: 'table-1',
    type: 'table',
    floorId: 'main-dining',
    position: { x: 200, y: 200 },
    size: { width: 140, height: 140 },
    rotation: 0,
    properties: { shape: 'round', tableNumber: '1', minGuests: 2, maxGuests: 4, visible: true },
  }],
  publishedAt: '2026-07-10T10:00:00.000Z',
}

describe('publishFloorPlanTransition', () => {
  it('validates published builder layouts', () => {
    expect(isValidPublishedBuilderLayout(sampleBuilderLayout)).toBe(true)
    expect(isValidPublishedBuilderLayout({ floors: [], objects: [] })).toBe(false)
    expect(isValidPublishedBuilderLayout(null)).toBe(false)
  })

  it('resolves active floor area from host layout zones', () => {
    const hostLayout = {
      zones: [
        { id: 'main-dining', label: 'Main Dining' },
        { id: 'patio', label: 'Patio' },
      ],
    }

    expect(resolveActiveFloorAreaId(hostLayout, 'patio')).toBe('patio')
    expect(resolveActiveFloorAreaId(hostLayout, 'missing')).toBe('main-dining')
    expect(resolveActiveFloorAreaId(hostLayout, null)).toBe('main-dining')
    expect(resolveActiveFloorAreaId({ zones: [] }, 'patio')).toBeNull()
  })

  it('builds a successful publish transition with host layout and active area', () => {
    const result = buildPublishTransitionResult(sampleBuilderLayout)

    expect(result.ok).toBe(true)
    expect(result.hostLayout?.tables).toHaveLength(1)
    expect(result.activeFloorAreaId).toBe('main-dining')
    expect(resolveActiveFloorAreaIdFromBuilderLayout(sampleBuilderLayout, 'main-dining')).toBe('main-dining')
  })

  it('rejects invalid publish payloads instead of returning a blank transition', () => {
    const result = buildPublishTransitionResult({ floors: [], objects: [] })

    expect(result.ok).toBe(false)
    expect(result.hostLayout).toBeNull()
    expect(result.activeFloorAreaId).toBeNull()
  })

  it('supports post-publish host render without a null active floor area', () => {
    const hostLayout = {
      zones: [{ id: 'main-dining', label: 'Main Dining' }],
      tables: [{ id: 'table-1', zoneId: 'main-dining' }],
    }

    expect(resolveActiveFloorAreaId(hostLayout, null)).toBe('main-dining')
    expect(resolveActiveFloorAreaId(hostLayout, 'missing')).toBe('main-dining')
    expect(resolveActiveFloorAreaId({ zones: [] }, null)).toBeNull()
  })

  it('simulates successful publish to host floor hydration', () => {
    const transition = buildPublishTransitionResult(sampleBuilderLayout)

    expect(transition.ok).toBe(true)
    expect(transition.hostLayout?.zones?.[0]?.id).toBe('main-dining')
    expect(transition.hostLayout?.tables?.[0]?.zoneId).toBe('main-dining')
    expect(transition.activeFloorAreaId).toBe('main-dining')

    const visibleTables = transition.hostLayout.tables.filter(
      (table) => table.zoneId === transition.activeFloorAreaId,
    )
    expect(visibleTables).toHaveLength(1)
  })
})
