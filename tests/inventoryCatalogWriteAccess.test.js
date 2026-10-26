/**
 * Legacy Inventory writes are gone with the screen. Live Stock writes stay.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { canManageStock } from '../src/lib/permissions.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_SOURCE = readFileSync(join(HERE, '../src/App.jsx'), 'utf8')
const DASHBOARD_SOURCE = readFileSync(join(HERE, '../src/components/stock/StockDashboardView.jsx'), 'utf8')
const COUNT_SOURCE = readFileSync(join(HERE, '../src/components/stock/InventoryCountView.jsx'), 'utf8')
const ORDERS_SOURCE = readFileSync(join(HERE, '../src/components/stock/StockOrdersView.jsx'), 'utf8')
const NAV_SOURCE = readFileSync(join(HERE, '../src/lib/appNavigation.js'), 'utf8')

describe('Legacy Inventory screen retirement', () => {
  it('removes the legacy catalog screen and its write handlers', () => {
    expect(APP_SOURCE).not.toContain('function InventoryView')
    expect(APP_SOURCE).not.toContain('INVENTORY_CATALOG_READ_ONLY')
    expect(APP_SOURCE).not.toContain('handleOpenAddInventoryItem')
    expect(APP_SOURCE).not.toContain('handleCreateBarRefill')
    expect(APP_SOURCE).not.toContain('createInventoryItem')
    expect(APP_SOURCE).not.toContain('deleteInventoryItem')
  })

  it('does not change Dashboard / Count / Orders write surfaces', () => {
    expect(DASHBOARD_SOURCE).toContain('onCreateItem')
    expect(DASHBOARD_SOURCE).toContain('onUpdateItem')
    expect(DASHBOARD_SOURCE).toContain('onDeactivateItem')
    expect(COUNT_SOURCE).toContain('Inventory Count')
    expect(ORDERS_SOURCE).toContain('Create order')
    expect(APP_SOURCE).toContain('handleCreateStockItem')
    expect(APP_SOURCE).toContain('handleDeactivateStockItem')
  })

  it('keeps Import for managers and leaves staff without stock management', () => {
    expect(NAV_SOURCE).toContain("label: 'Import'")
    expect(NAV_SOURCE).not.toContain("label: 'Legacy Inventory'")
    expect(canManageStock('owner')).toBe(true)
    expect(canManageStock('manager')).toBe(true)
    expect(canManageStock('staff')).toBe(false)
  })
})
