/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildPreflightChecks,
  PREFLIGHT_CHECK_STATUS,
  StockMigrationPreflightWorkspace,
  summarizePreflightChecks,
} from './StockMigrationPreflightWorkspace'
import { createEmptyInventoryMigrationMetrics } from '../../lib/inventoryMigrationMetrics'

const HERE = dirname(fileURLToPath(import.meta.url))

describe('StockMigrationPreflightWorkspace', () => {
  let container
  let root

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
    container = null
    root = null
  })

  function renderPreflight(props = {}) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(StockMigrationPreflightWorkspace, props))
    })
  }

  it('renders ready preflight from existing health and metrics only', () => {
    const metrics = {
      ...createEmptyInventoryMigrationMetrics(),
      legacyItems: 12,
      total: 12,
      remainingClassifiedAutoLink: 0,
      remainingClassifiedAutoCreate: 0,
      manualReview: 0,
    }

    renderPreflight({
      workspaceLabel: 'AMORE.NICOSIA',
      metrics,
      metricsAvailable: true,
      tableReachable: true,
      health: {
        readiness: 'Ready',
        summary: 'Migration is ready for execution.',
        manualQueueSize: 0,
        attentionQueueSize: 0,
        unknownPipelineStages: 0,
      },
      auditEvidence: {
        integrityAudit: 'Waiting',
        preflight: 'Waiting',
      },
      attentionCount: 0,
      acknowledgementCount: 2,
    })

    expect(container.querySelector('[aria-label="Migration preflight workspace"]')).toBeTruthy()
    expect(container.textContent).toContain('Preflight Workspace')
    expect(container.textContent).toContain('Ready')
    expect(container.textContent).toContain('Readiness checks')
    expect(container.textContent).toContain('Environment information')
    expect(container.textContent).toContain('Recommendations')
    expect(container.textContent).toContain('AMORE.NICOSIA')
    expect(container.textContent).toContain('PASS')
    expect(container.textContent).toContain('WARNING')
    expect(container.querySelector('button')).toBeNull()
    expect(container.textContent).not.toMatch(/\bContinue\b/)
    expect(container.textContent).not.toMatch(/Run Preflight/i)
  })

  it('shows Needs Attention and blocking checks for manual review', () => {
    renderPreflight({
      workspaceLabel: 'AMORE.NICOSIA',
      metrics: {
        ...createEmptyInventoryMigrationMetrics(),
        legacyItems: 10,
        total: 10,
        manualReview: 3,
        remainingClassifiedAutoLink: 1,
      },
      metricsAvailable: true,
      tableReachable: true,
      health: {
        readiness: 'Not Ready',
        summary: 'Migration requires manual review before execution.',
        manualQueueSize: 3,
        attentionQueueSize: 0,
        unknownPipelineStages: 0,
      },
      auditEvidence: {
        integrityAudit: 'Waiting',
        preflight: 'Waiting',
      },
      attentionCount: 0,
      acknowledgementCount: 0,
    })

    expect(container.textContent).toContain('Needs Attention')
    expect(container.textContent).toContain('BLOCKED')
    expect(container.textContent).toContain('Resolve manual review rows before proceeding.')
    expect(container.textContent).toContain('3')
  })

  it('uses Unknown placeholders when metrics are unavailable', () => {
    renderPreflight({
      workspaceLabel: 'AMORE.NICOSIA',
      metrics: createEmptyInventoryMigrationMetrics(),
      metricsAvailable: false,
      tableReachable: false,
      health: {
        readiness: 'Unknown',
        summary: 'Migration health cannot yet be determined.',
      },
      auditEvidence: null,
      attentionCount: 0,
      acknowledgementCount: 0,
    })

    expect(container.textContent).toContain('Unknown')
    expect(container.textContent).toContain('UNKNOWN')
    expect(container.textContent).toContain('Refresh migration metrics to evaluate preflight readiness.')
    expect(container.textContent).not.toMatch(/\bNaN\b/)
  })

  it('buildPreflightChecks never invents pass without available metrics', () => {
    const checks = buildPreflightChecks({ metricsAvailable: false })
    expect(checks.every((item) => item.status === PREFLIGHT_CHECK_STATUS.UNKNOWN)).toBe(true)
    expect(summarizePreflightChecks(checks).passed).toBe(0)
  })

  it('remains presentation-only with no RPC or execution imports', () => {
    const source = readFileSync(join(HERE, 'StockMigrationPreflightWorkspace.jsx'), 'utf8')
    expect(source).not.toMatch(/runInventoryMigration|run_inventory_migration_/i)
    expect(source).not.toMatch(/inventoryMigrationExecutionService/i)
    expect(source).not.toContain('supabase')
    expect(source).not.toContain('Continue')
    expect(source).toContain('Read-only')
  })
})
