/**
 * P8.16.14d — Legacy Stock catalog write access follows canManageStock.
 * Edit/Delete buttons are gated by INVENTORY_CATALOG_READ_ONLY, not by omitting owner.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { canManageStock } from '../src/lib/permissions.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_SOURCE = readFileSync(join(HERE, '../src/App.jsx'), 'utf8')

describe('inventory catalog write access', () => {
  it('keeps the legacy catalog writable (not hard-locked read-only)', () => {
    expect(APP_SOURCE).toMatch(/const INVENTORY_CATALOG_READ_ONLY = false/)
    expect(APP_SOURCE).not.toMatch(/const INVENTORY_CATALOG_READ_ONLY = true/)
  })

  it('disables Edit/Delete only via catalogReadOnly, while visibility uses canManage', () => {
    expect(APP_SOURCE).toMatch(/disabled=\{catalogReadOnly\}/)
    expect(APP_SOURCE).toMatch(/\{canManage \? \(/)
    expect(APP_SOURCE).toMatch(/onOpenEditItem/)
    expect(APP_SOURCE).toMatch(/onRequestDeleteItem/)
  })

  it('allows owner and other stock managers via existing canManageStock', () => {
    expect(canManageStock('owner')).toBe(true)
    expect(canManageStock('general_manager')).toBe(true)
    expect(canManageStock('manager')).toBe(true)
  })

  it('denies staff and host via existing canManageStock', () => {
    expect(canManageStock('staff')).toBe(false)
    expect(canManageStock('host')).toBe(false)
  })

  it('hides the read-only banner when the catalog is writable', () => {
    expect(APP_SOURCE).toMatch(
      /catalogReadOnly && \(stockTab === 'inventory' \|\| stockTab === 'reorder'\)/,
    )
  })
})
