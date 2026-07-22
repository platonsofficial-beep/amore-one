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

  it('renders preview summary and expected actions from existing metrics', () => {
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
    expect(container.textContent).toContain('Migration summary')
    expect(container.textContent).toContain('Expected actions')
    expect(container.textContent).toContain('Will Link')
    expect(container.textContent).toContain('Will Create')
    expect(container.textContent).toContain('Needs Review')
    expect(container.textContent).toContain('Skipped')
    expect(container.textContent).toContain('Preview notes')
    expect(container.textContent).toContain('No data has been changed.')
    expect(container.textContent).toContain('40')
    expect(container.textContent).toContain('5')
    expect(container.textContent).toContain('3')
    expect(container.querySelector('button')).toBeNull()
    expect(container.textContent).not.toMatch(/\bContinue\b/)
    expect(container.textContent).not.toMatch(/Execute Phase/i)
  })

  it('shows Unknown placeholders when metrics are unavailable', () => {
    renderPreview({
      metrics: createEmptyInventoryMigrationMetrics(),
      metricsAvailable: false,
    })

    expect(container.textContent).toContain('Unknown')
    expect(container.textContent).toContain('No data has been changed.')
    expect(container.textContent).not.toMatch(/\bNaN\b/)

    const cards = buildPreviewSummaryCards({ metricsAvailable: false })
    expect(cards.every((card) => card.value === 'Unknown')).toBe(true)

    const actions = buildPreviewExpectedActions({ metricsAvailable: false })
    expect(actions).toHaveLength(1)
    expect(actions[0].title).toBe('Unknown')
  })

  it('computes remaining unresolved only from existing metric fields', () => {
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
    expect(source).toContain('Read-only')
    expect(source).toContain('No data has been changed.')
  })
})
