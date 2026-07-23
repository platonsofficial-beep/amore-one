/**
 * @vitest-environment node
 * P8.16.17 — Legacy Inventory naming & context clarification (copy only).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  STOCK_SECTIONS,
  getModuleTitle,
  getModuleSubtitle,
  getSearchPlaceholder,
} from './appNavigation'

const appSource = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
const appNavigationSource = readFileSync(resolve(process.cwd(), 'src/lib/appNavigation.js'), 'utf8')
const dashboardSource = readFileSync(
  resolve(process.cwd(), 'src/components/stock/StockDashboardView.jsx'),
  'utf8',
)

describe('Legacy Inventory naming (P8.16.17)', () => {
  it('renders Legacy Inventory in Stock navigation and retires the bare Inventory label for that target', () => {
    const inventorySection = STOCK_SECTIONS.find((section) => section.id === 'inventory')
    expect(inventorySection).toEqual({ id: 'inventory', label: 'Legacy Inventory' })
    expect(STOCK_SECTIONS.map((section) => section.label)).toContain('Legacy Inventory')
    expect(STOCK_SECTIONS.map((section) => section.label)).not.toContain('Inventory')
    expect(getModuleTitle('stock', { stockSection: 'inventory' })).toBe('Legacy Inventory')
  })

  it('keeps Inventory Count, Inventory Import entry, and Inventory Migration labels unchanged', () => {
    expect(STOCK_SECTIONS.find((section) => section.id === 'count')?.label).toBe('Inventory Count')
    expect(STOCK_SECTIONS.find((section) => section.id === 'migration')?.label).toBe('Inventory Migration')
    expect(getModuleTitle('stock', { stockSection: 'count' })).toBe('Inventory Count')
    expect(getModuleTitle('stock', { stockSection: 'migration' })).toBe('Inventory Migration')
    expect(dashboardSource).toContain('Inventory Import')
    expect(STOCK_SECTIONS.map((section) => section.label)).not.toContain('Inventory Import')
  })

  it('exposes module subtitle that points managers to Dashboard as the live catalog', () => {
    const subtitle = getModuleSubtitle('stock', 'Friday', { stockSection: 'inventory' })
    expect(subtitle).toContain('Legacy product records')
    expect(subtitle).toContain('Dashboard')
    expect(getSearchPlaceholder('stock', { stockSection: 'inventory' })).toBe('Search legacy inventory')
    expect(getSearchPlaceholder('stock', { stockSection: 'dashboard' })).toBe('Search stock item')
  })

  it('shows an always-visible Legacy Inventory context notice on the page', () => {
    expect(appSource).toContain('inventory-legacy-context-notice')
    expect(appSource).toContain('<strong>Legacy records</strong>')
    expect(appSource).toContain('Live stock products are managed from Dashboard')
    expect(appSource).toContain('do not automatically update Dashboard products')
    expect(appSource).toContain('<h3>Legacy Inventory</h3>')
    expect(appSource).not.toContain('<h3>Stock Control Center</h3>')
  })

  it('uses legacy-specific delete confirmation copy without claiming Dashboard deletion', () => {
    expect(appSource).toContain('Delete legacy inventory record?')
    expect(appSource).toContain('This removes only the legacy Inventory record.')
    expect(appSource).toContain('It does not delete or deactivate a Dashboard product.')
    expect(appSource).not.toContain('Delete stock item?')
    expect(appSource).not.toContain('Close delete stock item dialog')
  })

  it('clarifies create/edit dialogs as legacy without changing CRUD callbacks', () => {
    expect(appSource).toContain("editingInventoryItem ? 'Edit legacy record' : 'Add legacy record'")
    expect(appSource).toContain("await deleteInventoryItem(inventoryPendingDelete.id)")
    expect(appSource).toContain('onOpenAddItem')
    expect(appSource).toContain('onOpenEditItem')
    expect(appSource).toContain('onRequestDeleteItem')
    expect(appSource).toMatch(/const INVENTORY_CATALOG_READ_ONLY = false/)
  })

  it('keeps Stock section tabs wrapping so longer Legacy Inventory nav can reflow on iPad landscape', () => {
    expect(appCss).toMatch(/\.module-section-tabs\s*\{[\s\S]*?flex-wrap:\s*wrap;/)
    expect(appCss).toContain('.app-shell.stock-focus-mode .module-section-tabs')
    expect(appNavigationSource).toContain("label: 'Legacy Inventory'")
    expect(STOCK_SECTIONS.find((section) => section.id === 'inventory')?.label.length).toBeGreaterThan(
      'Inventory'.length,
    )
  })
})
