/**
 * P8.16.18 — Legacy Inventory read-only gate.
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

function extractInventoryViewSource() {
  const start = APP_SOURCE.indexOf('function InventoryView({')
  const end = APP_SOURCE.indexOf('function App(', start)
  return APP_SOURCE.slice(start, end)
}

describe('Legacy Inventory read-only gate (P8.16.18)', () => {
  const inventoryView = extractInventoryViewSource()

  it('locks the legacy catalog as read-only', () => {
    expect(APP_SOURCE).toMatch(/const INVENTORY_CATALOG_READ_ONLY = true/)
    expect(APP_SOURCE).not.toMatch(/const INVENTORY_CATALOG_READ_ONLY = false/)
  })

  it('hides Add / Edit / Delete controls when read-only', () => {
    expect(inventoryView).toContain('canManage && !catalogReadOnly')
    expect(inventoryView).toContain("stockTab === 'inventory' && canManage && !catalogReadOnly")
    expect(inventoryView).not.toMatch(/disabled=\{catalogReadOnly \|\| isSaving\}/)
    expect(inventoryView).not.toMatch(/disabled=\{catalogReadOnly\}/)
  })

  it('shows the required read-only notice', () => {
    expect(inventoryView).toContain('inventory-legacy-readonly-notice')
    expect(inventoryView).toContain('This legacy catalog is now read-only.')
    expect(inventoryView).toContain('Manage active stock products from Dashboard.')
  })

  it('keeps browse, search, and filter surfaces available', () => {
    expect(inventoryView).toContain('Filter by stock status')
    expect(inventoryView).toContain('Filter by category')
    expect(inventoryView).toContain('searchTerm')
    expect(inventoryView).toContain('Legacy records')
    expect(inventoryView).toContain('inventoryItems')
  })

  it('guards mutation handlers against legacy writes', () => {
    expect(APP_SOURCE).toMatch(/handleOpenAddInventoryItem = \(\) => \{\s*if \(INVENTORY_CATALOG_READ_ONLY\) return/)
    expect(APP_SOURCE).toMatch(/handleOpenEditInventoryItem = \(item\) => \{\s*if \(INVENTORY_CATALOG_READ_ONLY\) return/)
    expect(APP_SOURCE).toMatch(/handleRequestDeleteInventoryItem = \(item\) => \{\s*if \(INVENTORY_CATALOG_READ_ONLY\) return/)
    expect(APP_SOURCE).toMatch(/handleConfirmDeleteInventoryItem = async \(\) => \{\s*if \(INVENTORY_CATALOG_READ_ONLY\) return/)
    expect(APP_SOURCE).toMatch(/handleInventorySubmit = async \(event\) => \{\s*event\.preventDefault\(\)\s*if \(INVENTORY_CATALOG_READ_ONLY\) return/)
  })

  it('gates legacy-only Bar Refill writes without touching Stock V1', () => {
    expect(APP_SOURCE).toContain('canMutateRefills = canManage && !catalogReadOnly')
    expect(APP_SOURCE).toContain('catalogReadOnly={catalogReadOnly}')
    expect(APP_SOURCE).toMatch(/handleCreateBarRefill = async \(payload\) => \{\s*if \(INVENTORY_CATALOG_READ_ONLY\) return/)
    expect(APP_SOURCE).toMatch(/handleCompleteBarRefill = async \(refillId, payload\) => \{\s*if \(INVENTORY_CATALOG_READ_ONLY\) return/)
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

  it('keeps Legacy Inventory navigation and permissions model intact', () => {
    expect(NAV_SOURCE).toContain("label: 'Legacy Inventory'")
    expect(canManageStock('owner')).toBe(true)
    expect(canManageStock('manager')).toBe(true)
    expect(canManageStock('staff')).toBe(false)
  })
})
