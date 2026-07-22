/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  InventoryOperationalProductRow,
  formatOperationalReviewValue,
} from './InventoryOperationalProductRow'
import { InventoryOperationalCategory } from './InventoryOperationalCategory'
import {
  InventoryOperationalReview,
  formatOperationalParserVersionLabel,
} from './InventoryOperationalReview'

describe('formatOperationalReviewValue', () => {
  it('renders nullish and blank values as em dash', () => {
    expect(formatOperationalReviewValue(null)).toBe('—')
    expect(formatOperationalReviewValue(undefined)).toBe('—')
    expect(formatOperationalReviewValue('')).toBe('—')
    expect(formatOperationalReviewValue('  ')).toBe('—')
  })

  it('preserves finite numbers and trimmed strings', () => {
    expect(formatOperationalReviewValue(1.8)).toBe('1.8')
    expect(formatOperationalReviewValue(' 6 ')).toBe('6')
  })
})

describe('InventoryOperationalProductRow', () => {
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

  it('renders product metrics and never exposes editable controls', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root.render(createElement(InventoryOperationalProductRow, {
        product: {
          name: 'Absolut Blue',
          storage: 6,
          bar: 1.8,
          order: null,
          stockControl: null,
        },
      }))
    })

    expect(container.textContent).toContain('Absolut Blue')
    expect(container.textContent).toContain('Storage')
    expect(container.textContent).toContain('6')
    expect(container.textContent).toContain('BAR')
    expect(container.textContent).toContain('1.8')
    expect(container.textContent).toContain('Order')
    expect(container.textContent).toContain('Stock Control')
    expect(container.textContent).toContain('—')
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('textarea')).toBeNull()
    expect(container.querySelector('select')).toBeNull()
  })
})

describe('InventoryOperationalCategory', () => {
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

  function renderCategory(category) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(InventoryOperationalCategory, {
        category,
        index: 0,
      }))
    })
  }

  it('renders expanded by default with product count and supports collapse/expand', () => {
    renderCategory({
      name: 'VODKA',
      products: [
        { name: 'Absolut Blue', storage: 6, bar: 1.8, order: null, stockControl: null },
        { name: 'Grey Goose', storage: 2, bar: 1, order: 1, stockControl: null },
      ],
    })

    expect(container.textContent).toContain('VODKA')
    expect(container.textContent).toContain('(2)')
    expect(container.textContent).toContain('Absolut Blue')
    expect(container.textContent).toContain('Grey Goose')

    const toggle = container.querySelector('button')
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')

    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(container.textContent).not.toContain('Absolut Blue')

    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain('Absolut Blue')
  })
})

describe('InventoryOperationalReview', () => {
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

  it('formats parser version labels', () => {
    expect(formatOperationalParserVersionLabel('operational_sheet_parser_v1')).toBe('v1')
  })

  it('renders summary counts and categories', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root.render(createElement(InventoryOperationalReview, {
        model: {
          parserVersion: 'operational_sheet_parser_v1',
          summary: { categoryCount: 2, productCount: 3 },
          categories: [
            {
              name: 'VODKA',
              products: [
                { name: 'A', storage: 1, bar: 1, order: null, stockControl: null },
                { name: 'B', storage: 2, bar: null, order: null, stockControl: null },
              ],
            },
            {
              name: 'GIN',
              products: [
                { name: 'C', storage: 3, bar: 1, order: 2, stockControl: 4 },
              ],
            },
          ],
        },
      }))
    })

    expect(container.textContent).toContain('Operational Weekly Stock Sheet')
    expect(container.textContent).toContain('Categories: 2')
    expect(container.textContent).toContain('Products: 3')
    expect(container.textContent).toContain('Parser: v1')
    expect(container.textContent).toContain('Read-only')
    expect(container.textContent).toContain('VODKA')
    expect(container.textContent).toContain('GIN')
  })

  it('renders a premium empty state when there are no categories', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root.render(createElement(InventoryOperationalReview, {
        model: {
          parserVersion: 'operational_sheet_parser_v1',
          summary: { categoryCount: 0, productCount: 0 },
          categories: [],
        },
      }))
    })

    expect(container.textContent).toContain('No categories detected')
    expect(container.querySelector('.inventory-operational-review-empty')).toBeTruthy()
  })
})
