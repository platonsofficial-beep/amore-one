import { describe, expect, it } from 'vitest'
import { buildStockOrdersOperationsSummary } from './stockOrderUtils'

describe('stockOrderUtils', () => {
  it('counts draft, awaiting, and partial orders for manager workflow', () => {
    const summary = buildStockOrdersOperationsSummary([
      { id: '1', status: 'draft' },
      { id: '2', status: 'sent', items: [{ quantity: 10, receivedQuantity: 0 }] },
      {
        id: '3',
        status: 'sent',
        items: [{ quantity: 10, receivedQuantity: 4 }],
      },
      { id: '4', status: 'received', items: [{ quantity: 5, receivedQuantity: 5 }] },
    ])

    expect(summary).toEqual({
      draftCount: 1,
      awaitingDeliveryCount: 1,
      partialCount: 1,
      pendingCount: 3,
    })
  })
})
