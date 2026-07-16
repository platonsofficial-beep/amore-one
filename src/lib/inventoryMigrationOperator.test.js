import { describe, expect, it } from 'vitest'
import {
  AUDIT_EVIDENCE_STATUS,
  buildInventoryMigrationAuditEvidence,
  resolveIntegrityAuditEvidence,
  resolvePostAuditEvidence,
  resolvePreflightEvidence,
  resolvePreviewEvidence,
} from './inventoryMigrationAuditEvidence'
import {
  aggregateInventoryMigrationMetrics,
  buildInventoryMigrationHealth,
  createEmptyInventoryMigrationMetrics,
  MIGRATION_HEALTH_STATUS,
  MIGRATION_READINESS,
} from './inventoryMigrationMetrics'
import {
  buildInventoryMigrationOperator,
  OPERATOR_STATUS,
} from './inventoryMigrationOperator'

describe('inventoryMigrationAuditEvidence', () => {
  it('returns Unknown for all audit stages when metrics are unavailable', () => {
    const evidence = buildInventoryMigrationAuditEvidence({
      metrics: createEmptyInventoryMigrationMetrics(),
      metricsAvailable: false,
      tableReachable: false,
    })

    expect(evidence).toMatchObject({
      integrityAudit: AUDIT_EVIDENCE_STATUS.UNKNOWN,
      preflight: AUDIT_EVIDENCE_STATUS.UNKNOWN,
      preview: AUDIT_EVIDENCE_STATUS.UNKNOWN,
      postAudit: AUDIT_EVIDENCE_STATUS.UNKNOWN,
      hasUnknown: true,
      allCompleted: false,
    })
  })

  it('returns Waiting without fabricating Completed when prerequisites exist', () => {
    const metrics = createEmptyInventoryMigrationMetrics()
    expect(resolveIntegrityAuditEvidence({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
    })).toBe(AUDIT_EVIDENCE_STATUS.WAITING)

    expect(resolvePreflightEvidence({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
    })).toBe(AUDIT_EVIDENCE_STATUS.WAITING)

    expect(resolvePreviewEvidence({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
    })).toBe(AUDIT_EVIDENCE_STATUS.WAITING)

    const phase2Metrics = aggregateInventoryMigrationMetrics([
      {
        status: 'linked',
        resolution_type: 'auto_link',
        migrated_at: '2026-07-16T10:00:00.000Z',
      },
    ])
    expect(resolvePostAuditEvidence({
      metrics: phase2Metrics,
      metricsAvailable: true,
      tableReachable: true,
    })).toBe(AUDIT_EVIDENCE_STATUS.WAITING)
  })

  it('never returns Failed', () => {
    const evidence = buildInventoryMigrationAuditEvidence({
      metrics: createEmptyInventoryMigrationMetrics(),
      metricsAvailable: true,
      tableReachable: true,
    })
    expect(Object.values(evidence)).not.toContain('Failed')
  })
})

describe('inventoryMigrationOperator with audit evidence', () => {
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

  it('does not skip Integrity Audit when later phase metrics exist', () => {
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
    expect(operator.checklist.find((s) => s.id === 'integrity-audit').status).toBe(OPERATOR_STATUS.WAITING)
    expect(operator.checklist.find((s) => s.id === 'phase-1').status).toBe(OPERATOR_STATUS.WAITING)
    expect(operator.currentStep).toBe('Integrity Audit')
    expect(operator.requiredAction).toBe('Run Integrity Audit.')
  })

  it('sets Integrity Audit as current when auto stages are done', () => {
    const metrics = createEmptyInventoryMigrationMetrics()
    const operator = buildInventoryMigrationOperator({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
    })

    expect(operator.currentStep).toBe('Integrity Audit')
    expect(operator.requiredAction).toBe('Run Integrity Audit.')
    expect(operator.checklist.find((s) => s.id === 'integrity-audit').status).toBe(OPERATOR_STATUS.WAITING)
    expect(operator.checklist.find((s) => s.id === 'preflight').status).toBe(OPERATOR_STATUS.WAITING)
  })

  it('keeps Preflight / Preview waiting without inventing completion', () => {
    const metrics = createEmptyInventoryMigrationMetrics()
    const operator = buildInventoryMigrationOperator({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
    })

    expect(operator.checklist.find((s) => s.id === 'preflight').status).toBe(OPERATOR_STATUS.WAITING)
    expect(operator.checklist.find((s) => s.id === 'preview').status).toBe(OPERATOR_STATUS.WAITING)
    expect(operator.notes).toContain(
      'Audit stages require operator confirmation before execution stages.',
    )
  })

  it('does not mark Migration Complete without Post Audit evidence', () => {
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

    expect(operator.currentStep).toBe('Integrity Audit')
    expect(operator.requiredAction).toBe('Run Integrity Audit.')
    expect(operator.checklist.find((s) => s.id === 'post-audit').status).toBe(OPERATOR_STATUS.WAITING)
    expect(operator.checklist.find((s) => s.id === 'completed').status).toBe(OPERATOR_STATUS.WAITING)
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

describe('health compatibility with audit evidence', () => {
  it('reflects Unknown when audit evidence is Unknown', () => {
    const evidence = buildInventoryMigrationAuditEvidence({
      metricsAvailable: false,
      tableReachable: false,
    })
    const health = buildInventoryMigrationHealth({
      metrics: createEmptyInventoryMigrationMetrics(),
      metricsAvailable: false,
      tableReachable: false,
      auditEvidence: evidence,
    })

    expect(health.score).toBeNull()
    expect(health.status).toBe(MIGRATION_HEALTH_STATUS.UNKNOWN)
    expect(health.readiness).toBe(MIGRATION_READINESS.UNKNOWN)
  })

  it('keeps live health when metrics and evidence are available', () => {
    const metrics = createEmptyInventoryMigrationMetrics()
    const evidence = buildInventoryMigrationAuditEvidence({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
    })
    const health = buildInventoryMigrationHealth({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
      pipeline: [],
      manualQueueSize: 0,
      attentionQueueSize: 0,
      auditEvidence: evidence,
    })

    expect(health.score).not.toBeNull()
    expect(health.status).not.toBe(MIGRATION_HEALTH_STATUS.UNKNOWN)
  })
})
