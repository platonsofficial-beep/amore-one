import { describe, expect, it } from 'vitest'
import { buildStockItemUpdatePayload } from './stockBulkActions'
import { stockFormToPayload, validateStockItemForm, buildEmptyStockItemForm } from './stockCatalog'
import { buildStockImportPlan } from './stockCsvImport'
import { serializeStockItem } from '../services/stockItemService'

describe('catalog writes omit current quantity', () => {
  it('create and edit payloads do not send on-hand', () => {
    const form = {
      ...buildEmptyStockItemForm('Spirits'),
      name: 'Vodka',
      currentQuantity: '18',
      minimumQuantity: '2',
    }
    expect(validateStockItemForm(form)).toBe('')
    const payload = stockFormToPayload(form)
    expect(payload).not.toHaveProperty('currentQuantity')
    expect(payload.minimumQuantity).toBe(2)

    const serialized = serializeStockItem({
      ...payload,
      currentQuantity: 18,
    }, 'ws-1', { supplierId: null })
    expect(serialized).not.toHaveProperty('current_quantity')
    expect(serialized.workspace_id).toBe('ws-1')
    expect(serialized.minimum_quantity).toBe(2)
  })

  it('bulk edit does not resend the cached on-hand', () => {
    const payload = buildStockItemUpdatePayload({
      name: 'Vodka',
      category: 'Spirits',
      itemType: 'Vodka',
      unit: 'Bottle',
      currentQuantity: 12,
      minimumQuantity: 2,
      targetQuantity: 6,
      orderQuantity: null,
      costPrice: 10,
      storageLocation: 'Main Bar',
    }, { supplier: 'Acme' })
    expect(payload).not.toHaveProperty('currentQuantity')
    expect(payload.supplier).toBe('Acme')
    expect(payload.minimumQuantity).toBe(2)
  })

  it('client catalog import ignores an on-hand column', () => {
    const plan = buildStockImportPlan(
      [
        {
          rowNumber: 2,
          name: 'Vodka',
          category: 'Spirits',
          type: 'Vodka',
          supplier: '',
          unit: 'Bottle',
          currentQuantity: '40',
          minimumQuantity: '2',
          targetQuantity: '',
          costPrice: '',
          storageLocation: 'Bar',
        },
        {
          rowNumber: 3,
          name: 'Gin',
          category: 'Spirits',
          type: 'Gin',
          supplier: '',
          unit: 'Bottle',
          currentQuantity: '',
          minimumQuantity: '1',
          targetQuantity: '',
          costPrice: '',
          storageLocation: 'Bar',
        },
      ],
      [{
        id: 'item-vodka',
        name: 'Vodka',
        storageLocation: 'Bar',
        supplier: 'Acme',
        costPrice: 9,
        targetQuantity: 4,
        orderQuantity: null,
        currentQuantity: 3,
      }],
    )

    expect(plan.creates[0].payload).not.toHaveProperty('currentQuantity')
    expect(plan.creates[0].payload.name).toBe('Gin')
    expect(plan.updates[0].payload).not.toHaveProperty('currentQuantity')
    expect(plan.updates[0].id).toBe('item-vodka')
    expect(plan.skipped).toEqual([])
  })
})
