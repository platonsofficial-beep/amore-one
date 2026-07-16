import { describe, expect, it } from 'vitest'
import {
  aggregateInventoryMigrationMetrics,
  buildInventoryMigrationHealth,
  buildInventoryMigrationPipeline,
  classifyAttentionIssue,
  createEmptyInventoryMigrationMetrics,
  mapAttentionQueueRows,
  mapManualReviewQueueRows,
  MIGRATION_HEALTH_STATUS,
  MIGRATION_READINESS,
  PIPELINE_STATE,
  resolveInventoryMigrationCurrentStage,
  resolveInventoryMigrationProgressPercent,
  resolveInventoryMigrationStatus,
} from './inventoryMigrationMetrics'

describe('inventoryMigrationMetrics', () => {
  it('aggregates map row counts for dashboard cards', () => {
    const metrics = aggregateInventoryMigrationMetrics([
      { status: 'classified', resolution_type: 'auto_link' },
      { status: 'classified', resolution_type: 'auto_create' },
      { status: 'manual', resolution_type: null },
      { status: 'created', resolution_type: 'auto_create', migrated_at: null },
      { status: 'linked', resolution_type: 'auto_link', migrated_at: '2026-07-16T10:00:00.000Z' },
      { status: 'skipped', resolution_type: 'skip' },
    ])

    expect(metrics).toEqual({
      legacyItems: 6,
      classified: 2,
      autoLink: 2,
      autoCreate: 2,
      manualReview: 1,
      skipped: 1,
      completed: 2,
      migratedCompleted: 1,
      remainingClassifiedAutoLink: 1,
      remainingClassifiedAutoCreate: 1,
      total: 6,
    })
  })

  it('resolves migration status from completed vs total', () => {
    expect(resolveInventoryMigrationStatus(createEmptyInventoryMigrationMetrics())).toBe('Not Started')
    expect(resolveInventoryMigrationStatus({ completed: 0, total: 10 })).toBe('Not Started')
    expect(resolveInventoryMigrationStatus({ completed: 3, total: 10 })).toBe('In Progress')
    expect(resolveInventoryMigrationStatus({ completed: 10, total: 10 })).toBe('Completed')
  })

  it('returns Unknown pipeline when metrics are unavailable', () => {
    const pipeline = buildInventoryMigrationPipeline({
      metrics: createEmptyInventoryMigrationMetrics(),
      metricsAvailable: false,
      tableReachable: false,
    })
    expect(pipeline.every((stage) => stage.state === PIPELINE_STATE.UNKNOWN)).toBe(true)
    expect(resolveInventoryMigrationCurrentStage(pipeline)).toBe('Unknown')
    expect(resolveInventoryMigrationProgressPercent(null, false)).toBeNull()
  })

  it('builds live pipeline states from metrics', () => {
    const metrics = aggregateInventoryMigrationMetrics([
      { status: 'created', resolution_type: 'auto_create', migrated_at: '2026-07-16T10:00:00.000Z' },
      { status: 'linked', resolution_type: 'auto_link', migrated_at: '2026-07-16T10:00:00.000Z' },
    ])
    const pipeline = buildInventoryMigrationPipeline({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
    })
    const byId = Object.fromEntries(pipeline.map((stage) => [stage.id, stage.state]))

    expect(byId.foundation).toBe(PIPELINE_STATE.COMPLETE)
    expect(byId.classification).toBe(PIPELINE_STATE.COMPLETE)
    expect(byId['auto-link']).toBe(PIPELINE_STATE.COMPLETE)
    expect(byId['auto-create']).toBe(PIPELINE_STATE.COMPLETE)
    expect(byId['integrity-audit']).toBe(PIPELINE_STATE.WAITING)
    expect(byId.preflight).toBe(PIPELINE_STATE.WAITING)
    expect(byId.preview).toBe(PIPELINE_STATE.WAITING)
    expect(byId['phase-1']).toBe(PIPELINE_STATE.COMPLETE)
    expect(byId['phase-2']).toBe(PIPELINE_STATE.COMPLETE)
    expect(byId.completed).toBe(PIPELINE_STATE.COMPLETE)
    expect(resolveInventoryMigrationProgressPercent(metrics, true)).toBe(100)
  })

  it('maps manual review queue rows without inventing values', () => {
    const rows = mapManualReviewQueueRows([
      {
        id: 'a',
        status: 'manual',
        legacy_inventory_item_id: 42,
        resolution_type: null,
        conflict_reason: 'ambiguous match',
        created_at: '2026-07-16T12:00:00.000Z',
        source_snapshot: { item_name: 'House Gin', category: 'Spirits' },
      },
      {
        id: 'b',
        status: 'classified',
        legacy_inventory_item_id: 99,
        source_snapshot: { item_name: 'Skip Me' },
      },
      {
        id: 'c',
        status: 'manual',
        legacy_inventory_item_id: null,
        conflict_reason: '',
        resolution_type: '',
        created_at: 'not-a-date',
        source_snapshot: {},
      },
    ])

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      legacyItemId: '42',
      legacyName: 'House Gin',
      category: 'Spirits',
      conflictReason: 'ambiguous match',
      currentResolution: '—',
    })
    expect(rows[0].createdAt).not.toBe('—')
    expect(rows[1]).toMatchObject({
      legacyItemId: '—',
      legacyName: '—',
      category: '—',
      conflictReason: '—',
      currentResolution: '—',
      createdAt: '—',
    })
  })

  it('classifies attention issues from existing fields only', () => {
    expect(classifyAttentionIssue({
      status: 'manual',
      conflict_reason: 'duplicate name',
      source_snapshot: { item_name: 'Gin' },
    })).toEqual({ issue: 'duplicate name', severity: 'Attention' })

    expect(classifyAttentionIssue({
      status: 'created',
      stock_item_id: null,
      source_snapshot: { item_name: 'Vodka' },
    })).toEqual({ issue: 'Missing stock reference', severity: 'Attention' })

    expect(classifyAttentionIssue({
      status: 'failed',
      source_snapshot: { item_name: 'Rum' },
    })).toEqual({ issue: 'Failed', severity: 'Attention' })

    expect(classifyAttentionIssue({
      status: 'classified',
      source_snapshot: null,
    })).toEqual({ issue: 'Missing source snapshot', severity: 'Warning' })

    expect(classifyAttentionIssue({
      status: 'classified',
      source_snapshot: 'bad',
    })).toEqual({ issue: 'Invalid source snapshot', severity: 'Warning' })

    expect(classifyAttentionIssue({
      status: 'classified',
      source_snapshot: {},
    })).toEqual({ issue: 'Empty source snapshot', severity: 'Warning' })

    expect(classifyAttentionIssue({
      status: 'classified',
      source_snapshot: { category: 'Spirits' },
    })).toEqual({ issue: 'Missing item name in source snapshot', severity: 'Warning' })

    expect(classifyAttentionIssue({
      status: 'linked',
      stock_item_id: 'stock-1',
      source_snapshot: { item_name: 'Whiskey' },
    })).toBeNull()

    expect(classifyAttentionIssue({
      status: 'manual',
      conflict_reason: '',
      source_snapshot: { item_name: 'Tequila' },
    })).toBeNull()
  })

  it('maps attention queue rows without inventing values', () => {
    const rows = mapAttentionQueueRows([
      {
        id: 'a',
        status: 'manual',
        legacy_inventory_item_id: 7,
        resolution_type: null,
        conflict_reason: 'ambiguous match',
        created_at: '2026-07-16T12:00:00.000Z',
        source_snapshot: { item_name: 'House Gin' },
      },
      {
        id: 'b',
        status: 'linked',
        legacy_inventory_item_id: 8,
        stock_item_id: 'stock-8',
        resolution_type: 'auto_link',
        source_snapshot: { item_name: 'Healthy Row' },
      },
      {
        id: 'c',
        status: 'created',
        legacy_inventory_item_id: null,
        stock_item_id: null,
        resolution_type: 'auto_create',
        created_at: 'not-a-date',
        source_snapshot: { item_name: 'Broken Create' },
      },
    ])

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      legacyItemId: '7',
      legacyName: 'House Gin',
      issue: 'ambiguous match',
      currentStatus: 'manual',
      resolutionType: '—',
      severity: 'Attention',
    })
    expect(rows[0].createdAt).not.toBe('—')
    expect(rows[1]).toMatchObject({
      legacyItemId: '—',
      legacyName: 'Broken Create',
      issue: 'Missing stock reference',
      currentStatus: 'created',
      resolutionType: 'auto_create',
      createdAt: '—',
      severity: 'Attention',
    })
  })

  it('returns Unknown health when metrics are unavailable', () => {
    const health = buildInventoryMigrationHealth({
      metrics: createEmptyInventoryMigrationMetrics(),
      metricsAvailable: false,
      tableReachable: false,
      pipeline: buildInventoryMigrationPipeline({ metricsAvailable: false }),
      manualQueueSize: 2,
      attentionQueueSize: 1,
    })

    expect(health).toMatchObject({
      score: null,
      status: MIGRATION_HEALTH_STATUS.UNKNOWN,
      readiness: MIGRATION_READINESS.UNKNOWN,
      summary: 'Migration health cannot yet be determined.',
    })
  })

  it('calculates Ready health from clear queues and known pipeline', () => {
    const metrics = aggregateInventoryMigrationMetrics([
      {
        status: 'linked',
        resolution_type: 'auto_link',
        migrated_at: '2026-07-16T10:00:00.000Z',
      },
    ])
    const pipeline = buildInventoryMigrationPipeline({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
    })
    const health = buildInventoryMigrationHealth({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
      pipeline,
      manualQueueSize: 0,
      attentionQueueSize: 0,
    })

    expect(health.score).toBe(100)
    expect(health.status).toBe(MIGRATION_HEALTH_STATUS.EXCELLENT)
    expect(health.readiness).toBe(MIGRATION_READINESS.READY)
    expect(health.summary).toBe('Migration is ready for execution.')
  })

  it('marks Not Ready when manual review remains', () => {
    const metrics = aggregateInventoryMigrationMetrics([
      { status: 'manual', resolution_type: null },
      {
        status: 'linked',
        resolution_type: 'auto_link',
        migrated_at: '2026-07-16T10:00:00.000Z',
      },
    ])
    const pipeline = buildInventoryMigrationPipeline({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
    })
    const health = buildInventoryMigrationHealth({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
      pipeline,
      manualQueueSize: 1,
      attentionQueueSize: 0,
    })

    expect(health.readiness).toBe(MIGRATION_READINESS.NOT_READY)
    expect(health.summary).toBe('Migration requires manual review before execution.')
    expect(health.score).toBeLessThan(100)
    expect(health.score).toBeGreaterThanOrEqual(50)
  })

  it('marks Not Ready when attention items remain', () => {
    const metrics = createEmptyInventoryMigrationMetrics()
    metrics.total = 2
    metrics.completed = 2
    const pipeline = buildInventoryMigrationPipeline({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
    })
    const health = buildInventoryMigrationHealth({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
      pipeline,
      manualQueueSize: 0,
      attentionQueueSize: 3,
    })

    expect(health.readiness).toBe(MIGRATION_READINESS.NOT_READY)
    expect(health.summary).toBe('Migration requires attention before execution.')
  })

  it('builds executive summary for combined blockers', () => {
    const metrics = createEmptyInventoryMigrationMetrics()
    metrics.total = 4
    metrics.completed = 1
    const pipeline = buildInventoryMigrationPipeline({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
    })
    const health = buildInventoryMigrationHealth({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
      pipeline,
      manualQueueSize: 2,
      attentionQueueSize: 1,
    })

    expect(health.summary).toBe(
      'Migration requires manual review and attention before execution.',
    )
    expect(health.status).toBe(MIGRATION_HEALTH_STATUS.CRITICAL)
  })
})
