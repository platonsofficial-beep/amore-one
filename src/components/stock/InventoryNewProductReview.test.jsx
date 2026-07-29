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

const { listWorkspaceStoragesMock, getSuppliersMock } = vi.hoisted(() => ({
  listWorkspaceStoragesMock: vi.fn(),
  getSuppliersMock: vi.fn(),
}))

vi.mock('../../services/workspaceStorageService', () => ({
  listWorkspaceStorages: (...args) => listWorkspaceStoragesMock(...args),
  createWorkspaceStorage: vi.fn(),
}))

vi.mock('../../services/supplierService', () => ({
  getSuppliers: (...args) => getSuppliersMock(...args),
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
    getSuppliersMock.mockReset()
    listWorkspaceStoragesMock.mockResolvedValue([
      { id: 's1', locationKey: 'Bar', name: 'Bar', active: true, sortOrder: 0 },
      { id: 's2', locationKey: 'Main Storage', name: 'Main Storage', active: true, sortOrder: 1 },
      { id: 's3', locationKey: 'Apothiki 2', name: 'Apothiki 2', active: true, sortOrder: 2 },
    ])
    getSuppliersMock.mockResolvedValue([
      { id: 'sup-1', companyName: 'Amore Distillery', active: true },
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
    expect(container.textContent).toContain('Review every new product before import.')
    expect(container.textContent).toContain(
      'ONE has suggested units where possible. Confirm Product Name, Category, Unit, and Storage.',
    )
    expect(container.textContent).toContain('Brand New Spirit')
    expect(container.textContent).toContain('New Product')
    expect(container.textContent).toContain('Source storage')
    expect(container.textContent).toContain('2')
    expect(container.textContent).toContain('BAR')
    expect(container.textContent).toContain('1')
    expect(container.querySelector('input[type="text"]')).toBeTruthy()
    expect(container.querySelectorAll('.inventory-new-product-review-fields select').length)
      .toBeGreaterThanOrEqual(3)
    expect(container.textContent).toContain('Supplier')
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

  function buildPreviewWithTwoCreates() {
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
          {
            name: 'Another New Spirit',
            storage: null,
            bar: null,
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

  it('supports select all, clear selection, and smart missing-unit selection', async () => {
    const preview = buildPreviewWithTwoCreates()
    renderReview({
      preview,
      drafts: {},
      categoryOptions: ['Vodka'],
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const selectAll = container.querySelector('input[aria-label="Select all new products"]')
    act(() => {
      selectAll.click()
    })
    expect(container.getAttribute('data-selected-count') || container.querySelector('[data-selected-count]')?.getAttribute('data-selected-count'))
      .toBe('2')
    expect(container.querySelector('[data-selected-count="2"]')).toBeTruthy()
    expect(container.querySelector('.inventory-new-product-bulk-bar')).toBeTruthy()

    act(() => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Clear Selection')
        ?.click()
    })
    expect(container.querySelector('[data-selected-count="0"]')).toBeTruthy()
    expect(container.querySelector('.inventory-new-product-bulk-bar')).toBeNull()

    act(() => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Select Missing Units')
        ?.click()
    })
    expect(Number(container.querySelector('[data-selected-count]')?.getAttribute('data-selected-count')))
      .toBeGreaterThan(0)
  })

  it('bulk assigns storage/unit/category/supplier with undo', async () => {
    const preview = buildPreviewWithTwoCreates()
    const createKeys = listCreateNewPreviewRows(preview).map((entry) => entry.key)
    /** @type {Record<string, object>} */
    let drafts = {}
    const onChangeDraftsBulk = vi.fn((updates) => {
      drafts = { ...drafts, ...updates }
      act(() => {
        root.render(createElement(InventoryNewProductReview, {
          preview,
          drafts,
          workspaceId: 'ws-1',
          categoryOptions: ['Vodka', 'Gin'],
          onChangeDraftsBulk,
        }))
      })
    })

    renderReview({
      preview,
      drafts,
      categoryOptions: ['Vodka', 'Gin'],
      onChangeDraftsBulk,
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listWorkspaceStoragesMock).toHaveBeenCalledWith('ws-1')
    expect(getSuppliersMock).toHaveBeenCalledWith('ws-1')

    act(() => {
      container.querySelector('input[aria-label="Select all new products"]').click()
    })

    act(() => {
      Array.from(container.querySelectorAll('.inventory-new-product-bulk-bar button'))
        .find((button) => button.textContent === 'Assign Storage')
        ?.click()
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    const bulkStorage = container.querySelector('select[aria-label="Bulk assign storage"]')
    expect(Array.from(bulkStorage.options).map((option) => option.value))
      .toEqual(expect.arrayContaining(['Bar', 'Main Storage', 'Apothiki 2']))

    const setNativeValue = (element, value) => {
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')
      descriptor?.set?.call(element, value)
      element.dispatchEvent(new Event('change', { bubbles: true }))
    }

    act(() => {
      setNativeValue(bulkStorage, 'Apothiki 2')
    })
    expect(onChangeDraftsBulk).toHaveBeenCalled()
    createKeys.forEach((key) => {
      expect(drafts[key].storage).toBe('Apothiki 2')
    })
    expect(container.textContent).toContain('Storage assigned to 2 products.')

    act(() => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Undo')
        ?.click()
    })
    createKeys.forEach((key) => {
      expect(drafts[key].storage).not.toBe('Apothiki 2')
    })

    const ensureSelected = () => {
      if (container.querySelector('[data-selected-count="0"]')) {
        act(() => {
          container.querySelector('input[aria-label="Select all new products"]').click()
        })
      }
    }

    ensureSelected()
    act(() => {
      Array.from(container.querySelectorAll('.inventory-new-product-bulk-bar button'))
        .find((button) => button.textContent === 'Assign Unit')
        ?.click()
    })
    act(() => {
      setNativeValue(container.querySelector('select[aria-label="Bulk assign unit"]'), 'Bottle 700ml')
    })
    createKeys.forEach((key) => {
      expect(drafts[key].unit).toBe('Bottle 700ml')
    })

    ensureSelected()
    act(() => {
      Array.from(container.querySelectorAll('.inventory-new-product-bulk-bar button'))
        .find((button) => button.textContent === 'Assign Category')
        ?.click()
    })
    act(() => {
      setNativeValue(container.querySelector('select[aria-label="Bulk assign category"]'), 'Gin')
    })
    createKeys.forEach((key) => {
      expect(drafts[key].category).toBe('Gin')
    })

    ensureSelected()
    act(() => {
      Array.from(container.querySelectorAll('.inventory-new-product-bulk-bar button'))
        .find((button) => button.textContent === 'Assign Supplier')
        ?.click()
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    act(() => {
      setNativeValue(
        container.querySelector('select[aria-label="Bulk assign supplier"]'),
        'Amore Distillery',
      )
    })
    createKeys.forEach((key) => {
      expect(drafts[key].supplier).toBe('Amore Distillery')
      expect(drafts[key].supplierId).toBe('sup-1')
    })
  })
})
