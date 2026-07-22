/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  INVENTORY_OPERATIONAL_MATCH_STATUS,
  matchInventoryOperationalProducts,
} from '../../lib/inventoryOperationalProductMatcher'
import {
  INVENTORY_OPERATIONAL_MATCHING_PREVIEW_LIMIT,
  InventoryOperationalMatchingSummary,
  getOperationalMatchStatusPresentation,
} from './InventoryOperationalMatchingSummary'

describe('getOperationalMatchStatusPresentation', () => {
  it('maps matcher statuses to read-only badges', () => {
    expect(getOperationalMatchStatusPresentation(INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH))
      .toEqual({ symbol: '✓', label: 'Exact Match', className: 'is-exact' })
    expect(getOperationalMatchStatusPresentation(INVENTORY_OPERATIONAL_MATCH_STATUS.POSSIBLE_MATCH))
      .toEqual({ symbol: '⚠', label: 'Possible Match', className: 'is-possible' })
    expect(getOperationalMatchStatusPresentation(INVENTORY_OPERATIONAL_MATCH_STATUS.NEW_PRODUCT))
      .toEqual({ symbol: '➕', label: 'New Product', className: 'is-new' })
    expect(getOperationalMatchStatusPresentation(INVENTORY_OPERATIONAL_MATCH_STATUS.INVALID_SOURCE))
      .toEqual({ symbol: '✕', label: 'Invalid', className: 'is-invalid' })
  })
})

describe('InventoryOperationalMatchingSummary', () => {
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

  function renderSummary(result) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(InventoryOperationalMatchingSummary, { result }))
    })
  }

  it('renders summary counts from the matcher result', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: {
        categories: [
          {
            name: 'VODKA',
            products: [
              { name: 'Belvedere', storage: 1, bar: 1, weekdays: null, order: null, stockControl: null },
              { name: 'Absolut Blue', storage: 1, bar: 1, weekdays: null, order: null, stockControl: null },
              { name: 'Mystery', storage: null, bar: null, weekdays: null, order: null, stockControl: null },
              { name: '   ', storage: null, bar: null, weekdays: null, order: null, stockControl: null },
            ],
          },
        ],
      },
      existingStockItems: [
        { id: '1', name: 'Belvedere', category: 'Vodka', unit: 'Bottle', sku: null, active: true },
        { id: '2', name: 'Absolut Blue Extra', category: 'Vodka', unit: 'Bottle', sku: null, active: true },
      ],
    })

    renderSummary(result)

    expect(container.textContent).toContain('Operational Matching')
    expect(container.textContent).toContain('✓ Exact Matches: 1')
    expect(container.textContent).toContain('⚠ Possible Matches: 1')
    expect(container.textContent).toContain('➕ New Products: 1')
    expect(container.textContent).toContain('✕ Invalid Rows: 1')
    expect(container.textContent).toContain('Read-only')
    expect(container.querySelector('button')).toBeNull()
  })

  it('renders status badges for preview rows', () => {
    const result = matchInventoryOperationalProducts({
      operationalModel: {
        categories: [
          {
            name: 'GIN',
            products: [
              { name: 'Tanqueray', storage: null, bar: null, weekdays: null, order: null, stockControl: null },
              { name: 'Bombay', storage: null, bar: null, weekdays: null, order: null, stockControl: null },
            ],
          },
        ],
      },
      existingStockItems: [
        { id: '1', name: 'Tanqueray', category: 'Gin', unit: 'Bottle', sku: null, active: true },
      ],
    })

    renderSummary(result)

    const rows = container.querySelectorAll('.inventory-operational-matching-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].getAttribute('data-match-status')).toBe('exact_match')
    expect(rows[0].textContent).toContain('Tanqueray')
    expect(rows[0].textContent).toContain('✓ Exact Match')
    expect(rows[1].getAttribute('data-match-status')).toBe('new_product')
    expect(rows[1].textContent).toContain('➕ New Product')
  })

  it('shows only the first 20 rows', () => {
    const products = Array.from({ length: 25 }, (_, index) => ({
      name: `Product ${index + 1}`,
      storage: null,
      bar: null,
      weekdays: null,
      order: null,
      stockControl: null,
    }))
    const result = matchInventoryOperationalProducts({
      operationalModel: { categories: [{ name: 'TEST', products }] },
      existingStockItems: [],
    })

    renderSummary(result)

    expect(result.matches).toHaveLength(25)
    expect(container.querySelector('.inventory-operational-matching')
      ?.getAttribute('data-match-total')).toBe('25')
    expect(container.querySelector('.inventory-operational-matching')
      ?.getAttribute('data-match-preview-count')).toBe(String(INVENTORY_OPERATIONAL_MATCHING_PREVIEW_LIMIT))
    expect(container.querySelectorAll('.inventory-operational-matching-row'))
      .toHaveLength(INVENTORY_OPERATIONAL_MATCHING_PREVIEW_LIMIT)
    expect(container.textContent).toContain('Product 1')
    expect(container.textContent).toContain('Product 20')
    expect(container.textContent).not.toContain('Product 21')
  })

  it('shows a premium empty state when there are zero match rows', () => {
    renderSummary({
      matcherVersion: 1,
      matches: [],
      summary: {
        total: 0,
        exactMatch: 0,
        possibleMatch: 0,
        newProduct: 0,
        invalidSource: 0,
      },
    })

    expect(container.textContent).toContain('No matching rows')
    expect(container.querySelector('.inventory-operational-matching-rows')).toBeNull()
  })

  it('never crashes when result is null', () => {
    renderSummary(null)
    expect(container.textContent).toContain('Operational Matching')
    expect(container.textContent).toContain('No matching rows')
  })
})
