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
  createEmptyInventoryMigrationMetrics,
} from './inventoryMigrationMetrics'

describe('inventoryMigrationAuditEvidence', () => {
  it('returns Unknown when metrics are unavailable', () => {
    expect(resolveIntegrityAuditEvidence({ metricsAvailable: false })).toBe(
      AUDIT_EVIDENCE_STATUS.UNKNOWN,
    )
    expect(resolvePreflightEvidence({ metricsAvailable: false })).toBe(
      AUDIT_EVIDENCE_STATUS.UNKNOWN,
    )
    expect(resolvePreviewEvidence({ metricsAvailable: false })).toBe(
      AUDIT_EVIDENCE_STATUS.UNKNOWN,
    )
    expect(resolvePostAuditEvidence({ metricsAvailable: false })).toBe(
      AUDIT_EVIDENCE_STATUS.UNKNOWN,
    )
  })

  it('returns Waiting and never invents Completed from current live metrics', () => {
    const metrics = aggregateInventoryMigrationMetrics([
      {
        status: 'linked',
        resolution_type: 'auto_link',
        migrated_at: '2026-07-16T10:00:00.000Z',
      },
    ])
    const evidence = buildInventoryMigrationAuditEvidence({
      metrics,
      metricsAvailable: true,
      tableReachable: true,
    })

    expect(evidence.integrityAudit).toBe(AUDIT_EVIDENCE_STATUS.WAITING)
    expect(evidence.preflight).toBe(AUDIT_EVIDENCE_STATUS.WAITING)
    expect(evidence.preview).toBe(AUDIT_EVIDENCE_STATUS.WAITING)
    expect(evidence.postAudit).toBe(AUDIT_EVIDENCE_STATUS.WAITING)
    expect(evidence.hasUnknown).toBe(false)
    expect(evidence.allCompleted).toBe(false)
  })

  it('stays Waiting for empty map with foundation reachable', () => {
    const evidence = buildInventoryMigrationAuditEvidence({
      metrics: createEmptyInventoryMigrationMetrics(),
      metricsAvailable: true,
      tableReachable: true,
    })
    expect(evidence.integrityAudit).toBe(AUDIT_EVIDENCE_STATUS.WAITING)
  })
})
