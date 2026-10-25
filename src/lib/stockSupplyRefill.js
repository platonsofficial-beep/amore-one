import { isBelowStoragePar, normalizeStorageParQuantity, storageParShort } from './stockStoragePar'

export const REFILL_ACTION_LABEL = 'Refill / Αναπλήρωση'
export const TAKE_SELECTED_LABEL = 'Take selected / Λήψη'
export const TAKE_FROM_SUPPLY_LABEL = 'Take from supply / Από τροφοδοσία'
export const TAKE_SUBMIT_LABEL = 'Take / Λήψη'
export const TAKE_LIST_LABEL = 'Take list'
export const SUGGESTED_TAB_LABEL = 'Suggested / Πρόταση'
export const SUGGESTED_BASIS_LABEL = 'Based on the last recorded quantity, not a live count.'
export const NEEDS_SUPPLIER_ORDER_LABEL = 'Not in any supply storage. Needs a supplier order.'
export const NO_SUPPLY_STORAGE_HINT = 'Mark a storage as supply (Αποθήκη τροφοδοσίας) before this shelf can refill from it.'
export const SUPPLY_FLAG_UNAVAILABLE_MESSAGE = 'Supply storages are not available yet.'
export const STAFF_REFILL_BLOCKED_MESSAGE = 'Taking from supply is limited to managers. You can still count this shelf.'
export const REFILL_AT_PAR_LABEL = 'Nothing on this shelf is below par.'
export const REFILL_TRANSFER_NOTE = 'Refill from supply storage'
export const AD_HOC_TRANSFER_NOTE = 'Take from supply storage'

function roundQuantity(value) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

function readVersion(value, fallback = 1) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.floor(parsed)
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: number, error: '' }|{ ok: false, value: null, error: string }}
 */
export function parseRefillQuantity(raw) {
  const trimmed = `${raw ?? ''}`.trim().replace(',', '.')
  if (!trimmed || !/^\d+(\.\d{1,3})?$/.test(trimmed)) {
    return {
      ok: false,
      value: null,
      error: 'Enter a quantity greater than zero, with up to 3 decimal places.',
    }
  }
  const value = roundQuantity(Number(trimmed))
  if (!Number.isFinite(value) || value <= 0) {
    return {
      ok: false,
      value: null,
      error: 'Enter a quantity greater than zero, with up to 3 decimal places.',
    }
  }
  return { ok: true, value, error: '' }
}

/**
 * Cap a requested take at what the source currently holds.
 *
 * @param {unknown} requested
 * @param {unknown} available
 * @returns {number}
 */
export function capRefillQuantity(requested, available) {
  const qty = Number(requested)
  const cap = Number(available)
  if (!Number.isFinite(qty) || qty <= 0) return 0
  if (!Number.isFinite(cap) || cap <= 0) return 0
  return roundQuantity(Math.min(qty, cap))
}

/**
 * Highest on-hand first. Ties break by storage name, then id.
 *
 * @param {Array<{ storageId?: string, storageName?: string, quantity?: number, active?: boolean }>} sources
 */
export function rankSupplySources(sources = []) {
  return [...(Array.isArray(sources) ? sources : [])]
    .filter((source) => Number(source?.quantity) > 0 && source?.active !== false)
    .sort((left, right) => {
      const quantityDelta = Number(right.quantity) - Number(left.quantity)
      if (quantityDelta !== 0) return quantityDelta
      const nameDelta = `${left.storageName ?? ''}`.localeCompare(
        `${right.storageName ?? ''}`,
        undefined,
        { sensitivity: 'base' },
      )
      if (nameDelta !== 0) return nameDelta
      return `${left.storageId ?? ''}`.localeCompare(`${right.storageId ?? ''}`)
    })
}

function storageIdOf(record) {
  return `${record?.id ?? record?.storageId ?? ''}`.trim()
}

/**
 * @param {{
 *   products?: object[],
 *   supplyStorages?: object[],
 *   supplyBalances?: object[],
 *   destinationStorageId?: string,
 * }} [input]
 */
export function buildRefillLines({
  products = [],
  supplyStorages = [],
  supplyBalances = [],
  destinationStorageId = '',
} = {}) {
  const destinationId = `${destinationStorageId ?? ''}`.trim()
  /** @type {Map<string, { id: string, name: string, active: boolean }>} */
  const supplyById = new Map()
  for (const storage of Array.isArray(supplyStorages) ? supplyStorages : []) {
    const id = storageIdOf(storage)
    if (!id || id === destinationId) continue
    if (storage?.isSupply !== true && storage?.is_supply !== true) continue
    if (storage?.active === false) continue
    supplyById.set(id, {
      id,
      name: `${storage?.name ?? storage?.locationKey ?? 'Supply'}`.trim() || 'Supply',
      active: true,
    })
  }

  /** @type {Map<string, object[]>} */
  const sourcesByItem = new Map()
  for (const balance of Array.isArray(supplyBalances) ? supplyBalances : []) {
    const storageId = `${balance?.storageId ?? balance?.workspaceStorageId ?? balance?.workspace_storage_id ?? ''}`.trim()
    const stockItemId = `${balance?.stockItemId ?? balance?.stock_item_id ?? ''}`.trim()
    const storage = supplyById.get(storageId)
    if (!storage || !stockItemId) continue
    const quantity = Number(balance?.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) continue
    const source = {
      storageId,
      storageName: storage.name,
      quantity: roundQuantity(quantity),
      quantityVersion: readVersion(balance?.quantityVersion ?? balance?.quantity_version),
      active: true,
    }
    const existing = sourcesByItem.get(stockItemId) ?? []
    const prior = existing.findIndex((entry) => entry.storageId === storageId)
    if (prior >= 0) {
      if (source.quantity > existing[prior].quantity) existing[prior] = source
    } else {
      existing.push(source)
    }
    sourcesByItem.set(stockItemId, existing)
  }

  const lines = []
  for (const product of Array.isArray(products) ? products : []) {
    const stockItemId = `${product?.stockItemId ?? product?.id ?? ''}`.trim()
    if (!stockItemId) continue
    if (!isBelowStoragePar(product?.parQuantity, product?.quantity)) continue
    const suggestedQuantity = storageParShort(product?.parQuantity, product?.quantity) ?? 0
    const sources = rankSupplySources(sourcesByItem.get(stockItemId) ?? [])
    const source = sources[0] ?? null
    const sourceAvailable = source ? source.quantity : 0
    const quantity = capRefillQuantity(suggestedQuantity, sourceAvailable)
    const onHand = Number(product?.quantity)
    lines.push({
      stockItemId,
      name: `${product?.name ?? 'Unknown product'}`.trim() || 'Unknown product',
      unit: `${product?.unit ?? ''}`.trim(),
      onHand: Number.isFinite(onHand) ? onHand : 0,
      parQuantity: product?.parQuantity,
      suggestedQuantity,
      quantity,
      quantityInput: quantity > 0 ? `${quantity}` : '',
      selected: Boolean(source) && quantity > 0,
      transferable: Boolean(source),
      needsSupplierOrder: !source,
      sourceStorageId: source?.storageId ?? '',
      sourceStorageName: source?.storageName ?? '',
      sourceAvailable,
      sourceQuantityVersion: source?.quantityVersion ?? 0,
      destinationQuantityVersion: readVersion(product?.quantityVersion, 1),
      sources,
      error: '',
    })
  }

  lines.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
  return lines
}

/**
 * @param {object} line
 * @param {string} storageId
 */
export function withRefillSource(line, storageId) {
  const nextId = `${storageId ?? ''}`.trim()
  const source = (line?.sources ?? []).find((entry) => entry.storageId === nextId)
  if (!source) return line
  const quantity = capRefillQuantity(line.suggestedQuantity, source.quantity)
  return {
    ...line,
    sourceStorageId: source.storageId,
    sourceStorageName: source.storageName,
    sourceAvailable: source.quantity,
    sourceQuantityVersion: source.quantityVersion,
    quantity,
    quantityInput: quantity > 0 ? `${quantity}` : '',
    transferable: true,
    needsSupplierOrder: false,
    selected: quantity > 0,
    error: '',
  }
}

/**
 * @param {object} line
 * @param {unknown} raw
 * @returns {{ line: object, error: string }}
 */
export function withRefillQuantity(line, raw) {
  const text = `${raw ?? ''}`
  if (!text.trim()) {
    return {
      line: {
        ...line,
        quantity: 0,
        quantityInput: '',
        selected: false,
        error: '',
      },
      error: '',
    }
  }
  const parsed = parseRefillQuantity(text)
  if (!parsed.ok) {
    return {
      line: { ...line, quantityInput: text },
      error: parsed.error,
    }
  }
  const quantity = capRefillQuantity(parsed.value, line?.sourceAvailable)
  return {
    line: {
      ...line,
      quantity,
      quantityInput: `${quantity}`,
      selected: Boolean(line?.transferable) && quantity > 0,
      error: '',
    },
    error: '',
  }
}

/**
 * @param {object[]} lines
 */
export function refillLinesToTake(lines = []) {
  return (Array.isArray(lines) ? lines : []).filter((line) => (
    line?.selected === true
    && line?.transferable === true
    && line?.needsSupplierOrder !== true
    && Number(line?.quantity) > 0
    && `${line?.sourceStorageId ?? ''}`.trim()
  ))
}

/**
 * Drop lines that moved. Keep failures, with the error, still selected.
 *
 * @param {object[]} lines
 * @param {Array<{ stockItemId: string, ok: boolean, error?: string }>} results
 */
export function applyRefillResults(lines = [], results = []) {
  const byId = new Map((Array.isArray(results) ? results : []).map((result) => [result.stockItemId, result]))
  return (Array.isArray(lines) ? lines : []).flatMap((line) => {
    const result = byId.get(line.stockItemId)
    if (!result) return [line]
    if (result.ok) return []
    return [{
      ...line,
      selected: true,
      error: result.error || 'Unable to transfer stock right now.',
    }]
  })
}

/**
 * After a reload, drop successes and keep the error plus the operator's source
 * and quantity when that source still has stock.
 *
 * @param {object[]} freshLines
 * @param {object[]} previousLines
 * @param {Array<{ stockItemId: string, ok: boolean, error?: string }>} results
 */
export function keepFailedRefillLines(freshLines = [], previousLines = [], results = []) {
  const failed = new Map(
    (Array.isArray(results) ? results : [])
      .filter((result) => result && result.ok === false)
      .map((result) => [result.stockItemId, result.error || 'Unable to transfer stock right now.']),
  )
  const attempted = new Set((Array.isArray(results) ? results : []).map((result) => result.stockItemId))
  const previousById = new Map((Array.isArray(previousLines) ? previousLines : []).map((line) => [line.stockItemId, line]))

  return (Array.isArray(freshLines) ? freshLines : []).flatMap((fresh) => {
    if (attempted.has(fresh.stockItemId) && !failed.has(fresh.stockItemId)) return []
    const previous = previousById.get(fresh.stockItemId)
    let line = fresh
    if (previous?.sourceStorageId && previous.sourceStorageId !== fresh.sourceStorageId) {
      const stillThere = (fresh.sources ?? []).some((source) => source.storageId === previous.sourceStorageId)
      if (stillThere) line = withRefillSource(fresh, previous.sourceStorageId)
    }
    if (previous && Number(previous.quantity) > 0) {
      const quantity = capRefillQuantity(previous.quantity, line.sourceAvailable)
      line = {
        ...line,
        quantity,
        quantityInput: quantity > 0 ? `${quantity}` : '',
        selected: previous.selected === true && quantity > 0 && line.transferable,
      }
    }
    if (!failed.has(fresh.stockItemId)) return [line]
    return [{
      ...line,
      selected: true,
      error: failed.get(fresh.stockItemId),
    }]
  })
}

/**
 * @param {{
 *   supplyStorages?: object[],
 *   supplyBalances?: object[],
 *   itemsById?: Map<string, { name?: string, unit?: string, brand?: string }>,
 *   destinationStorageId?: string,
 * }} [input]
 */
export function listAdHocSupplyChoices({
  supplyStorages = [],
  supplyBalances = [],
  itemsById = new Map(),
  destinationStorageId = '',
} = {}) {
  const destinationId = `${destinationStorageId ?? ''}`.trim()
  const storages = (Array.isArray(supplyStorages) ? supplyStorages : []).filter((storage) => {
    const id = storageIdOf(storage)
    return id
      && id !== destinationId
      && (storage?.isSupply === true || storage?.is_supply === true)
      && storage?.active !== false
  }).map((storage) => ({
    id: storageIdOf(storage),
    name: `${storage?.name ?? 'Supply'}`.trim() || 'Supply',
  })).sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))

  const storageIds = new Set(storages.map((storage) => storage.id))
  const items = []
  for (const balance of Array.isArray(supplyBalances) ? supplyBalances : []) {
    const storageId = `${balance?.storageId ?? balance?.workspaceStorageId ?? balance?.workspace_storage_id ?? ''}`.trim()
    if (!storageIds.has(storageId)) continue
    const quantity = Number(balance?.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) continue
    const stockItemId = `${balance?.stockItemId ?? balance?.stock_item_id ?? ''}`.trim()
    if (!stockItemId) continue
    const item = itemsById.get(stockItemId)
    items.push({
      stockItemId,
      name: `${item?.name ?? 'Unknown product'}`.trim() || 'Unknown product',
      unit: `${item?.unit ?? ''}`.trim(),
      storageId,
      quantity: roundQuantity(quantity),
      quantityVersion: readVersion(balance?.quantityVersion ?? balance?.quantity_version),
    })
  }
  items.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
  return { storages, items }
}

/**
 * One in-flight take. A second call joins the first promise instead of
 * sending the transfers again.
 */
export function createSingleFlight() {
  /** @type {Promise<unknown>|null} */
  let current = null
  return function singleFlight(task) {
    if (current) return current
    current = Promise.resolve()
      .then(task)
      .finally(() => {
        current = null
      })
    return current
  }
}

/**
 * Plain on-hand number. The unit is shown separately on the row.
 *
 * @param {unknown} quantity
 * @returns {string}
 */
export function formatSupplyOnHand(quantity) {
  const value = Number(quantity)
  if (!Number.isFinite(value)) return '0'
  const rounded = roundQuantity(value)
  if (Object.is(rounded, -0)) return '0'
  return `${rounded}`
}

/**
 * @param {{ storageName?: string, name?: string, quantity?: number, sourceAvailable?: number }} source
 * @returns {string}
 */
export function formatSourceStockLabel(source) {
  const name = `${source?.storageName ?? source?.name ?? ''}`.trim() || 'Supply'
  const quantity = source?.quantity ?? source?.sourceAvailable ?? 0
  return `${name}: ${formatSupplyOnHand(quantity)}`
}

/**
 * @param {unknown} available
 * @param {unknown} quantity
 * @returns {string}
 */
export function formatRemainingLabel(available, quantity) {
  const avail = Number(available)
  const qty = Number(quantity)
  const safeAvail = Number.isFinite(avail) ? roundQuantity(Math.max(0, avail)) : 0
  const safeQty = Number.isFinite(qty) && qty > 0 ? roundQuantity(qty) : 0
  const remaining = roundQuantity(Math.max(0, safeAvail - safeQty))
  return `${formatSupplyOnHand(safeAvail)} → ${formatSupplyOnHand(remaining)}`
}

/**
 * @param {unknown} sourceName
 * @param {unknown} available
 * @returns {string}
 */
export function takeOverSourceWarning(sourceName, available) {
  const name = `${sourceName ?? ''}`.trim() || 'this storage'
  return `Only ${formatSupplyOnHand(available)} in ${name}.`
}

function productItemId(product) {
  return `${product?.stockItemId ?? product?.id ?? ''}`.trim()
}

function isShelfRelevant(product) {
  if (normalizeStorageParQuantity(product?.parQuantity) != null) return true
  const version = Number(product?.quantityVersion)
  if (Number.isFinite(version) && version >= 1) return true
  const quantity = Number(product?.quantity)
  return Number.isFinite(quantity) && quantity !== 0
}

function compareTakeName(left, right) {
  return `${left?.name ?? ''}`.localeCompare(`${right?.name ?? ''}`, undefined, { sensitivity: 'base' })
}

/**
 * Active supply storages except the destination, keyed by id.
 *
 * @param {object[]} supplyStorages
 * @param {string} destinationId
 */
function supplyStorageIndex(supplyStorages, destinationId) {
  /** @type {Map<string, { id: string, name: string }>} */
  const supplyById = new Map()
  for (const storage of Array.isArray(supplyStorages) ? supplyStorages : []) {
    const id = storageIdOf(storage)
    if (!id || id === destinationId) continue
    if (storage?.isSupply !== true && storage?.is_supply !== true) continue
    if (storage?.active === false) continue
    supplyById.set(id, {
      id,
      name: `${storage?.name ?? storage?.locationKey ?? 'Supply'}`.trim() || 'Supply',
    })
  }
  return supplyById
}

/**
 * Positive balances in indexed supply storages, grouped by item.
 * A later higher quantity for the same storage replaces the earlier one.
 *
 * @param {object[]} supplyBalances
 * @param {Map<string, { id: string, name: string }>} supplyById
 */
function sourcesByItemFromBalances(supplyBalances, supplyById) {
  /** @type {Map<string, object[]>} */
  const sourcesByItem = new Map()
  for (const balance of Array.isArray(supplyBalances) ? supplyBalances : []) {
    const storageId = `${balance?.storageId ?? balance?.workspaceStorageId ?? balance?.workspace_storage_id ?? ''}`.trim()
    const stockItemId = `${balance?.stockItemId ?? balance?.stock_item_id ?? ''}`.trim()
    const storage = supplyById.get(storageId)
    if (!storage || !stockItemId) continue
    const quantity = Number(balance?.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) continue
    const source = {
      storageId,
      storageName: storage.name,
      quantity: roundQuantity(quantity),
      quantityVersion: readVersion(balance?.quantityVersion ?? balance?.quantity_version),
      active: true,
    }
    const existing = sourcesByItem.get(stockItemId) ?? []
    const prior = existing.findIndex((entry) => entry.storageId === storageId)
    if (prior >= 0) {
      if (source.quantity > existing[prior].quantity) existing[prior] = source
    } else {
      existing.push(source)
    }
    sourcesByItem.set(stockItemId, existing)
  }
  return sourcesByItem
}

/**
 * Quick-pick rows for a department shelf.
 * Shelf items (par or a balance here) come first, then every other item
 * held in a supply storage. Default source is the one with the most on hand.
 *
 * @param {{
 *   shelfProducts?: object[],
 *   supplyStorages?: object[],
 *   supplyBalances?: object[],
 *   itemsById?: Map<string, { name?: string, unit?: string, brand?: string }>,
 *   destinationStorageId?: string,
 * }} [input]
 */
export function buildTakeRows({
  shelfProducts = [],
  supplyStorages = [],
  supplyBalances = [],
  itemsById = new Map(),
  destinationStorageId = '',
} = {}) {
  const destinationId = `${destinationStorageId ?? ''}`.trim()
  const supplyById = supplyStorageIndex(supplyStorages, destinationId)
  const sourcesByItem = sourcesByItemFromBalances(supplyBalances, supplyById)
  const catalog = itemsById instanceof Map ? itemsById : new Map()

  const makeRow = (stockItemId, identity, onShelf, shelfProduct) => {
    const sources = rankSupplySources(sourcesByItem.get(stockItemId) ?? [])
    const source = sources[0] ?? null
    const onHand = Number(shelfProduct?.quantity)
    return {
      stockItemId,
      name: identity.name,
      unit: identity.unit,
      brand: identity.brand,
      onShelf,
      shelfQuantity: Number.isFinite(onHand) ? onHand : null,
      parQuantity: shelfProduct?.parQuantity ?? null,
      sources,
      sourceStorageId: source?.storageId ?? '',
      sourceStorageName: source?.storageName ?? '',
      sourceAvailable: source ? source.quantity : 0,
      sourceQuantityVersion: source?.quantityVersion ?? 0,
      destinationQuantityVersion: readVersion(shelfProduct?.quantityVersion, 1),
      quantity: 0,
      quantityInput: '',
      warning: '',
      error: '',
    }
  }

  /** @type {object[]} */
  const shelfRows = []
  const seen = new Set()
  for (const product of Array.isArray(shelfProducts) ? shelfProducts : []) {
    const stockItemId = productItemId(product)
    if (!stockItemId || seen.has(stockItemId) || !isShelfRelevant(product)) continue
    seen.add(stockItemId)
    const item = catalog.get(stockItemId)
    shelfRows.push(makeRow(stockItemId, {
      name: `${product?.name ?? item?.name ?? 'Unknown product'}`.trim() || 'Unknown product',
      unit: `${product?.unit ?? item?.unit ?? ''}`.trim(),
      brand: `${product?.brand ?? item?.brand ?? ''}`.trim(),
    }, true, product))
  }
  shelfRows.sort(compareTakeName)

  /** @type {object[]} */
  const supplyRows = []
  for (const stockItemId of sourcesByItem.keys()) {
    if (seen.has(stockItemId)) continue
    const item = catalog.get(stockItemId)
    supplyRows.push(makeRow(stockItemId, {
      name: `${item?.name ?? 'Unknown product'}`.trim() || 'Unknown product',
      unit: `${item?.unit ?? ''}`.trim(),
      brand: `${item?.brand ?? ''}`.trim(),
    }, false, null))
  }
  supplyRows.sort(compareTakeName)
  return [...shelfRows, ...supplyRows]
}

/**
 * Case-insensitive match on name, unit, brand, and source storage names.
 * An empty query keeps the shelf-first order.
 *
 * @param {object[]} rows
 * @param {unknown} query
 */
export function searchTakeRows(rows = [], query = '') {
  const list = Array.isArray(rows) ? rows : []
  const needle = `${query ?? ''}`.trim().toLowerCase()
  if (!needle) return list.slice()
  return list.filter((row) => {
    const fields = [
      row?.name,
      row?.unit,
      row?.brand,
      ...(Array.isArray(row?.sources) ? row.sources.map((source) => source?.storageName) : []),
    ]
    return fields.some((field) => `${field ?? ''}`.toLowerCase().includes(needle))
  })
}

/**
 * Type a take quantity. Over-asks are capped and warned. Invalid text stays
 * visible and is not added to the take list.
 *
 * @param {object} row
 * @param {unknown} raw
 */
export function setTakeQuantity(row, raw) {
  const text = `${raw ?? ''}`
  if (!text.trim()) {
    return { ...row, quantity: 0, quantityInput: '', warning: '', error: '' }
  }
  const parsed = parseRefillQuantity(text)
  if (!parsed.ok) {
    return { ...row, quantity: 0, quantityInput: text, warning: '', error: parsed.error }
  }
  const available = Number(row?.sourceAvailable)
  const hasSource = Boolean(`${row?.sourceStorageId ?? ''}`.trim()) && Number.isFinite(available) && available > 0
  if (!hasSource) {
    return {
      ...row,
      quantity: 0,
      quantityInput: text,
      warning: '',
      error: NEEDS_SUPPLIER_ORDER_LABEL,
    }
  }
  if (parsed.value > roundQuantity(available)) {
    const quantity = capRefillQuantity(parsed.value, available)
    return {
      ...row,
      quantity,
      quantityInput: quantity > 0 ? `${quantity}` : '',
      warning: takeOverSourceWarning(row?.sourceStorageName, available),
      error: '',
    }
  }
  return {
    ...row,
    quantity: parsed.value,
    quantityInput: `${parsed.value}`,
    warning: '',
    error: '',
  }
}

/**
 * Step by a whole amount. Plus stays usable at the cap so the warning can show.
 *
 * @param {object} row
 * @param {number} delta
 */
export function stepTakeQuantity(row, delta) {
  if (!`${row?.sourceStorageId ?? ''}`.trim()) return row
  const current = Number(row?.quantity)
  const base = Number.isFinite(current) && current > 0 ? current : 0
  const next = roundQuantity(base + Number(delta || 0))
  if (!Number.isFinite(next) || next <= 0) {
    return { ...row, quantity: 0, quantityInput: '', warning: '', error: '' }
  }
  return setTakeQuantity(row, `${next}`)
}

/**
 * Choose a supply source and recap any quantity already entered.
 *
 * @param {object} row
 * @param {string} storageId
 */
export function withTakeSource(row, storageId) {
  const nextId = `${storageId ?? ''}`.trim()
  const source = (row?.sources ?? []).find((entry) => entry.storageId === nextId)
  if (!source) return row
  const switched = {
    ...row,
    sourceStorageId: source.storageId,
    sourceStorageName: source.storageName,
    sourceAvailable: source.quantity,
    sourceQuantityVersion: source.quantityVersion,
    warning: '',
    error: '',
  }
  const raw = `${row?.quantityInput ?? ''}`.trim()
    ? row.quantityInput
    : (Number(row?.quantity) > 0 ? `${row.quantity}` : '')
  if (!`${raw ?? ''}`.trim()) return switched
  return setTakeQuantity(switched, raw)
}

/**
 * Lines the existing transfer helper can send. Quantity must be above zero.
 *
 * @param {object[]} rows
 * @param {object[]} [shelfProducts]
 */
export function takeRowsToTransfer(rows = [], shelfProducts = []) {
  /** @type {Map<string, number>} */
  const versionById = new Map()
  for (const product of Array.isArray(shelfProducts) ? shelfProducts : []) {
    const id = productItemId(product)
    if (!id) continue
    versionById.set(id, readVersion(product?.quantityVersion, 1))
  }
  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const quantity = Number(row?.quantity)
    const sourceStorageId = `${row?.sourceStorageId ?? ''}`.trim()
    const stockItemId = `${row?.stockItemId ?? ''}`.trim()
    if (!stockItemId || !(quantity > 0) || !sourceStorageId) return []
    return [{
      stockItemId,
      selected: true,
      transferable: true,
      needsSupplierOrder: false,
      quantity,
      sourceStorageId,
      sourceQuantityVersion: readVersion(row?.sourceQuantityVersion, 1),
      destinationQuantityVersion: versionById.has(stockItemId)
        ? versionById.get(stockItemId)
        : readVersion(row?.destinationQuantityVersion, 1),
    }]
  })
}

/**
 * Clear lines that moved. Keep a failed quantity and attach the error.
 *
 * @param {object[]} rows
 * @param {Array<{ stockItemId: string, ok: boolean, error?: string }>} results
 */
export function applyTakeResults(rows = [], results = []) {
  const byId = new Map((Array.isArray(results) ? results : []).map((result) => [result.stockItemId, result]))
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const result = byId.get(row.stockItemId)
    if (!result) return row
    if (result.ok) {
      return { ...row, quantity: 0, quantityInput: '', warning: '', error: '' }
    }
    return {
      ...row,
      error: result.error || 'Unable to transfer stock right now.',
    }
  })
}

/**
 * After a refetch, drop quantities that moved and restore failures onto the
 * fresh on-hand figures. Rows that were not part of this take keep their quantity.
 *
 * @param {object[]} freshRows
 * @param {object[]} previousRows
 * @param {Array<{ stockItemId: string, ok: boolean, error?: string }>} results
 */
export function keepFailedTakeRows(freshRows = [], previousRows = [], results = []) {
  const resultById = new Map((Array.isArray(results) ? results : []).map((result) => [result.stockItemId, result]))
  const previousById = new Map((Array.isArray(previousRows) ? previousRows : []).map((row) => [row.stockItemId, row]))
  return (Array.isArray(freshRows) ? freshRows : []).map((fresh) => {
    const result = resultById.get(fresh.stockItemId)
    if (result?.ok) {
      return { ...fresh, quantity: 0, quantityInput: '', warning: '', error: '' }
    }
    const previous = previousById.get(fresh.stockItemId)
    if (!previous) return fresh
    let row = fresh
    if (previous.sourceStorageId) {
      const switched = withTakeSource(fresh, previous.sourceStorageId)
      if (switched.sourceStorageId === previous.sourceStorageId) row = switched
    }
    const raw = `${previous.quantityInput ?? ''}`.trim()
      ? previous.quantityInput
      : (Number(previous.quantity) > 0 ? `${previous.quantity}` : '')
    if (`${raw ?? ''}`.trim()) row = setTakeQuantity(row, raw)
    if (result && result.ok === false) {
      return {
        ...row,
        error: result.error || 'Unable to transfer stock right now.',
      }
    }
    return row
  })
}
