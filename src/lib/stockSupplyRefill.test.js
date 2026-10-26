import { describe, expect, it, vi } from 'vitest'
import {
  applyRefillResults,
  applyTakeResults,
  buildRefillLines,
  buildTakeRows,
  capRefillQuantity,
  createSingleFlight,
  formatRemainingLabel,
  formatSourceStockLabel,
  keepFailedRefillLines,
  keepFailedTakeRows,
  listAdHocSupplyChoices,
  rankSupplySources,
  refillLinesToTake,
  searchTakeRows,
  setTakeQuantity,
  stepTakeQuantity,
  takeOverSourceWarning,
  takeRowsToTransfer,
  withRefillQuantity,
  withRefillSource,
  withTakeSource,
} from './stockSupplyRefill'

const spirits = { id: 'spirits', name: 'Spirits', isSupply: true, active: true }
const soft = { id: 'soft', name: 'Soft drinks', isSupply: true, active: true }
const backBar = { id: 'back-bar', name: 'Back bar', isSupply: false, active: true }

function product(overrides = {}) {
  return {
    stockItemId: 'cola',
    name: 'Coca-Cola',
    unit: 'bt',
    quantity: 2,
    quantityVersion: 4,
    parQuantity: 10,
    ...overrides,
  }
}

describe('buildRefillLines', () => {
  it('suggests par minus on hand and defaults to the supply storage with the most on hand', () => {
    const lines = buildRefillLines({
      destinationStorageId: backBar.id,
      products: [
        product(),
        product({
          stockItemId: 'vodka',
          name: 'Vodka',
          unit: 'bt',
          quantity: 1,
          quantityVersion: 2,
          parQuantity: 6,
        }),
        product({
          stockItemId: 'ok',
          name: 'At par',
          quantity: 8,
          parQuantity: 8,
        }),
        product({
          stockItemId: 'untracked',
          name: 'No par',
          quantity: 0,
          parQuantity: null,
        }),
      ],
      supplyStorages: [spirits, soft, backBar],
      supplyBalances: [
        { stockItemId: 'cola', storageId: 'soft', quantity: 4, quantityVersion: 3 },
        { stockItemId: 'cola', storageId: 'spirits', quantity: 9, quantityVersion: 8 },
        { stockItemId: 'vodka', storageId: 'spirits', quantity: 20, quantityVersion: 5 },
        { stockItemId: 'cola', storageId: 'back-bar', quantity: 50, quantityVersion: 1 },
      ],
    })

    expect(lines.map((line) => line.stockItemId)).toEqual(['cola', 'vodka'])
    const cola = lines[0]
    expect(cola.suggestedQuantity).toBe(8)
    expect(cola.sourceStorageId).toBe('spirits')
    expect(cola.sourceAvailable).toBe(9)
    expect(cola.quantity).toBe(8)
    expect(cola.sources.map((source) => source.storageId)).toEqual(['spirits', 'soft'])
    expect(cola.destinationQuantityVersion).toBe(4)
    expect(cola.needsSupplierOrder).toBe(false)

    const vodka = lines[1]
    expect(vodka.sourceStorageName).toBe('Spirits')
    expect(vodka.quantity).toBe(5)
    expect(vodka.suggestedQuantity).toBe(5)
  })

  it('keeps the supply source id when that storage display name changes', () => {
    const lines = buildRefillLines({
      destinationStorageId: 'back-bar',
      products: [product()],
      supplyStorages: [{ id: 'spirits', name: 'Cage', locationKey: 'Spirits', isSupply: true, active: true }],
      supplyBalances: [
        { stockItemId: 'cola', storageId: 'spirits', quantity: 9, quantityVersion: 8 },
      ],
    })
    expect(lines[0]).toMatchObject({
      sourceStorageId: 'spirits',
      sourceStorageName: 'Cage',
      quantity: 8,
    })
  })

  it('breaks a quantity tie by storage name', () => {
    const ranked = rankSupplySources([
      { storageId: 'b', storageName: 'Spirits', quantity: 4, active: true },
      { storageId: 'a', storageName: 'Soft drinks', quantity: 4, active: true },
    ])
    expect(ranked.map((source) => source.storageId)).toEqual(['a', 'b'])
  })

  it('marks an item that is not in any supply storage as a supplier order', () => {
    const [line] = buildRefillLines({
      destinationStorageId: 'back-bar',
      products: [product({ quantity: 0, quantityVersion: 0, parQuantity: 3 })],
      supplyStorages: [soft],
      supplyBalances: [],
    })
    expect(line.needsSupplierOrder).toBe(true)
    expect(line.transferable).toBe(false)
    expect(line.selected).toBe(false)
    expect(line.quantity).toBe(0)
    expect(line.destinationQuantityVersion).toBe(1)
  })

  it('ignores a zero balance and an inactive supply storage', () => {
    const [line] = buildRefillLines({
      products: [product()],
      supplyStorages: [
        { id: 'closed', name: 'Closed', isSupply: true, active: false },
        soft,
      ],
      supplyBalances: [
        { stockItemId: 'cola', storageId: 'closed', quantity: 30, quantityVersion: 2 },
        { stockItemId: 'cola', storageId: 'soft', quantity: 0, quantityVersion: 2 },
      ],
    })
    expect(line.needsSupplierOrder).toBe(true)
  })
})

describe('refill quantity caps and source choice', () => {
  it('caps the take at source availability', () => {
    expect(capRefillQuantity(8, 3)).toBe(3)
    expect(capRefillQuantity(1.256, 5)).toBe(1.256)
    expect(capRefillQuantity(0, 5)).toBe(0)
    expect(capRefillQuantity(2, 0)).toBe(0)

    const [line] = buildRefillLines({
      products: [product({ quantity: 0, parQuantity: 12 })],
      supplyStorages: [soft],
      supplyBalances: [
        { stockItemId: 'cola', storageId: 'soft', quantity: 3, quantityVersion: 6 },
      ],
    })
    expect(line.suggestedQuantity).toBe(12)
    expect(line.quantity).toBe(3)
    expect(line.sourceQuantityVersion).toBe(6)

    const edited = withRefillQuantity(line, '9')
    expect(edited.line.quantity).toBe(3)
    expect(edited.error).toBe('')

    const cleared = withRefillQuantity(line, '')
    expect(cleared.line.quantity).toBe(0)
    expect(cleared.line.selected).toBe(false)
  })

  it('switches source and recaps the suggested quantity', () => {
    const [line] = buildRefillLines({
      products: [product({ quantity: 1, parQuantity: 10 })],
      supplyStorages: [spirits, soft],
      supplyBalances: [
        { stockItemId: 'cola', storageId: 'spirits', quantity: 20, quantityVersion: 2 },
        { stockItemId: 'cola', storageId: 'soft', quantity: 4, quantityVersion: 9 },
      ],
    })
    expect(line.sourceStorageId).toBe('spirits')
    expect(line.quantity).toBe(9)

    const next = withRefillSource(line, 'soft')
    expect(next.sourceStorageId).toBe('soft')
    expect(next.sourceAvailable).toBe(4)
    expect(next.quantity).toBe(4)
    expect(next.sourceQuantityVersion).toBe(9)
    expect(next.selected).toBe(true)
  })

  it('does not take an unticked line or a supplier-order line', () => {
    const lines = buildRefillLines({
      products: [
        product(),
        product({ stockItemId: 'missing', name: 'Tonic', quantity: 0, parQuantity: 2 }),
      ],
      supplyStorages: [soft],
      supplyBalances: [
        { stockItemId: 'cola', storageId: 'soft', quantity: 5, quantityVersion: 1 },
      ],
    })
    const cola = { ...lines[0], selected: false }
    expect(refillLinesToTake([cola, lines[1]])).toEqual([])
    expect(refillLinesToTake([{ ...lines[0], selected: true }])).toHaveLength(1)
  })
})

describe('refill partial results', () => {
  it('removes lines that moved and keeps the failed line with its error', () => {
    const lines = [
      { stockItemId: 'cola', name: 'Coca-Cola', selected: true },
      { stockItemId: 'vodka', name: 'Vodka', selected: true },
    ]
    const next = applyRefillResults(lines, [
      { stockItemId: 'cola', ok: true, error: '' },
      { stockItemId: 'vodka', ok: false, error: 'Not enough quantity in the source storage.' },
    ])
    expect(next).toEqual([
      {
        stockItemId: 'vodka',
        name: 'Vodka',
        selected: true,
        error: 'Not enough quantity in the source storage.',
      },
    ])
  })

  it('keeps a failed line after balances reload and drops the success', () => {
    const previous = [
      {
        stockItemId: 'cola',
        sourceStorageId: 'soft',
        quantity: 2,
        selected: true,
        sources: [{ storageId: 'soft' }],
      },
      {
        stockItemId: 'vodka',
        sourceStorageId: 'spirits',
        quantity: 1,
        selected: true,
        sources: [{ storageId: 'spirits' }],
      },
    ]
    const fresh = buildRefillLines({
      products: [
        product({ quantity: 10, parQuantity: 12 }),
        product({
          stockItemId: 'vodka',
          name: 'Vodka',
          quantity: 1,
          parQuantity: 6,
          quantityVersion: 2,
        }),
      ],
      supplyStorages: [soft, spirits],
      supplyBalances: [
        { stockItemId: 'cola', storageId: 'soft', quantity: 1, quantityVersion: 4 },
        { stockItemId: 'vodka', storageId: 'spirits', quantity: 8, quantityVersion: 5 },
      ],
    })
    const kept = keepFailedRefillLines(fresh, previous, [
      { stockItemId: 'cola', ok: true, error: '' },
      { stockItemId: 'vodka', ok: false, error: 'Source quantity changed. Refresh and try again.' },
    ])
    expect(kept.map((line) => line.stockItemId)).toEqual(['vodka'])
    expect(kept[0].error).toMatch(/Refresh and try again/)
    expect(kept[0].selected).toBe(true)
    expect(kept[0].quantity).toBe(1)
  })
})

describe('ad-hoc supply choices', () => {
  it('lists only stock held in active supply storages', () => {
    const choices = listAdHocSupplyChoices({
      destinationStorageId: 'back-bar',
      supplyStorages: [soft, spirits, backBar, { id: 'old', name: 'Old', isSupply: true, active: false }],
      supplyBalances: [
        { stockItemId: 'cola', storageId: 'soft', quantity: 4, quantityVersion: 2 },
        { stockItemId: 'vodka', storageId: 'spirits', quantity: 1, quantityVersion: 3 },
        { stockItemId: 'cola', storageId: 'back-bar', quantity: 9, quantityVersion: 1 },
        { stockItemId: 'gin', storageId: 'old', quantity: 7, quantityVersion: 1 },
      ],
      itemsById: new Map([
        ['cola', { name: 'Coca-Cola', unit: 'bt' }],
        ['vodka', { name: 'Vodka', unit: 'bt' }],
      ]),
    })
    expect(choices.storages.map((storage) => storage.id)).toEqual(['soft', 'spirits'])
    expect(choices.items.map((item) => [item.storageId, item.name, item.quantity])).toEqual([
      ['soft', 'Coca-Cola', 4],
      ['spirits', 'Vodka', 1],
    ])
  })
})

describe('buildTakeRows', () => {
  const shelf = [
    product({
      stockItemId: 'zucchini',
      name: 'Zucchini',
      quantity: 1,
      quantityVersion: 2,
      parQuantity: 4,
    }),
    product({
      stockItemId: 'tonic',
      name: 'Tonic',
      quantity: 0,
      quantityVersion: 0,
      parQuantity: 2,
    }),
    product({ quantity: 2, quantityVersion: 5, parQuantity: 10 }),
  ]

  const balances = [
    { stockItemId: 'cola', storageId: 'soft', quantity: 48, quantityVersion: 2 },
    { stockItemId: 'cola', storageId: 'spirits', quantity: 9, quantityVersion: 3 },
    { stockItemId: 'apple', storageId: 'soft', quantity: 12, quantityVersion: 1 },
    { stockItemId: 'apple', storageId: 'back-bar', quantity: 30, quantityVersion: 1 },
    { stockItemId: 'gin', storageId: 'closed', quantity: 7, quantityVersion: 1 },
    { stockItemId: 'vodka', storageId: 'spirits', quantity: 0, quantityVersion: 4 },
  ]

  function rows() {
    return buildTakeRows({
      destinationStorageId: 'back-bar',
      shelfProducts: shelf,
      supplyStorages: [
        spirits,
        soft,
        backBar,
        { id: 'closed', name: 'Closed', isSupply: true, active: false },
      ],
      supplyBalances: balances,
      itemsById: new Map([
        ['cola', { name: 'Coca-Cola', unit: 'bt', brand: 'Classic' }],
        ['apple', { name: 'Apple Juice', unit: 'bt', brand: 'Fizz' }],
        ['gin', { name: 'Gin', unit: 'bt', brand: '' }],
      ]),
    })
  }

  it('lists this shelf first, then other items held in supply, with on-hand per source', () => {
    const built = rows()
    expect(built.map((row) => [row.stockItemId, row.onShelf])).toEqual([
      ['cola', true],
      ['tonic', true],
      ['zucchini', true],
      ['apple', false],
    ])
    const cola = built[0]
    expect(cola.unit).toBe('bt')
    expect(cola.brand).toBe('Classic')
    expect(cola.sources.map((source) => formatSourceStockLabel(source))).toEqual([
      'Soft drinks: 48',
      'Spirits: 9',
    ])
    expect(cola.sourceStorageId).toBe('soft')
    expect(cola.sourceAvailable).toBe(48)
    expect(cola.quantity).toBe(0)
    expect(built[1].sources).toEqual([])
    expect(built[3].name).toBe('Apple Juice')
    expect(built[3].destinationQuantityVersion).toBe(1)
    expect(built[0].destinationQuantityVersion).toBe(5)
  })

  it('searches name, unit, brand, and source storage without losing shelf-first order', () => {
    const built = rows()
    expect(searchTakeRows(built, '  ').map((row) => row.stockItemId)).toEqual([
      'cola', 'tonic', 'zucchini', 'apple',
    ])
    expect(searchTakeRows(built, 'fizz').map((row) => row.stockItemId)).toEqual(['apple'])
    expect(searchTakeRows(built, 'SOFT').map((row) => row.stockItemId)).toEqual(['cola', 'apple'])
    expect(searchTakeRows(built, 'bt').map((row) => row.name)).toEqual([
      'Coca-Cola', 'Tonic', 'Zucchini', 'Apple Juice',
    ])
  })
})

describe('take quantity caps and multi-line transfer', () => {
  function colaRow() {
    return buildTakeRows({
      destinationStorageId: 'back-bar',
      shelfProducts: [product({ quantity: 2, quantityVersion: 5, parQuantity: 10 })],
      supplyStorages: [soft, spirits],
      supplyBalances: [
        { stockItemId: 'cola', storageId: 'soft', quantity: 48, quantityVersion: 2 },
        { stockItemId: 'cola', storageId: 'spirits', quantity: 9, quantityVersion: 3 },
      ],
      itemsById: new Map([['cola', { name: 'Coca-Cola', unit: 'bt', brand: '' }]]),
    })[0]
  }

  it('caps an over-ask, warns, and shows what would remain', () => {
    const row = colaRow()
    const over = setTakeQuantity(row, '60')
    expect(over.quantity).toBe(48)
    expect(over.quantityInput).toBe('48')
    expect(over.warning).toBe(takeOverSourceWarning('Soft drinks', 48))
    expect(over.warning).toBe('Only 48 in Soft drinks.')
    expect(formatRemainingLabel(over.sourceAvailable, over.quantity)).toBe('48 → 0')

    const six = setTakeQuantity(over, '6')
    expect(six.quantity).toBe(6)
    expect(six.warning).toBe('')
    expect(formatRemainingLabel(six.sourceAvailable, six.quantity)).toBe('48 → 42')

    const atCap = stepTakeQuantity(setTakeQuantity(row, '48'), 1)
    expect(atCap.quantity).toBe(48)
    expect(atCap.warning).toBe('Only 48 in Soft drinks.')

    const cleared = stepTakeQuantity(six, -6)
    expect(cleared.quantity).toBe(0)
    expect(cleared.quantityInput).toBe('')

    const invalid = setTakeQuantity(six, 'nope')
    expect(invalid.quantity).toBe(0)
    expect(invalid.quantityInput).toBe('nope')
    expect(invalid.error).toMatch(/greater than zero/)
  })

  it('recaps when the tapped source holds less, and sends every positive line', () => {
    const capped = withTakeSource(setTakeQuantity(colaRow(), '40'), 'spirits')
    expect(capped.sourceStorageId).toBe('spirits')
    expect(capped.sourceQuantityVersion).toBe(3)
    expect(capped.quantity).toBe(9)
    expect(capped.warning).toBe('Only 9 in Spirits.')

    const vodka = {
      ...colaRow(),
      stockItemId: 'vodka',
      name: 'Vodka',
      sourceStorageId: 'spirits',
      sourceAvailable: 1,
      sourceQuantityVersion: 4,
      destinationQuantityVersion: 0,
      quantity: 1,
      quantityInput: '1',
    }
    const lines = takeRowsToTransfer([
      setTakeQuantity(colaRow(), '6'),
      { ...colaRow(), quantity: 0, quantityInput: '' },
      vodka,
    ], [
      product({ quantityVersion: 5 }),
      product({ stockItemId: 'vodka', quantityVersion: 0 }),
    ])
    expect(lines.map((line) => line.stockItemId)).toEqual(['cola', 'vodka'])
    expect(lines[0]).toMatchObject({
      quantity: 6,
      sourceStorageId: 'soft',
      sourceQuantityVersion: 2,
      destinationQuantityVersion: 5,
      selected: true,
      transferable: true,
    })
    expect(lines[1].destinationQuantityVersion).toBe(1)
    expect(refillLinesToTake(lines)).toHaveLength(2)
  })
})

describe('take partial results', () => {
  it('clears a moved line, keeps a failed quantity, and leaves an unattempted line', () => {
    const previous = [
      {
        stockItemId: 'cola',
        sourceStorageId: 'soft',
        quantity: 6,
        quantityInput: '6',
        sources: [{ storageId: 'soft' }],
      },
      {
        stockItemId: 'vodka',
        sourceStorageId: 'spirits',
        quantity: 1,
        quantityInput: '1',
        sources: [{ storageId: 'spirits' }],
      },
      {
        stockItemId: 'apple',
        sourceStorageId: 'soft',
        quantity: 2,
        quantityInput: '2',
        sources: [{ storageId: 'soft' }],
      },
    ]
    const fresh = buildTakeRows({
      destinationStorageId: 'back-bar',
      shelfProducts: [
        product({ quantity: 8, quantityVersion: 6, parQuantity: 10 }),
        product({ stockItemId: 'vodka', name: 'Vodka', quantity: 0, quantityVersion: 1, parQuantity: 4 }),
      ],
      supplyStorages: [soft, spirits],
      supplyBalances: [
        { stockItemId: 'cola', storageId: 'soft', quantity: 42, quantityVersion: 3 },
        { stockItemId: 'vodka', storageId: 'spirits', quantity: 1, quantityVersion: 4 },
        { stockItemId: 'apple', storageId: 'soft', quantity: 12, quantityVersion: 2 },
      ],
      itemsById: new Map([
        ['apple', { name: 'Apple Juice', unit: 'bt', brand: '' }],
        ['vodka', { name: 'Vodka', unit: 'bt', brand: '' }],
      ]),
    })
    const results = [
      { stockItemId: 'cola', ok: true, error: '' },
      { stockItemId: 'vodka', ok: false, error: 'Not enough quantity in the source storage.' },
    ]
    const kept = keepFailedTakeRows(fresh, previous, results)
    const cola = kept.find((row) => row.stockItemId === 'cola')
    const vodka = kept.find((row) => row.stockItemId === 'vodka')
    const apple = kept.find((row) => row.stockItemId === 'apple')
    expect(cola.quantity).toBe(0)
    expect(cola.sourceAvailable).toBe(42)
    expect(cola.error).toBe('')
    expect(vodka.quantity).toBe(1)
    expect(vodka.sourceStorageId).toBe('spirits')
    expect(vodka.error).toMatch(/Not enough quantity/)
    expect(apple.quantity).toBe(2)

    const stale = applyTakeResults(previous, results)
    expect(stale.find((row) => row.stockItemId === 'cola').quantity).toBe(0)
    expect(stale.find((row) => row.stockItemId === 'vodka').error).toMatch(/Not enough/)
    expect(stale.find((row) => row.stockItemId === 'apple').quantity).toBe(2)
  })
})

describe('createSingleFlight', () => {
  it('runs one task when take is requested twice before it finishes', async () => {
    const flight = createSingleFlight()
    const task = vi.fn(() => new Promise((resolve) => {
      setTimeout(() => resolve(['once']), 0)
    }))
    const first = flight(task)
    const second = flight(task)
    expect(first).toBe(second)
    await expect(first).resolves.toEqual(['once'])
    expect(task).toHaveBeenCalledTimes(1)
    await flight(task)
    expect(task).toHaveBeenCalledTimes(2)
  })
})
