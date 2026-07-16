import { describe, expect, it } from 'vitest'
import {
  buildInventoryMigrationOperator,
  OPERATOR_STATUS,
} from './inventoryMigrationOperator'
import {
  aggregateInventoryMigrationMetrics,
  createEmptyInventoryMigrationMetrics,
} from './inventoryMigrationMetrics'

describe('inventoryMigrationOperator', () => {
  it('returns Unknown current step when metrics are unavailable', () => {
    const operator = buildInventoryMigrationOperator({
      metrics: createEmptyInventoryMigrationMetrics(),
      metricsAvailable: false,
      tableReachable: false,
    })

    expect(operator.currentStep).toBe('Unknown')
    expect(operator.requiredAction).toBe('Migration cannot yet continue.')
    expect(operator.checklist.every((step) => step.status === OPERATOR_STATUS.UNKNOWN)).toBe(true)
  })

  it('marks Foundation Ready when the map is not reachable', () => {
    const operator = buildInventoryMigrationOperator({
      metrics: createEmptyInventoryMigrationMetrics(),
      metricsAvailable: true,
      tableReachable: false,
    })

    expect(operator.currentStep).toBe('Foundation')
    expect(operator.requiredAction).toBe('Run Foundation.')
    expect(operator.checklist[0]).toMatchObject({
      title: 'Foundation',
      status: OPERATOR_STATUS.READY,
    })
  })

  it('maps Persist / Auto Link / Auto Create from live metrics', () => {
    const metrics = aggregateInventoryMigrationMetrics([
      { status: 'classified', resolution_type: 'auto_link' },
      { status: 'classified', resolution_type: 'auto_create' },
    ])
    const operator = buildInventoryMigrationOperator({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
    })

    expect(operator.checklist.find((s) => s.id === 'foundation').status).toBe(OPERATOR_STATUS.COMPLETED)
    expect(operator.checklist.find((s) => s.id === 'persist').status).toBe(OPERATOR_STATUS.COMPLETED)
    expect(operator.currentStep).toBe('Auto Link')
    expect(operator.requiredAction).toBe('Run Auto Link.')
  })

  it('advances to Phase 2 when catalog rows are complete without inventing Integrity Audit completion', () => {
    const metrics = aggregateInventoryMigrationMetrics([
      {
        status: 'linked',
        resolution_type: 'auto_link',
        migrated_at: null,
      },
      {
        status: 'created',
        resolution_type: 'auto_create',
        migrated_at: null,
      },
    ])
    const operator = buildInventoryMigrationOperator({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
    })

    expect(operator.checklist.find((s) => s.id === 'auto-create').status).toBe(OPERATOR_STATUS.COMPLETED)
    expect(operator.checklist.find((s) => s.id === 'phase-1').status).toBe(OPERATOR_STATUS.COMPLETED)
    expect(operator.checklist.find((s) => s.id === 'integrity-audit').status).toBe(OPERATOR_STATUS.WAITING)
    expect(operator.checklist.find((s) => s.id === 'integrity-audit').status).not.toBe(OPERATOR_STATUS.COMPLETED)
    expect(operator.currentStep).toBe('Phase 2')
    expect(operator.requiredAction).toBe('Run Phase 2.')
  })

  it('sets Integrity Audit Ready when auto stages are done and no phase evidence exists', () => {
    const metrics = createEmptyInventoryMigrationMetrics()
    const operator = buildInventoryMigrationOperator({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
    })

    expect(operator.currentStep).toBe('Integrity Audit')
    expect(operator.requiredAction).toBe('Run Integrity Audit.')
    expect(operator.checklist.find((s) => s.id === 'integrity-audit').status).toBe(OPERATOR_STATUS.READY)
    expect(operator.checklist.find((s) => s.id === 'preflight').status).toBe(OPERATOR_STATUS.WAITING)
  })

  it('uses Phase 1 evidence without inventing Integrity Audit completion', () => {
    const metrics = aggregateInventoryMigrationMetrics([
      {
        status: 'linked',
        resolution_type: 'auto_link',
        migrated_at: null,
      },
      {
        status: 'classified',
        resolution_type: 'auto_create',
      },
    ])
    const operator = buildInventoryMigrationOperator({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
    })

    expect(operator.currentStep).toBe('Auto Create')
    expect(operator.requiredAction).toBe('Run Auto Create.')
    expect(operator.checklist.find((s) => s.id === 'integrity-audit').status).toBe(OPERATOR_STATUS.WAITING)
  })

  it('returns Migration Complete when Phase 2 evidence is complete', () => {
    const metrics = aggregateInventoryMigrationMetrics([
      {
        status: 'linked',
        resolution_type: 'auto_link',
        migrated_at: '2026-07-16T10:00:00.000Z',
      },
      {
        status: 'created',
        resolution_type: 'auto_create',
        migrated_at: '2026-07-16T10:00:00.000Z',
      },
    ])
    const operator = buildInventoryMigrationOperator({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
    })

    expect(operator.currentStep).toBe('Completed')
    expect(operator.requiredAction).toBe('Migration Complete.')
    expect(operator.checklist.find((s) => s.id === 'phase-2').status).toBe(OPERATOR_STATUS.COMPLETED)
    expect(operator.checklist.find((s) => s.id === 'post-audit').status).not.toBe(OPERATOR_STATUS.COMPLETED)
  })

  it('never emits Failed statuses', () => {
    const operator = buildInventoryMigrationOperator({
      metrics: createEmptyInventoryMigrationMetrics(),
      metricsAvailable: true,
      tableReachable: true,
    })
    expect(operator.checklist.every((step) => step.status !== 'Failed')).toBe(true)
  })
})
