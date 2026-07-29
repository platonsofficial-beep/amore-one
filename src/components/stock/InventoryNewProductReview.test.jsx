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
        workspaceStorages: [
          { id: 's1', locationKey: 'Bar', name: 'Bar', active: true, sortOrder: 0 },
          { id: 's2', locationKey: 'Main Storage', name: 'Main Storage', active: true, sortOrder: 1 },
          { id: 's3', locationKey: 'Apothiki 2', name: 'Apothiki 2', active: true, sortOrder: 2 },
        ],
        quantitySourceColumns: [
          { sourceField: 'storage', sourceHeader: 'Storage', sourceColumnIndex: 1 },
          { sourceField: 'bar', sourceHeader: 'BAR', sourceColumnIndex: 2 },
        ],
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
      'ONE has suggested units where possible. Confirm Product Name, Category, Unit, and location quantities.',
    )
    expect(container.textContent).toContain('Brand New Spirit')
    expect(container.textContent).toContain('New Product')
    expect(container.textContent).toContain('Location Quantities')
    expect(container.textContent).toContain('Total Opening Stock')
    expect(container.textContent).toContain('3')
    expect(container.querySelector('[data-testid="inventory-import-location-allocations"]')).toBeTruthy()
    expect(container.querySelector('input[type="text"]')).toBeTruthy()
    expect(container.querySelectorAll('.inventory-new-product-review-fields select').length)
      .toBeGreaterThanOrEqual(2)
    expect(container.textContent).toContain('Supplier')
    expect(container.textContent).toContain('Unit is required')
    expect(container.textContent).not.toContain('Suggested from product name')
    expect(onChangeDraft).not.toHaveBeenCalled()
  })

  it('updates total opening stock when a location quantity is edited', async () => {
    const preview = buildPreviewWithCreateNew()
    /** @type {Record<string, object>} */
    let drafts = {}
    const sharedProps = {
      workspaceId: 'ws-1',
      preview,
      categoryOptions: ['Vodka'],
      workspaceStorages: [
        { id: 's1', locationKey: 'Bar', name: 'Bar', active: true, sortOrder: 0 },
        { id: 's2', locationKey: 'Main Storage', name: 'Main Storage', active: true, sortOrder: 1 },
      ],
      quantitySourceColumns: [
        { sourceField: 'storage', sourceHeader: 'Storage', sourceColumnIndex: 1 },
        { sourceField: 'bar', sourceHeader: 'BAR', sourceColumnIndex: 2 },
      ],
    }
    const onChangeDraft = vi.fn((key, next) => {
      drafts = { ...drafts, [key]: next }
      act(() => {
        root.render(createElement(InventoryNewProductReview, {
          ...sharedProps,
          drafts,
          onChangeDraft,
        }))
      })
    })
    renderReview({
      ...sharedProps,
      drafts: {},
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
      element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
      if (element.tagName !== 'SELECT') {
        element.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }

    const storageDestination = container.querySelector('select[aria-label="Storage destination"]')
    act(() => {
      setNativeValue(storageDestination, 'Main Storage')
    })
    expect(container.querySelector('[data-testid="inventory-import-opening-stock-total"]')?.textContent)
      .toBe('3')

    const storageQty = container.querySelector('input[aria-label="Storage quantity"]')
    act(() => {
      setNativeValue(storageQty, '10')
    })
    expect(onChangeDraft).toHaveBeenCalled()
    expect(container.querySelector('[data-testid="inventory-import-opening-stock-total"]')?.textContent)
      .toBe('11')
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

  it('emits draft updates for name, category, unit, and storage destination', async () => {
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
          workspaceStorages: [
            { id: 's1', locationKey: 'Bar', name: 'Bar', active: true, sortOrder: 0 },
            { id: 's2', locationKey: 'Main Storage', name: 'Main Storage', active: true, sortOrder: 1 },
            { id: 's3', locationKey: 'Apothiki 2', name: 'Apothiki 2', active: true, sortOrder: 2 },
          ],
          quantitySourceColumns: [
            { sourceField: 'storage', sourceHeader: 'Storage', sourceColumnIndex: 1 },
            { sourceField: 'bar', sourceHeader: 'BAR', sourceColumnIndex: 2 },
          ],
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

    const nameInput = container.querySelector('.inventory-new-product-review-fields input[type="text"]')
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

    const storageDestination = container.querySelector('select[aria-label="Storage destination"]')
    act(() => {
      setNativeValue(storageDestination, 'Bar')
      storageDestination.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(drafts[key].storage).toBe('Bar')
    expect(drafts[key].locationAllocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceField: 'storage',
          destinationLocationKey: 'Bar',
        }),
      ]),
    )

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

  it('supports select visible, clear selection, and missing-units filter', async () => {
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

    expect(container.querySelector('[data-active-filter="all"]')).toBeTruthy()
    expect(container.textContent).toMatch(/Showing 2 of 2/)

    const selectVisible = container.querySelector('input[aria-label="Select visible new products"]')
    act(() => {
      selectVisible.click()
    })
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
      container.querySelector('[data-filter="missing_units"]').click()
    })
    expect(container.querySelector('[data-active-filter="missing_units"]')).toBeTruthy()
    expect(Number(container.querySelector('[data-showing-count]')?.getAttribute('data-showing-count')))
      .toBeGreaterThan(0)
    expect(Number(container.querySelector('[data-selected-count]')?.getAttribute('data-selected-count')))
      .toBeGreaterThan(0)
    expect(container.textContent).toMatch(/Showing \d+ of 2/)
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
          workspaceStorages: [
            { id: 's1', locationKey: 'Bar', name: 'Bar', active: true, sortOrder: 0 },
            { id: 's2', locationKey: 'Main Storage', name: 'Main Storage', active: true, sortOrder: 1 },
            { id: 's3', locationKey: 'Apothiki 2', name: 'Apothiki 2', active: true, sortOrder: 2 },
          ],
          quantitySourceColumns: [
            { sourceField: 'storage', sourceHeader: 'Storage', sourceColumnIndex: 1 },
            { sourceField: 'bar', sourceHeader: 'BAR', sourceColumnIndex: 2 },
          ],
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
      container.querySelector('input[aria-label="Select visible new products"]').click()
    })

    act(() => {
      Array.from(container.querySelectorAll('.inventory-new-product-bulk-bar button'))
        .find((button) => button.textContent === 'Assign Storage Destination')
        ?.click()
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    const bulkStorage = container.querySelector('select[aria-label="Bulk assign storage destination"]')
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
    expect(container.textContent).toContain('Storage destination assigned to 2 products.')

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
          container.querySelector('input[aria-label="Select visible new products"]').click()
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

  it('filters visible rows, selects visible matches, and reconciles after bulk unit/storage', async () => {
    const preview = buildPreviewWithTwoCreates()
    const createEntries = listCreateNewPreviewRows(preview)
    /** @type {Record<string, object>} */
    let drafts = {
      [createEntries[0].key]: {
        productName: 'Brand New Spirit',
        category: 'Vodka',
        unit: 'Bottle 700ml',
        storage: null,
        supplier: '',
        supplierId: null,
        skipped: false,
      },
      [createEntries[1].key]: {
        productName: 'Another New Spirit',
        category: 'Vodka',
        unit: null,
        storage: 'Bar',
        supplier: '',
        supplierId: null,
        skipped: false,
      },
    }
    const onChangeDraftsBulk = vi.fn((updates) => {
      drafts = { ...drafts, ...updates }
      act(() => {
        root.render(createElement(InventoryNewProductReview, {
          preview,
          drafts,
          workspaceId: 'ws-1',
          workspaceStorages: [
            { id: 's1', locationKey: 'Bar', name: 'Bar', active: true, sortOrder: 0 },
            { id: 's2', locationKey: 'Main Storage', name: 'Main Storage', active: true, sortOrder: 1 },
            { id: 's3', locationKey: 'Apothiki 2', name: 'Apothiki 2', active: true, sortOrder: 2 },
          ],
          quantitySourceColumns: [
            { sourceField: 'storage', sourceHeader: 'Storage', sourceColumnIndex: 1 },
            { sourceField: 'bar', sourceHeader: 'BAR', sourceColumnIndex: 2 },
          ],
          categoryOptions: ['Vodka'],
          onChangeDraftsBulk,
        }))
      })
    })

    renderReview({
      preview,
      drafts,
      categoryOptions: ['Vodka'],
      onChangeDraftsBulk,
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    act(() => {
      container.querySelector('[data-filter="missing_units"]').click()
    })
    expect(container.querySelector('[data-active-filter="missing_units"]')).toBeTruthy()
    expect(container.querySelector('[data-showing-count="1"]')).toBeTruthy()
    expect(container.querySelector('[data-selected-count="1"]')).toBeTruthy()
    expect(container.textContent).toContain('Showing 1 of 2')
    expect(container.textContent).toContain('Another New Spirit')
    expect(container.textContent).not.toContain('Brand New Spirit')
    expect(container.querySelector('[data-filter="missing_units"]').className).toContain('is-active')

    act(() => {
      Array.from(container.querySelectorAll('.inventory-new-product-bulk-bar button'))
        .find((button) => button.textContent === 'Assign Unit')
        ?.click()
    })
    const setNativeValue = (element, value) => {
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')
      descriptor?.set?.call(element, value)
      element.dispatchEvent(new Event('change', { bubbles: true }))
    }
    act(() => {
      setNativeValue(container.querySelector('select[aria-label="Bulk assign unit"]'), 'Bottle 1L')
    })
    expect(drafts[createEntries[1].key].unit).toBe('Bottle 1L')
    expect(drafts[createEntries[0].key].unit).toBe('Bottle 700ml')
    expect(container.textContent).toContain('No products match this filter')
    expect(container.querySelector('[data-showing-count="0"]')).toBeTruthy()

    act(() => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Undo')
        ?.click()
    })
    expect(drafts[createEntries[1].key].unit).toBeNull()
    expect(container.querySelector('[data-showing-count="1"]')).toBeTruthy()
    expect(container.textContent).toContain('Another New Spirit')

    act(() => {
      container.querySelector('[data-filter="missing_storage"]').click()
    })
    expect(container.querySelector('[data-active-filter="missing_storage"]')).toBeTruthy()
    expect(container.textContent).toContain('Brand New Spirit')
    expect(container.textContent).not.toContain('Another New Spirit')

    act(() => {
      Array.from(container.querySelectorAll('.inventory-new-product-bulk-bar button'))
        .find((button) => button.textContent === 'Assign Storage Destination')
        ?.click()
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    act(() => {
      setNativeValue(container.querySelector('select[aria-label="Bulk assign storage destination"]'), 'Main Storage')
    })
    expect(drafts[createEntries[0].key].storage).toBe('Main Storage')
    expect(drafts[createEntries[1].key].storage).toBe('Bar')
    expect(container.querySelector('[data-showing-count="0"]')).toBeTruthy()

    act(() => {
      container.querySelector('[data-filter="missing_supplier"]').click()
    })
    expect(container.querySelector('[data-showing-count="2"]')).toBeTruthy()

    act(() => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Show All')
        ?.click()
    })
    expect(container.querySelector('[data-active-filter="all"]')).toBeTruthy()
    expect(container.querySelector('[data-showing-count="2"]')).toBeTruthy()
    expect(container.textContent).toContain('Brand New Spirit')
    expect(container.textContent).toContain('Another New Spirit')
  })

  it('renders every workspace storage returned by the service without truncating', async () => {
    const preview = buildPreviewWithCreateNew()
    renderReview({
      preview,
      drafts: {},
      categoryOptions: ['Vodka'],
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(listWorkspaceStoragesMock).toHaveBeenCalledWith('ws-1')
    const storageSelect = container.querySelector('select[aria-label="Storage destination"]')
    expect(Array.from(storageSelect.options).map((option) => option.value))
      .toEqual(expect.arrayContaining(['Bar', 'Main Storage', 'Apothiki 2']))
  })
})
