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
  buildPreviewExecutionData,
  buildPreviewExpectedActions,
  buildPreviewSummaryCards,
  StockMigrationPreviewWorkspace,
} from './StockMigrationPreviewWorkspace'
import { createEmptyInventoryMigrationMetrics } from '../../lib/inventoryMigrationMetrics'

const HERE = dirname(fileURLToPath(import.meta.url))

describe('StockMigrationPreviewWorkspace', () => {
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

  function renderPreview(props = {}) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(StockMigrationPreviewWorkspace, props))
    })
  }

  it('renders real migration-map metrics for expected actions and remaining unresolved', () => {
    const metrics = {
      ...createEmptyInventoryMigrationMetrics(),
      legacyItems: 40,
      total: 40,
      autoLink: 18,
      autoCreate: 12,
      manualReview: 4,
      skipped: 2,
      remainingClassifiedAutoLink: 5,
      remainingClassifiedAutoCreate: 3,
    }

    renderPreview({
      metrics,
      metricsAvailable: true,
    })

    expect(container.querySelector('[aria-label="Migration preview workspace"]')).toBeTruthy()
    expect(container.textContent).toContain('Preview Workspace')
    expect(container.textContent).toContain('Will Link')
    expect(container.textContent).toContain('Will Create')
    expect(container.textContent).toContain('Needs Review')
    expect(container.textContent).toContain('Skipped')
    expect(container.textContent).toContain('Remaining unresolved')
    expect(container.textContent).toContain('No data has been changed.')
    expect(container.querySelector('button')).toBeNull()

    const data = buildPreviewExecutionData({ metrics, metricsAvailable: true })
    expect(data).toEqual({
      legacyRows: '40',
      autoLink: '18',
      autoCreate: '12',
      manualReview: '4',
      remainingUnresolved: '12',
      willLink: '5',
      willCreate: '3',
      needsReview: '4',
      skipped: '2',
    })

    const actions = buildPreviewExpectedActions({ metrics, metricsAvailable: true })
    expect(actions.map((item) => [item.title, item.value])).toEqual([
      ['Will Link', '5'],
      ['Will Create', '3'],
      ['Needs Review', '4'],
      ['Skipped', '2'],
    ])
  })

  it('keeps action row structure and shows Unknown when metrics are unavailable', () => {
    renderPreview({
      metrics: createEmptyInventoryMigrationMetrics(),
      metricsAvailable: false,
    })

    expect(container.textContent).toContain('Will Link')
    expect(container.textContent).toContain('Will Create')
    expect(container.textContent).toContain('Needs Review')
    expect(container.textContent).toContain('Skipped')
    expect(container.textContent).toContain('Unknown')
    expect(container.textContent).not.toMatch(/\bNaN\b/)

    const data = buildPreviewExecutionData({ metricsAvailable: false })
    expect(Object.values(data).every((value) => value === 'Unknown')).toBe(true)

    const cards = buildPreviewSummaryCards({ metricsAvailable: false })
    expect(cards.every((card) => card.value === 'Unknown')).toBe(true)

    const actions = buildPreviewExpectedActions({ metricsAvailable: false })
    expect(actions).toHaveLength(4)
    expect(actions.every((item) => item.value === 'Unknown')).toBe(true)
  })

  it('computes remaining unresolved only from existing remaining/manual metric fields', () => {
    const cards = buildPreviewSummaryCards({
      metricsAvailable: true,
      metrics: {
        ...createEmptyInventoryMigrationMetrics(),
        remainingClassifiedAutoLink: 2,
        remainingClassifiedAutoCreate: 3,
        manualReview: 4,
      },
    })
    const remaining = cards.find((card) => card.id === 'remaining')
    expect(remaining?.value).toBe('9')
  })

  it('remains presentation-only with no RPC or execution imports', () => {
    const source = readFileSync(join(HERE, 'StockMigrationPreviewWorkspace.jsx'), 'utf8')
    expect(source).not.toMatch(/runInventoryMigration|run_inventory_migration_/i)
    expect(source).not.toMatch(/inventoryMigrationExecutionService/i)
    expect(source).not.toContain('supabase')
    expect(source).not.toContain('Continue')
    expect(source).toContain('remainingClassifiedAutoLink')
    expect(source).toContain('remainingClassifiedAutoCreate')
    expect(source).toContain('manualReview')
    expect(source).toContain('skipped')
    expect(source).toContain('No data has been changed.')
  })
})
