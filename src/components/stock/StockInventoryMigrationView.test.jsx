/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { STOCK_SECTIONS, getModuleTitle } from '../../lib/appNavigation'
import { StockInventoryMigrationView } from './StockInventoryMigrationView'

describe('Stock spreadsheet import', () => {
  let host = null
  let root = null

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    host?.remove()
    host = null
    root = null
  })

  it('keeps the migration section id and labels the nav Import', () => {
    expect(STOCK_SECTIONS.find((section) => section.id === 'migration')).toEqual({
      id: 'migration',
      label: 'Import',
    })
    expect(STOCK_SECTIONS.find((section) => section.id === 'inventory')).toBeUndefined()
    expect(getModuleTitle('stock', { stockSection: 'migration' })).toBe('Import')
  })

  it('starts spreadsheet import and does not offer legacy migration', () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    let opened = 0

    act(() => {
      root.render(createElement(StockInventoryMigrationView, {
        onOpenInventoryImport: () => {
          opened += 1
        },
      }))
    })

    expect(host.textContent).toContain('Spreadsheet Import')
    expect(host.textContent).not.toContain('Legacy Inventory')
    expect(host.querySelector('[data-stock-migration-open-legacy]')).toBeNull()
    expect(host.querySelector('[data-stock-migration-ownership="legacy-migration"]')).toBeNull()

    act(() => {
      host.querySelector('[data-stock-migration-open-import="true"]').click()
    })
    expect(opened).toBe(1)

    const source = readFileSync(resolve(process.cwd(), 'src/components/stock/StockInventoryMigrationView.jsx'), 'utf8')
    expect(source).not.toMatch(/StockMigrationOperatorPanel|inventoryMigration/)
  })
})
