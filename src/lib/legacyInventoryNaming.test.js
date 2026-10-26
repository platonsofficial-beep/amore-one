/**
 * @vitest-environment node
 * Legacy Inventory is retired from Stock navigation. Import stays as the spreadsheet screen.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  STOCK_SECTIONS,
  getModuleSubtitle,
  getModuleTitle,
  shouldShowModuleSearch,
} from './appNavigation'
import { readPersistedNavigation } from './navigationPersistence'

const appSource = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')

describe('Retired Legacy Inventory navigation', () => {
  it('removes Legacy Inventory from Stock sections and keeps Import', () => {
    expect(STOCK_SECTIONS.find((section) => section.id === 'inventory')).toBeUndefined()
    expect(STOCK_SECTIONS.map((section) => section.label)).not.toContain('Legacy Inventory')
    expect(STOCK_SECTIONS.find((section) => section.id === 'migration')).toEqual({
      id: 'migration',
      label: 'Import',
    })
    expect(STOCK_SECTIONS.find((section) => section.id === 'count')?.label).toBe('Inventory Count')
    expect(getModuleTitle('stock', { stockSection: 'count' })).toBe('Inventory Count')
    expect(getModuleTitle('stock', { stockSection: 'migration' })).toBe('Import')
  })

  it('describes Import as spreadsheet onboarding', () => {
    const subtitle = getModuleSubtitle('stock', 'Friday', { stockSection: 'migration' })
    expect(subtitle).toContain('spreadsheet')
    expect(subtitle).not.toContain('legacy')
    expect(shouldShowModuleSearch('stock', 'today', 'migration')).toBe(false)
    expect(shouldShowModuleSearch('stock', 'today', 'dashboard')).toBe(true)
  })

  it('sends a saved Legacy Inventory section back to the dashboard', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => JSON.stringify({ activeView: 'stock', stockSection: 'inventory' }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    })
    expect(readPersistedNavigation().stockSection).toBe('dashboard')
    vi.unstubAllGlobals()

    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => JSON.stringify({ activeView: 'stock', stockSection: 'migration' }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    })
    expect(readPersistedNavigation().stockSection).toBe('migration')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not mount the legacy catalog screen', () => {
    expect(appSource).not.toContain('function InventoryView')
    expect(appSource).not.toContain("stockSection === 'inventory'")
    expect(appSource).not.toContain('<h3>Legacy Inventory</h3>')
    expect(appSource).toContain("stockSection === 'migration'")
    expect(appSource).toContain('<StockInventoryMigrationView')
  })
})
