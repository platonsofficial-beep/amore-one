/**
 * P8.29.12 — Pure display helpers for stock location balances.
 *
 * No network, no UI, no mutation of inputs.
 */

/**
 * @param {unknown} value
 * @returns {number}
 */
function asQuantity(value) {
  const quantity = Number(value)
  return Number.isFinite(quantity) ? quantity : 0
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function asTrimmedString(value) {
  if (value == null) return ''
  return String(value).trim()
}

/**
 * Normalize a balance row (+ optional storage catalog fields) for display.
 *
 * @param {Record<string, unknown>|null|undefined} record
 * @returns {{
 *   id: string|null,
 *   workspaceId: string,
 *   stockItemId: string,
 *   workspaceStorageId: string,
 *   locationKey: string,
 *   locationName: string,
 *   quantity: number,
 *   quantityVersion: number,
 *   storageActive: boolean,
 *   sortOrder: number,
 * }}
 */
export function mapStockLocationBalanceDisplay(record) {
  const storage = record?.workspace_storages
    ?? record?.workspaceStorage
    ?? null
  const locationKey = asTrimmedString(
    record?.location_key
      ?? record?.locationKey
      ?? storage?.location_key
      ?? storage?.locationKey,
  )
  const locationName = asTrimmedString(
    storage?.name
      ?? record?.locationName
      ?? locationKey,
  ) || locationKey || '—'
  const storageActive = storage == null
    ? record?.storageActive !== false && record?.storage_active !== false
    : storage.active !== false

  return {
    id: record?.id == null ? null : String(record.id),
    workspaceId: asTrimmedString(record?.workspace_id ?? record?.workspaceId),
    stockItemId: asTrimmedString(record?.stock_item_id ?? record?.stockItemId),
    workspaceStorageId: asTrimmedString(
      record?.workspace_storage_id ?? record?.workspaceStorageId,
    ),
    locationKey,
    locationName,
    quantity: asQuantity(record?.quantity),
    quantityVersion: Math.max(1, Math.floor(Number(record?.quantity_version
      ?? record?.quantityVersion
      ?? 1)) || 1),
    storageActive,
    sortOrder: Number(record?.sort_order
      ?? record?.sortOrder
      ?? storage?.sort_order
      ?? storage?.sortOrder
      ?? 0) || 0,
  }
}

/**
 * Display policy:
 * - Hide zero balances by default
 * - Inactive storages only when quantity > 0
 *
 * @param {Array<ReturnType<typeof mapStockLocationBalanceDisplay>>} balances
 * @returns {Array<ReturnType<typeof mapStockLocationBalanceDisplay>>}
 */
export function selectVisibleStockLocationBalances(balances) {
  const list = Array.isArray(balances) ? balances : []
  return list.filter((entry) => {
    if (!entry) return false
    if (!(entry.quantity > 0)) return false
    return true
  })
}

/**
 * Order by workspace_storages.sort_order, then location name.
 *
 * @param {Array<ReturnType<typeof mapStockLocationBalanceDisplay>>} balances
 * @returns {Array<ReturnType<typeof mapStockLocationBalanceDisplay>>}
 */
export function sortStockLocationBalancesForDisplay(balances) {
  const list = Array.isArray(balances) ? [...balances] : []
  list.sort((left, right) => {
    const sortDelta = (Number(left?.sortOrder) || 0) - (Number(right?.sortOrder) || 0)
    if (sortDelta !== 0) return sortDelta
    const leftName = asTrimmedString(left?.locationName || left?.locationKey)
    const rightName = asTrimmedString(right?.locationName || right?.locationKey)
    return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' })
  })
  return list
}

/**
 * Map → filter zeros → sort for item-detail panels.
 *
 * @param {unknown} records
 * @returns {Array<ReturnType<typeof mapStockLocationBalanceDisplay>>}
 */
export function buildStockLocationBalanceDisplayList(records) {
  const mapped = (Array.isArray(records) ? records : [])
    .map((record) => mapStockLocationBalanceDisplay(record))
  return sortStockLocationBalancesForDisplay(
    selectVisibleStockLocationBalances(mapped),
  )
}
