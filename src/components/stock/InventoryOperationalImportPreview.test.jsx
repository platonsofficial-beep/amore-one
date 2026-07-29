/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  matchInventoryOperationalProducts,
} from '../../lib/inventoryOperationalProductMatcher'
import {
  buildInventoryOperationalImportPreview,
} from '../../lib/inventoryOperationalImportPreview'
import {
  INVENTORY_OPERATIONAL_IMPORT_PREVIEW_UI_LIMIT,
  InventoryOperationalImportPreview,
  formatOperationalImportPreviewWeekdaySummary,
  getOperationalImportPreviewBlockerLabel,
  getOperationalImportPreviewWarningLabel,
} from './InventoryOperationalImportPreview'

function stock(partial) {
  return {
    id: partial.id,
    name: partial.name,
    category: partial.category ?? null,
    unit: partial.unit ?? 'Bottle',
    sku: partial.sku ?? null,
    active: partial.active ?? true,
  }
}

function product(name, extras = {}) {
  return {
    name,
    storage: Object.prototype.hasOwnProperty.call(extras, 'storage') ? extras.storage : null,
    bar: Object.prototype.hasOwnProperty.call(extras, 'bar') ? extras.bar : null,
    weekdays: Object.prototype.hasOwnProperty.call(extras, 'weekdays') ? extras.weekdays : null,
    order: Object.prototype.hasOwnProperty.call(extras, 'order') ? extras.order : null,
    stockControl: Object.prototype.hasOwnProperty.call(extras, 'stockControl')
      ? extras.stockControl
      : null,
  }
}

function buildPreview(operationalModel, existingStockItems) {
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

describe('InventoryOperationalImportPreview helpers', () => {
  it('17. unknown machine codes fall back to the raw code', () => {
    expect(getOperationalImportPreviewWarningLabel('custom_warning_code'))
      .toBe('custom_warning_code')
    expect(getOperationalImportPreviewBlockerLabel('custom_blocker_code'))
      .toBe('custom_blocker_code')
  })

  it('12. weekday summary only when populated', () => {
    expect(formatOperationalImportPreviewWeekdaySummary({
      monday: null,
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null,
    })).toBeNull()

    expect(formatOperationalImportPreviewWeekdaySummary({
      monday: 2,
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: 1,
      saturday: null,
      sunday: null,
    })).toBe('Mon: 2 · Fri: 1')
  })
})

describe('InventoryOperationalImportPreview', () => {
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

  function renderPreview(props) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(InventoryOperationalImportPreview, props))
    })
  }

  it('1–2. header, read-only badge, and summary counts', () => {
    const preview = buildPreview(
      {
        categories: [{
          name: 'VODKA',
          products: [
            product('Belvedere', { storage: 6, bar: 1 }),
            product('Mystery'),
            product(''),
          ],
        }],
      },
      [
        stock({ id: '1', name: 'Belvedere' }),
        stock({ id: 'd1', name: 'Dup' }),
        stock({ id: 'd2', name: 'DUP' }),
      ],
    )

    // Force a requires_resolution row via duplicate-name product.
    const withPossible = buildPreview(
      {
        categories: [{
          name: 'VODKA',
          products: [
            product('Belvedere'),
            product('Dup'),
            product('Brand New'),
          ],
        }],
      },
      [
        stock({ id: '1', name: 'Belvedere' }),
        stock({ id: 'd1', name: 'Dup' }),
        stock({ id: 'd2', name: 'DUP' }),
      ],
    )

    renderPreview({ preview: withPossible })

    expect(container.textContent).toContain('What ONE will do')
    expect(container.textContent).toContain('Read-only')
    expect(container.textContent).toContain('CREATE, LINK, and SKIP')
    expect(container.textContent).toContain('Total rows')
    expect(container.textContent).toContain('Existing links')
    expect(container.textContent).toContain('New products')
    expect(container.textContent).toContain('Needs resolution')
    expect(container.textContent).toContain('Missing units')
    expect(container.querySelector('[data-preview-total]')?.getAttribute('data-preview-total'))
      .toBe(String(withPossible.summary.total))
    expect(preview).toBeTruthy()
  })

  it('3–16. exact, inactive, possible, new, invalid rows and policy chips', () => {
    const preview = buildPreview(
      {
        categories: [{
          name: 'SPIRITS',
          products: [
            product('Tanqueray', {
              storage: 4,
              bar: 1.5,
              order: 2,
              stockControl: 8,
              weekdays: {
                monday: 1,
                tuesday: null,
                wednesday: null,
                thursday: null,
                friday: null,
                saturday: null,
                sunday: null,
              },
            }),
            product('Belvedere'),
            product('Grey Goose'),
            product(''),
          ],
        }],
      },
      [
        stock({ id: 't1', name: 'Tanqueray', category: 'Gin', unit: 'Bottle 0.7L', active: false }),
        stock({ id: 'b1', name: 'Belvedere', category: 'Vodka' }),
        stock({ id: 'b2', name: 'BELVEDERE', category: 'Bar' }),
      ],
    )

    renderPreview({ preview })

    const rows = container.querySelectorAll('.inventory-operational-import-preview-row')
    expect(rows.length).toBeGreaterThanOrEqual(4)

    expect(rows[0].getAttribute('data-proposed-action')).toBe('link_existing')
    expect(rows[0].textContent).toContain('Tanqueray')
    expect(rows[0].textContent).toContain('SPIRITS')
    expect(rows[0].textContent).toContain('LINK')
    expect(rows[0].textContent).toContain('Inactive')
    expect(rows[0].textContent).toContain('Existing ONE product is inactive')
    expect(rows[0].textContent).toContain('4')
    expect(rows[0].textContent).toContain('1.5')
    expect(rows[0].textContent).toContain('2')
    expect(rows[0].textContent).toContain('8')
    expect(rows[0].textContent).toContain('Weekdays:')
    expect(rows[0].textContent).toContain('Mon: 1')
    expect(rows[0].textContent).toContain('Policy required')
    expect(rows[0].textContent).toContain('Quantity policy is not set')

    expect(rows[1].getAttribute('data-proposed-action')).toBe('requires_resolution')
    expect(rows[1].textContent).toContain('REVIEW')
    expect(rows[1].textContent).toContain('2 candidates')
    expect(rows[1].textContent).toContain('First:')
    expect(rows[1].textContent).toContain('Match must be resolved')
    expect(rows[1].textContent).toContain('Not applicable')

    expect(rows[2].getAttribute('data-proposed-action')).toBe('create_new')
    expect(rows[2].textContent).toContain('CREATE')
    expect(rows[2].textContent).toContain('Will create new product')
    expect(rows[2].textContent).toContain('Unit: Missing')
    expect(rows[2].textContent).toContain('SPIRITS')
    expect(rows[2].textContent).toContain('Unit is missing')
    expect(rows[2].textContent).toContain('Location policy is not set')

    expect(rows[3].getAttribute('data-proposed-action')).toBe('skip_invalid')
    expect(rows[3].textContent).toContain('SKIP')
    expect(rows[3].textContent).toContain('Invalid source row')
    expect(rows[3].textContent).toContain('Product name is invalid')

    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('select')).toBeNull()
    expect(container.textContent).not.toMatch(/\bApply\b/)
  })

  it('15–16. warning and blocker labels render human copy', () => {
    expect(getOperationalImportPreviewWarningLabel('source_order_unmapped'))
      .toBe('Order value is not mapped')
    expect(getOperationalImportPreviewBlockerLabel('possible_match_unresolved'))
      .toBe('Match must be resolved')
  })

  it('18. empty state', () => {
    renderPreview({
      preview: {
        previewVersion: 1,
        rows: [],
        summary: {
          total: 0,
          linkExisting: 0,
          createNew: 0,
          requiresResolution: 0,
          blocked: 0,
          skippedInvalid: 0,
          missingUnits: 0,
        },
      },
    })

    expect(container.textContent).toContain('No import preview rows')
    expect(container.textContent).toContain('did not produce any operational products')
  })

  it('19–20. first 50 row cap and showing note', () => {
    const products = Array.from({ length: 55 }, (_, index) => product(`Product ${index + 1}`))
    const preview = buildPreview(
      { categories: [{ name: 'TEST', products }] },
      [],
    )

    renderPreview({ preview })

    expect(preview.rows).toHaveLength(55)
    expect(container.querySelectorAll('.inventory-operational-import-preview-row'))
      .toHaveLength(INVENTORY_OPERATIONAL_IMPORT_PREVIEW_UI_LIMIT)
    expect(container.textContent).toContain('Showing first 50 of 55 rows')
    expect(container.textContent).toContain('Product 1')
    expect(container.textContent).toContain('Product 50')
    expect(container.textContent).not.toContain('Product 51')
  })

  it('21. preview error state', () => {
    renderPreview({
      preview: null,
      errorMessage: 'Source and matcher rows are misaligned.',
    })

    expect(container.getAttribute('data-preview-state')
      || container.querySelector('[data-preview-state]')?.getAttribute('data-preview-state'))
      .toBe('error')
    expect(container.textContent).toContain('Unable to build import preview')
    expect(container.textContent).toContain('Source and matcher rows are misaligned.')
  })

  it('12b. weekday summary omitted when empty', () => {
    const preview = buildPreview(
      {
        categories: [{
          name: 'GIN',
          products: [product('Tanqueray', {
            weekdays: {
              monday: null,
              tuesday: null,
              wednesday: null,
              thursday: null,
              friday: null,
              saturday: null,
              sunday: null,
            },
          })],
        }],
      },
      [stock({ id: '1', name: 'Tanqueray' })],
    )

    renderPreview({ preview })
    expect(container.textContent).not.toContain('Weekdays:')
  })
})
