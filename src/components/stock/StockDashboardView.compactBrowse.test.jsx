/**
 * @vitest-environment jsdom
 * P8.24.3 — Compact browse toolbar + six-column List width contract.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { filterStockDashboardItems } from '../../lib/stockDashboardBrowse'

const APP_CSS = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
const DASHBOARD_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/stock/StockDashboardView.jsx'),
  'utf8',
)

function cssRuleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = APP_CSS.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))
  return match?.[1] ?? ''
}

describe('StockDashboardView compact browse CSS contract (P8.24.3)', () => {
  it('removes the wide List overflow floor and uses a fixed full-width table', () => {
    const tableRule = cssRuleBody('.stock-list-table')
    const wrapRule = cssRuleBody('.stock-list-table-wrap')

    expect(tableRule).toContain('width: 100%')
    expect(tableRule).toContain('table-layout: fixed')
    expect(tableRule).toContain('min-width: 0')
    expect(tableRule).not.toContain('min-width: 920px')

    expect(wrapRule).toContain('overflow-x: hidden')
    expect(wrapRule).not.toContain('overflow-x: auto')

    expect(APP_CSS).toMatch(/\.stock-list-cell-actions[\s\S]{0,180}?width:\s*150px/)
    expect(APP_CSS).not.toMatch(/\.stock-list-cell-actions\s*\{[^}]*min-width:\s*220px/)
    expect(APP_CSS).toContain('.stock-compact-browse-toolbar')
    expect(APP_CSS).toContain('.stock-toolbar-overflow')
  })

  it('keeps the compact toolbar and six-column headers in source without legacy chip toolbar duplication', () => {
    expect(DASHBOARD_SOURCE).toContain('data-stock-compact-browse-toolbar')
    expect(DASHBOARD_SOURCE).toContain('StockToolbarOverflowMenu')
    expect(DASHBOARD_SOURCE).toContain('stock-list-head-product')
    expect(DASHBOARD_SOURCE).toContain('stock-list-head-details')
    expect(DASHBOARD_SOURCE).toContain('stock-list-head-stock')
    expect(DASHBOARD_SOURCE).toContain('stock-list-head-status')
    expect(DASHBOARD_SOURCE).toContain('stock-list-head-updated')
    expect(DASHBOARD_SOURCE).toContain('stock-list-head-actions')

    expect(DASHBOARD_SOURCE).not.toContain('stock-dashboard-toolbar${canManage')
    expect(DASHBOARD_SOURCE).not.toContain('stock-filtered-primary-toolbar')
    expect(DASHBOARD_SOURCE).not.toContain('>Category / Type</th>')
    expect(DASHBOARD_SOURCE).not.toContain('>Current Stock</th>')
    expect(DASHBOARD_SOURCE).not.toContain('>Last Movement</th>')
  })

  it('does not reopen P8.24.1 Status × Visibility filter predicates', () => {
    const catalog = [
      {
        id: 'a1',
        name: 'ACTIVE LOW',
        active: true,
        currentQuantity: 1,
        minimumQuantity: 5,
        targetQuantity: 10,
        status: 'ok',
      },
      {
        id: 'i1',
        name: 'INACTIVE LOW',
        active: false,
        currentQuantity: 1,
        minimumQuantity: 5,
        targetQuantity: 10,
        status: 'ok',
      },
      {
        id: 'i2',
        name: 'INACTIVE OUT',
        active: false,
        currentQuantity: 0,
        minimumQuantity: 5,
        targetQuantity: 10,
        status: 'ok',
      },
    ]

    expect(filterStockDashboardItems(catalog, {
      statusFilter: 'low',
      visibilityFilter: 'inactive',
    }).map((item) => item.id)).toEqual(['i1'])

    expect(filterStockDashboardItems(catalog, {
      statusFilter: 'out',
      visibilityFilter: 'all',
    }).map((item) => item.id)).toEqual(['i2'])
  })
})
