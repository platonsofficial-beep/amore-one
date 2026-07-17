/**
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STOCK_SECTIONS, getModuleTitle, getModuleSubtitle } from './appNavigation'
import { readPersistedNavigation } from './navigationPersistence'

const appSource = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
const inventoryCountSource = readFileSync(
  resolve(process.cwd(), 'src/components/stock/InventoryCountView.jsx'),
  'utf8',
)

describe('Inventory Count section foundation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers Inventory Count in the Stock section navigation', () => {
    expect(STOCK_SECTIONS).toEqual(expect.arrayContaining([
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'count', label: 'Inventory Count' },
      { id: 'inventory', label: 'Inventory' },
      { id: 'suppliers', label: 'Suppliers' },
      { id: 'orders', label: 'Orders' },
      { id: 'migration', label: 'Inventory Migration' },
    ]))
    expect(STOCK_SECTIONS.map((section) => section.id)).toEqual([
      'dashboard',
      'count',
      'inventory',
      'suppliers',
      'orders',
      'migration',
    ])
  })

  it('accepts count in Stock section persistence normalization', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => JSON.stringify({ activeView: 'stock', stockSection: 'count' }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    })

    expect(readPersistedNavigation()).toMatchObject({
      activeView: 'stock',
      stockSection: 'count',
    })
  })

  it('rejects unknown Stock sections without affecting count allowlist', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => JSON.stringify({ activeView: 'stock', stockSection: 'not-a-section' }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    })

    expect(readPersistedNavigation().stockSection).toBe('dashboard')
  })

  it('wires InventoryCountView into the Stock workspace section switch', () => {
    expect(appSource).toContain("import { InventoryCountView } from './components/stock/InventoryCountView'")
    expect(appSource).toContain("activeView === 'stock' && stockSection === 'count'")
    expect(appSource).toContain('<InventoryCountView />')
    expect(appSource).toContain("activeView === 'stock' && stockSection === 'dashboard'")
    expect(appSource).toContain("activeView === 'stock' && stockSection === 'migration'")
  })

  it('keeps the foundation read-only without session or posting wiring', () => {
    expect(inventoryCountSource).toContain('Start new count')
    expect(inventoryCountSource).toContain('disabled')
    expect(inventoryCountSource).toContain('aria-disabled="true"')
    expect(inventoryCountSource).not.toMatch(/onClick|useState|recordStockMovement|createCount|postCount|localStorage|supabase/i)
    expect(inventoryCountSource).toContain('No counts are currently in progress.')
    expect(inventoryCountSource).toContain('No paused counts.')
    expect(inventoryCountSource).toContain('Completed inventory counts will appear here.')
  })

  it('exposes Inventory Count module chrome copy', () => {
    expect(getModuleTitle('stock', { stockSection: 'count' })).toBe('Inventory Count')
    expect(getModuleSubtitle('stock', 'Friday', { stockSection: 'count' })).toContain('review variances')
  })
})
