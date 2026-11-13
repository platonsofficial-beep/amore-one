import { describe, expect, it } from 'vitest'
import { buildStockItemUpdatePayload } from './stockBulkActions'
import { stockFormToPayload, validateStockItemForm, buildEmptyStockItemForm } from './stockCatalog'
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
})
