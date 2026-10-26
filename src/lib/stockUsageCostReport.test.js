import { describe, expect, it } from 'vitest'
import { buildStockUsageCostReport } from './stockUsageCostReport'

const vodka = {
  id: 'vodka',
  brand: '',
  name: 'Vodka',
  unit: 'btl',
  category: 'Spirits',
  costPrice: 20,
}

describe('buildStockUsageCostReport', () => {
  it('computes used and waste cost between two posted counts', () => {
    const report = buildStockUsageCostReport({
      items: [vodka],
      openingLines: [{ itemId: 'vodka', countedQuantity: 10, itemName: 'Vodka', category: 'Spirits', unit: 'btl' }],
      closingLines: [{ itemId: 'vodka', countedQuantity: 9, itemName: 'Vodka', category: 'Spirits', unit: 'btl' }],
      movements: [
        { itemId: 'vodka', type: 'receive', quantity: 5 },
        { itemId: 'vodka', type: 'usage', quantity: 2, note: 'Waste · Broken' },
        { itemId: 'vodka', type: 'usage', quantity: 1, note: 'Service' },
        { itemId: 'vodka', type: 'transfer_out', quantity: 1 },
        { itemId: 'vodka', type: 'adjustment', quantity: -2 },
      ],
    })

    expect(report.products).toEqual([
      expect.objectContaining({
        itemId: 'vodka',
        opening: 10,
        received: 5,
        waste: 2,
        loggedUse: 1,
        transfer: -1,
        adjustment: -2,
        closing: 9,
        used: 0,
        usageCost: 0,
        wasteCost: 40,
        gap: '',
      }),
    ])
    // 10 + 5 - 2 - 1 - 1 - 2 - 9 = 0
    expect(report.summary.wasteCost).toBe(40)
    expect(report.categories[0]).toEqual(expect.objectContaining({
      category: 'Spirits',
      usageCost: 0,
      wasteCost: 40,
      missingCostCount: 0,
    }))
  })

  it('leaves used blank when a count or a cost is missing', () => {
    const report = buildStockUsageCostReport({
      items: [
        { id: 'gin', name: 'Gin', category: 'Spirits', unit: 'btl', costPrice: 0 },
        { id: 'cola', name: 'Cola', category: 'Mixers', unit: 'btl', costPrice: 2 },
      ],
      openingLines: [
        { itemId: 'gin', countedQuantity: 4 },
        { itemId: 'cola', countedQuantity: 8 },
      ],
      closingLines: [
        { itemId: 'cola', countedQuantity: 5 },
      ],
      movements: [
        { itemId: 'cola', type: 'usage', quantity: 3, note: 'Waste · Spilled' },
      ],
    })

    const gin = report.products.find((product) => product.itemId === 'gin')
    const cola = report.products.find((product) => product.itemId === 'cola')
    expect(gin.gap).toBe('No closing count')
    expect(gin.used).toBeNull()
    expect(gin.usageCost).toBeNull()
    expect(gin.opening).toBe(4)
    expect(cola.used).toBe(0)
    expect(cola.waste).toBe(3)
    expect(cola.wasteCost).toBe(6)
    expect(report.summary.missingCountCount).toBe(1)
    expect(report.summary.usageCost).toBe(0)
  })

  it('does not invent a usage cost when the product has no cost price', () => {
    const report = buildStockUsageCostReport({
      items: [{ id: 'ice', name: 'Ice', category: 'Other', unit: 'kg', costPrice: '' }],
      openingLines: [{ itemId: 'ice', countedQuantity: 10 }],
      closingLines: [{ itemId: 'ice', countedQuantity: 4 }],
      movements: [],
    })
    expect(report.products[0].used).toBe(6)
    expect(report.products[0].usageCost).toBeNull()
    expect(report.products[0].wasteCost).toBe(0)
    expect(report.summary.hasUsageCost).toBe(false)
    expect(report.summary.missingCostCount).toBe(1)
  })

  it('hides used when movement history was cut off or a count was posted in the period', () => {
    const truncated = buildStockUsageCostReport({
      items: [vodka],
      openingLines: [{ itemId: 'vodka', countedQuantity: 10 }],
      closingLines: [{ itemId: 'vodka', countedQuantity: 8 }],
      movements: [],
      movementHistoryTruncated: true,
    })
    expect(truncated.products[0].used).toBeNull()
    expect(truncated.products[0].gap).toMatch(/incomplete/i)

    const midCount = buildStockUsageCostReport({
      items: [vodka],
      openingLines: [{ itemId: 'vodka', countedQuantity: 10 }],
      closingLines: [{ itemId: 'vodka', countedQuantity: 8 }],
      movements: [{ itemId: 'vodka', type: 'stock_count', quantity: 9 }],
    })
    expect(midCount.products[0].used).toBeNull()
    expect(midCount.products[0].gap).toMatch(/count was posted/i)
  })

  it('sums the same product across storage lines on a posted count', () => {
    const report = buildStockUsageCostReport({
      items: [vodka],
      openingLines: [
        { itemId: 'vodka', countedQuantity: 2 },
        { itemId: 'vodka', countedQuantity: 3 },
      ],
      closingLines: [
        { itemId: 'vodka', countedQuantity: 4 },
        { itemId: 'vodka', countedQuantity: null },
      ],
      movements: [],
    })
    expect(report.products[0].opening).toBe(5)
    expect(report.products[0].closing).toBeNull()
    expect(report.products[0].gap).toBe('Closing count is incomplete')
  })
})
