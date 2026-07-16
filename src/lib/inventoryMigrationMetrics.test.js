import { describe, expect, it } from 'vitest'
import {
  aggregateInventoryMigrationMetrics,
  createEmptyInventoryMigrationMetrics,
  resolveInventoryMigrationStatus,
} from './inventoryMigrationMetrics'

describe('inventoryMigrationMetrics', () => {
  it('aggregates map row counts for dashboard cards', () => {
    const metrics = aggregateInventoryMigrationMetrics([
      { status: 'classified', resolution_type: 'auto_link' },
      { status: 'classified', resolution_type: 'auto_create' },
      { status: 'manual', resolution_type: null },
      { status: 'created', resolution_type: 'auto_create' },
      { status: 'linked', resolution_type: 'auto_link' },
      { status: 'skipped', resolution_type: 'skip' },
    ])

    expect(metrics).toEqual({
      legacyItems: 6,
      classified: 2,
      autoLink: 2,
      autoCreate: 2,
      manualReview: 1,
      completed: 2,
      total: 6,
    })
  })

  it('resolves migration status from completed vs total', () => {
    expect(resolveInventoryMigrationStatus(createEmptyInventoryMigrationMetrics())).toBe('Not Started')
    expect(resolveInventoryMigrationStatus({ completed: 0, total: 10 })).toBe('Not Started')
    expect(resolveInventoryMigrationStatus({ completed: 3, total: 10 })).toBe('In Progress')
    expect(resolveInventoryMigrationStatus({ completed: 10, total: 10 })).toBe('Completed')
  })
})
