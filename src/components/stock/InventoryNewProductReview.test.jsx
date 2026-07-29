/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  buildInventoryOperationalImportPreview,
} from '../../lib/inventoryOperationalImportPreview'
import {
  matchInventoryOperationalProducts,
} from '../../lib/inventoryOperationalProductMatcher'
import {
  applyInventoryOperationalMatchResolutions,
  getOperationalMatchResolutionRowKey,
  INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION,
} from '../../lib/inventoryOperationalMatchResolutions'
import {
  listCreateNewPreviewRows,
  mergeNewProductDraft,
} from '../../lib/inventoryNewProductDrafts'
import { InventoryNewProductReview } from './InventoryNewProductReview'

const { listWorkspaceStoragesMock } = vi.hoisted(() => ({
  listWorkspaceStoragesMock: vi.fn(),
}))

vi.mock('../../services/workspaceStorageService', () => ({
  listWorkspaceStorages: (...args) => listWorkspaceStoragesMock(...args),
  createWorkspaceStorage: vi.fn(),
}))

function stock(partial) {
  return {
    id: partial.id,
    name: partial.name,
    category: partial.category ?? 'Vodka',
    unit: partial.unit ?? 'Bottle',
    sku: null,
    active: true,
  }
}

function buildPreviewWithCreateNew() {
  const operationalModel = {
    categories: [{
      name: 'VODKA',
      products: [
        {
          name: 'Brand New Spirit',
          storage: 2,
          bar: 1,
          weekdays: null,
          order: null,
          stockControl: null,
        },
      ],
    }],
  }
  const existingStockItems = [
    stock({ id: 'ko', name: 'KETEL ONE', category: 'Vodka' }),
  ]
  const matchingResult = matchInventoryOperationalProducts({
    operationalModel,
    existingStockItems,
  })
  return buildInventoryOperationalImportPreview({
    operationalModel,
    matchingResult,
    existingStockItems,
  })
}

function buildPreviewAllLinked() {
  const operationalModel = {
    categories: [{
      name: 'VODKA',
      products: [{
        name: 'KETEL ONE',
        storage: 1,
        bar: 0,
        weekdays: null,
        order: null,
        stockControl: null,
      }],
    }],
  }
  const existingStockItems = [stock({ id: 'ko', name: 'KETEL ONE', category: 'Vodka' })]
  const matchingResult = matchInventoryOperationalProducts({
    operationalModel,
    existingStockItems,
  })
  return buildInventoryOperationalImportPreview({
    operationalModel,
    matchingResult,
    existingStockItems,
  })
}

describe('InventoryNewProductReview', () => {
  let container
  let root

  beforeEach(() => {
    listWorkspaceStoragesMock.mockReset()
    listWorkspaceStoragesMock.mockResolvedValue([
      { id: 's1', locationKey: 'Bar', name: 'Bar', active: true, sortOrder: 0 },
      { id: 's2', locationKey: 'Main Storage', name: 'Main Storage', active: true, sortOrder: 1 },
    ])
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
    container = null
    root = null
  })

  function renderReview(props) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(InventoryNewProductReview, {
        workspaceId: 'ws-1',
        ...props,
      }))
    })
  }

  it('renders new product cards with source facts and editable fields', async () => {
    const preview = buildPreviewWithCreateNew()
    const onChangeDraft = vi.fn()
    renderReview({
      preview,
      drafts: {},
      categoryOptions: ['Vodka', 'Gin'],
      onChangeDraft,
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('New Products')
    expect(container.textContent).toContain('Review every new product before importing it into ONE.')
    expect(container.textContent).toContain('Brand New Spirit')
    expect(container.textContent).toContain('New Product')
    expect(container.textContent).toContain('Source storage')
    expect(container.textContent).toContain('2')
    expect(container.textContent).toContain('BAR')
    expect(container.textContent).toContain('1')
    expect(container.querySelector('input[type="text"]')).toBeTruthy()
    expect(container.querySelectorAll('select')).toHaveLength(3)
    expect(container.textContent).toContain('Unit is required')
    expect(container.textContent).not.toContain('Suggested from product name')
    expect(onChangeDraft).not.toHaveBeenCalled()
  })

  it('preselects inferred units and shows suggestion helper until overridden', async () => {
    const operationalModel = {
      categories: [{
        name: 'APERITIVO',
        products: [
          {
            name: 'Campari 1lt',
            storage: 2,
            bar: 1,
            weekdays: null,
            order: null,
            stockControl: null,
          },
          {
            name: 'Ketel One 70cl',
            storage: 1,
            bar: 0,
            weekdays: null,
            order: null,
            stockControl: null,
          },
          {
            name: 'Bitter Truth Apricot Liqueur',
            storage: 1,
            bar: 0,
            weekdays: null,
            order: null,
            stockControl: null,
          },
        ],
      }],
    }
    const existingStockItems = []
    const matchingResult = matchInventoryOperationalProducts({
      operationalModel,
      existingStockItems,
    })
    const preview = buildInventoryOperationalImportPreview({
      operationalModel,
      matchingResult,
      existingStockItems,
    })

    /** @type {Record<string, object>} */
    let drafts = {}
    const onChangeDraft = vi.fn((rowKey, next) => {
      drafts = { ...drafts, [rowKey]: next }
      act(() => {
        root.render(createElement(InventoryNewProductReview, {
          preview,
          drafts,
          workspaceId: 'ws-1',
          categoryOptions: ['APERITIVO'],
          onChangeDraft,
        }))
      })
    })

    renderReview({
      preview,
      drafts,
      categoryOptions: ['APERITIVO'],
      onChangeDraft,
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Campari 1lt')
    expect(container.textContent).toContain('Ketel One 70cl')
    expect(container.textContent).toContain('Suggested from product name')
    expect(container.querySelector('[data-units-suggested]')?.getAttribute('data-units-suggested'))
      .toBe('2')
    expect(container.querySelector('[data-need-unit-selection]')?.getAttribute('data-need-unit-selection'))
      .toBe('1')

    const unitSelects = Array.from(container.querySelectorAll('.inventory-new-product-review select'))
      .filter((select) => Array.from(select.options).some((option) => option.value === 'Bottle 1L'))
    expect(unitSelects[0].value).toBe('Bottle 1L')
    expect(unitSelects[1].value).toBe('Bottle 700ml')
    expect(unitSelects[2].value).toBe('')

    const setNativeValue = (element, value) => {
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')
      descriptor?.set?.call(element, value)
    }
    act(() => {
      setNativeValue(unitSelects[0], 'Liter')
      unitSelects[0].dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onChangeDraft).toHaveBeenCalled()
    expect(container.textContent).toContain('Suggested from product name')
    expect(unitSelects[0].value).toBe('Liter')
  })

  it('emits draft updates for name, category, unit, and storage', async () => {
    const preview = buildPreviewWithCreateNew()
    const { key, row } = listCreateNewPreviewRows(preview)[0]
    /** @type {Record<string, object>} */
    let drafts = {}
    const onChangeDraft = vi.fn((rowKey, next) => {
      drafts = { ...drafts, [rowKey]: next }
      act(() => {
        root.render(createElement(InventoryNewProductReview, {
          preview,
          drafts,
          workspaceId: 'ws-1',
          categoryOptions: ['Vodka', 'Gin', 'VODKA'],
          onChangeDraft,
        }))
      })
    })

    renderReview({
      preview,
      drafts,
      categoryOptions: ['Vodka', 'Gin', 'VODKA'],
      onChangeDraft,
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const setNativeValue = (element, value) => {
      const prototype = element.tagName === 'SELECT'
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
      descriptor?.set?.call(element, value)
    }

    const nameInput = container.querySelector('input[type="text"]')
    act(() => {
      setNativeValue(nameInput, 'Renamed Spirit')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onChangeDraft).toHaveBeenCalled()
    expect(drafts[key].productName).toBe('Renamed Spirit')

    const selects = container.querySelectorAll('.inventory-new-product-review-fields select')
    act(() => {
      setNativeValue(selects[0], 'Gin')
      selects[0].dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(drafts[key].category).toBe('Gin')

    act(() => {
      setNativeValue(selects[1], 'Bottle 700ml')
      selects[1].dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(drafts[key].unit).toBe('Bottle 700ml')

    act(() => {
      setNativeValue(selects[2], 'Bar')
      selects[2].dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(drafts[key].storage).toBe('Bar')

    const merged = mergeNewProductDraft(row, drafts[key])
    expect(merged.unit).toBe('Bottle 700ml')
    expect(merged.storage).toBe('Bar')
  })

  it('shows empty state when there are no create_new rows', () => {
    renderReview({
      preview: buildPreviewAllLinked(),
      drafts: {},
      categoryOptions: ['Vodka'],
    })
    expect(container.textContent).toContain('No new products')
    expect(container.textContent).toContain(
      'All rows will link to existing ONE products or be skipped.',
    )
  })

  it('excludes skipped rows from the review list', () => {
    const base = buildPreviewWithCreateNew()
    // Force a second possible-match style row via resolution skip path is heavy;
    // assert listCreateNewPreviewRows ignores non-create_new proposedAction.
    const preview = applyInventoryOperationalMatchResolutions({
      preview: {
        ...base,
        rows: [
          ...base.rows,
          {
            ...base.rows[0],
            proposedAction: 'skip',
            source: {
              ...base.rows[0].source,
              productName: 'Skipped Spirit',
            },
          },
        ],
      },
      resolutions: {},
    })
    const keys = listCreateNewPreviewRows(preview).map((entry) => entry.row.source.productName)
    expect(keys).toContain('Brand New Spirit')
    expect(keys).not.toContain('Skipped Spirit')

    renderReview({
      preview,
      drafts: {},
      categoryOptions: ['Vodka'],
    })
    expect(container.textContent).toContain('Brand New Spirit')
    expect(container.textContent).not.toContain('Skipped Spirit')
  })
})
