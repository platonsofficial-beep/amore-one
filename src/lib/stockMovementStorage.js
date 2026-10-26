/**
 * Dashboard stock movements pick one storage, then call the location RPC
 * with that balance's quantity_version.
 *
 * Order:
 * 1. Session last-used storage for this item, if it is still active.
 * 2. The only active location whose balance is greater than zero.
 * 3. stock_items.storage_location exact-matched to an active storage.
 * 4. Otherwise the operator must pick.
 */

const SESSION_KEY_PREFIX = 'one.stockMovementStorage'

function asText(value) {
  if (value == null) return ''
  return String(value).trim()
}

function normalizeStorage(storage) {
  const id = asText(storage?.id)
  const locationKey = asText(storage?.locationKey ?? storage?.location_key ?? storage?.name)
  const name = asText(storage?.name ?? storage?.locationName) || locationKey
  return {
    id,
    name,
    locationKey,
    active: storage?.active !== false && storage?.storageActive !== false,
    sortOrder: Number(storage?.sortOrder ?? storage?.sort_order ?? 0) || 0,
  }
}

function normalizeBalance(balance) {
  const quantity = Number(balance?.quantity)
  const version = Number(balance?.quantityVersion ?? balance?.quantity_version)
  return {
    workspaceStorageId: asText(balance?.workspaceStorageId ?? balance?.workspace_storage_id),
    locationKey: asText(balance?.locationKey ?? balance?.location_key),
    locationName: asText(balance?.locationName ?? balance?.location_name ?? balance?.locationKey ?? balance?.location_key),
    quantity: Number.isFinite(quantity) ? quantity : 0,
    quantityVersion: Number.isFinite(version) && version >= 1 ? Math.floor(version) : null,
    storageActive: balance?.storageActive !== false && balance?.storage_active !== false,
  }
}

function choice(storage, balance, source) {
  return {
    storage: storage
      ? { id: storage.id, name: storage.name, locationKey: storage.locationKey }
      : null,
    source,
    requiresPicker: !storage,
    quantityVersion: balance?.quantityVersion ?? null,
    balanceQuantity: balance ? balance.quantity : null,
  }
}

function balanceForStorage(balances, storageId) {
  return balances.find((balance) => balance.workspaceStorageId === storageId) ?? null
}

/**
 * @param {{
 *   item?: object|null,
 *   balances?: Array<object>,
 *   storages?: Array<object>,
 *   lastUsedStorageId?: string|null,
 * }} input
 */
export function resolveStockMovementStorage({
  item = null,
  balances = [],
  storages = [],
  lastUsedStorageId = null,
} = {}) {
  const activeStorages = (Array.isArray(storages) ? storages : [])
    .map(normalizeStorage)
    .filter((storage) => storage.id && storage.active)
  const activeIds = new Set(activeStorages.map((storage) => storage.id))
  const normalizedBalances = (Array.isArray(balances) ? balances : [])
    .map(normalizeBalance)
    .filter((balance) => balance.workspaceStorageId && balance.storageActive && activeIds.has(balance.workspaceStorageId))

  const lastUsedId = asText(lastUsedStorageId)
  const lastUsed = activeStorages.find((storage) => storage.id === lastUsedId) ?? null
  if (lastUsed) {
    return choice(lastUsed, balanceForStorage(normalizedBalances, lastUsed.id), 'session')
  }

  const positiveStorages = []
  const seenPositive = new Set()
  for (const balance of normalizedBalances) {
    if (!(balance.quantity > 0) || seenPositive.has(balance.workspaceStorageId)) continue
    seenPositive.add(balance.workspaceStorageId)
    const storage = activeStorages.find((entry) => entry.id === balance.workspaceStorageId)
    if (storage) positiveStorages.push({ storage, balance })
  }
  if (positiveStorages.length === 1) {
    const only = positiveStorages[0]
    return choice(only.storage, only.balance, 'sole_positive')
  }

  const catalogKey = asText(item?.storageLocation ?? item?.storage_location)
  const catalogStorage = catalogKey
    ? activeStorages.find((storage) => storage.locationKey === catalogKey) ?? null
    : null
  if (catalogStorage) {
    return choice(catalogStorage, balanceForStorage(normalizedBalances, catalogStorage.id), 'catalog')
  }

  return choice(null, null, null)
}

/**
 * One line for quick count when other locations still hold this product.
 * @param {Array<object>} balances
 * @param {string|null|undefined} selectedStorageId
 * @param {(quantity: number, unit?: string) => string} formatQuantity
 * @param {string} [unit]
 * @returns {string}
 */
export function describeOtherLocationStock(balances, selectedStorageId, formatQuantity, unit = '') {
  const selectedId = asText(selectedStorageId)
  const others = (Array.isArray(balances) ? balances : [])
    .map(normalizeBalance)
    .filter((balance) => balance.workspaceStorageId
      && balance.workspaceStorageId !== selectedId
      && balance.quantity > 0)
  if (others.length === 0) return ''
  const format = typeof formatQuantity === 'function'
    ? formatQuantity
    : (quantity) => String(quantity)
  if (others.length === 1) {
    const only = others[0]
    const name = only.locationName || only.locationKey || 'Another storage'
    return `${name} keeps ${format(only.quantity, unit)}`
  }
  const total = others.reduce((sum, balance) => sum + balance.quantity, 0)
  const parts = others.map((balance) => {
    const name = balance.locationName || balance.locationKey || 'Storage'
    return `${name} ${format(balance.quantity, unit)}`
  })
  return `Other locations keep ${format(total, unit)} (${parts.join(', ')}).`
}

export function stockMovementStorageActionLabel(movementType, storageName) {
  const name = asText(storageName)
  if (!name) return 'Choose a storage'
  if (movementType === 'receive') return `Receive into ${name}`
  if (movementType === 'usage') return `Use from ${name}`
  if (movementType === 'waste') return `Waste from ${name}`
  if (movementType === 'adjustment') return `Adjust ${name}`
  if (movementType === 'stock_count') return `Count ${name}`
  return name
}

export function readLastUsedStockMovementStorage(workspaceId, itemId) {
  const workspace = asText(workspaceId)
  const item = asText(itemId)
  if (!workspace || !item || typeof sessionStorage === 'undefined') return ''
  try {
    return asText(sessionStorage.getItem(`${SESSION_KEY_PREFIX}:${workspace}:${item}`))
  } catch {
    return ''
  }
}

export function rememberLastUsedStockMovementStorage(workspaceId, itemId, storageId) {
  const workspace = asText(workspaceId)
  const item = asText(itemId)
  const storage = asText(storageId)
  if (!workspace || !item || !storage || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(`${SESSION_KEY_PREFIX}:${workspace}:${item}`, storage)
  } catch {
    // Private mode and disabled storage are not a reason to block the movement.
  }
}
