import { normalizeSupplierId } from './stockSupplierUtils'
import { normalizeStorageParQuantity, storageParShort } from './stockStoragePar'
import {
  buildSuggestedOrderLine,
  computeOrderLineTotal,
  computeOrderTotalCost,
  formatStockOrderNumber,
  normalizeStockOrderStatus,
  resolveOrderGroupIdentity,
} from './stockOrderUtils'
import { formatStockQuantity } from './stockUtils'

export const SUPPLY_ORDER_DRAFT_EMPTY_MESSAGE =
  'Nothing is below par in a supply or buying storage.'

function roundOrderQuantity(value) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

function trimmedId(value) {
  const id = `${value ?? ''}`.trim()
  return id || ''
}

/**
 * Supply storages are always order sources. A storage marked as buying is
 * an order source even when it is not a supply storage. Archived storages
 * are not.
 *
 * @param {object|null|undefined} storage
 * @returns {boolean}
 */
export function isOrderSourceStorage(storage) {
  if (!storage || storage.active === false) return false
  return storage.isSupply === true
    || storage.is_supply === true
    || storage.isBuying === true
    || storage.is_buying === true
}

/**
 * Par minus on-hand, summed across supply and buying storages.
 * A blank par is skipped. A missing balance counts as 0.
 * Catalog minimum and target are not read.
 *
 * @param {{
 *   itemId?: unknown,
 *   storages?: unknown,
 *   balances?: unknown,
 *   pars?: unknown,
 * }} input
 * @returns {number}
 */
export function supplyOrderQuantity({
  itemId,
  storages = [],
  balances = [],
  pars = [],
} = {}) {
  const normalizedItemId = trimmedId(itemId)
  if (!normalizedItemId) return 0

  const sourceIds = new Set(
    (Array.isArray(storages) ? storages : [])
      .filter(isOrderSourceStorage)
      .map((storage) => trimmedId(storage.id))
      .filter(Boolean),
  )
  if (sourceIds.size === 0) return 0

  /** @type {Map<string, number>} */
  const parByStorage = new Map()
  for (const par of Array.isArray(pars) ? pars : []) {
    if (trimmedId(par?.stockItemId ?? par?.stock_item_id) !== normalizedItemId) continue
    const storageId = trimmedId(par?.workspaceStorageId ?? par?.workspace_storage_id)
    if (!storageId || !sourceIds.has(storageId)) continue
    const quantity = normalizeStorageParQuantity(par?.parQuantity ?? par?.par_quantity)
    if (quantity == null) continue
    parByStorage.set(storageId, quantity)
  }

  /** @type {Map<string, number>} */
  const onHandByStorage = new Map()
  for (const balance of Array.isArray(balances) ? balances : []) {
    if (trimmedId(balance?.stockItemId ?? balance?.stock_item_id) !== normalizedItemId) continue
    const storageId = trimmedId(balance?.workspaceStorageId ?? balance?.workspace_storage_id)
    if (!storageId || !parByStorage.has(storageId)) continue
    const quantity = Number(balance?.quantity)
    const hand = Number.isFinite(quantity) ? quantity : 0
    onHandByStorage.set(storageId, (onHandByStorage.get(storageId) ?? 0) + hand)
  }

  let total = 0
  for (const [storageId, parQuantity] of parByStorage) {
    const short = storageParShort(parQuantity, onHandByStorage.get(storageId) ?? 0)
    if (short) total += short
  }
  return roundOrderQuantity(total)
}

/**
 * One editable draft group per supplier. Quantity is the supply/buying shortfall.
 *
 * @param {{
 *   items?: unknown,
 *   storages?: unknown,
 *   balances?: unknown,
 *   pars?: unknown,
 *   suppliers?: unknown,
 * }} [input]
 */
export function buildSupplyOrderDraftGroups({
  items = [],
  storages = [],
  balances = [],
  pars = [],
  suppliers = [],
} = {}) {
  const groups = new Map()

  for (const item of Array.isArray(items) ? items : []) {
    if (!item || item.active === false) continue
    const itemId = trimmedId(item.id)
    if (!itemId) continue
    const quantity = supplyOrderQuantity({ itemId, storages, balances, pars })
    if (!(quantity > 0)) continue

    const identity = resolveOrderGroupIdentity(item, suppliers)
    const line = buildSuggestedOrderLine({ ...item, id: itemId })
    line.quantity = quantity
    line.totalPrice = computeOrderTotalCost([{ quantity, costPrice: line.costPrice }])
    line.needLabel = formatStockQuantity(quantity, item.unit)

    if (!groups.has(identity.groupKey)) {
      groups.set(identity.groupKey, {
        groupKey: identity.groupKey,
        supplier: identity.supplier,
        supplierId: identity.supplierId,
        items: [],
      })
    }
    groups.get(identity.groupKey).items.push(line)
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      totalCost: computeOrderTotalCost(group.items),
    }))
    .sort((left, right) => left.supplier.localeCompare(right.supplier))
}

function draftTimestamp(order) {
  const raw = order?.updatedAt ?? order?.updated_at ?? order?.createdAt ?? order?.created_at ?? ''
  const time = Date.parse(`${raw}`)
  return Number.isFinite(time) ? time : 0
}

/**
 * The open draft for this supplier, if one already exists.
 * supplier_id wins. Legacy name matches only when both sides lack an id.
 *
 * @param {unknown} orders
 * @param {{ supplierId?: unknown, supplier?: string }} group
 */
export function findOpenSupplierDraft(orders, group) {
  const drafts = (Array.isArray(orders) ? orders : []).filter((order) => (
    normalizeStockOrderStatus(order?.status) === 'draft'
  ))
  const supplierId = normalizeSupplierId(group?.supplierId)
  const matches = supplierId != null
    ? drafts.filter((order) => normalizeSupplierId(order?.supplierId ?? order?.supplier_id) === supplierId)
    : drafts.filter((order) => {
      if (normalizeSupplierId(order?.supplierId ?? order?.supplier_id) != null) return false
      return `${order?.supplier ?? ''}`.trim().toLowerCase() === `${group?.supplier ?? ''}`.trim().toLowerCase()
    })

  return matches.sort((left, right) => draftTimestamp(right) - draftTimestamp(left))[0] ?? null
}

/**
 * Create a draft when the supplier has none. Refresh the open draft when one exists.
 * Notes and the expected delivery date on an existing draft stay put.
 *
 * @param {unknown} groups
 * @param {unknown} existingOrders
 */
export function planSupplyOrderDraftWrites(groups, existingOrders) {
  return (Array.isArray(groups) ? groups : [])
    .filter((group) => Array.isArray(group?.items) && group.items.length > 0)
    .map((group) => {
      const existing = findOpenSupplierDraft(existingOrders, group)
      if (!existing) return { action: 'create', group }
      return {
        action: 'update',
        orderId: existing.id,
        group,
        notes: existing.notes ?? '',
        expectedDeliveryDate: existing.expectedDeliveryDate ?? existing.expected_delivery_date ?? null,
      }
    })
}

/**
 * @param {{ created?: unknown, updated?: unknown }} [result]
 * @returns {string}
 */
function formatEuroAmount(value) {
  const amount = Number(value)
  const safe = Number.isFinite(amount) ? amount : 0
  return `€${safe.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
}

function orderTotalAmount(order) {
  if (!order) return 0
  const direct = Number(order.totalCost ?? order.total_cost)
  if (Number.isFinite(direct)) return direct
  return computeOrderTotalCost(order.items ?? [])
}

/**
 * Lines shown before Prepare drafts writes anything.
 *
 * @param {unknown} plan
 * @param {unknown} existingOrders
 */
export function formatSupplyOrderDraftPreview(plan = [], existingOrders = []) {
  const orders = Array.isArray(existingOrders) ? existingOrders : []
  return (Array.isArray(plan) ? plan : []).map((step) => {
    const supplier = `${step?.group?.supplier ?? ''}`.trim() || 'Supplier'
    const nextTotal = formatEuroAmount(step?.group?.totalCost)
    if (step?.action !== 'update') {
      return `Create a draft for ${supplier} · ${nextTotal}`
    }
    const existing = orders.find((order) => String(order?.id) === String(step.orderId))
    const number = formatStockOrderNumber(existing?.orderNumber ?? existing?.order_number)
    const previousTotal = formatEuroAmount(orderTotalAmount(existing))
    return `Update draft ${number} for ${supplier} · ${previousTotal} → ${nextTotal}`
  })
}

/**
 * Editable review rows: one group per supplier, with the planned lines.
 */
export function buildSupplyOrderDraftReview(plan = []) {
  return (Array.isArray(plan) ? plan : []).map((step) => ({
    action: step?.action === 'update' ? 'update' : 'create',
    orderId: step?.orderId ?? null,
    supplier: `${step?.group?.supplier ?? ''}`.trim() || 'Supplier',
    supplierId: step?.group?.supplierId ?? null,
    notes: step?.notes ?? '',
    expectedDeliveryDate: step?.expectedDeliveryDate ?? null,
    items: (Array.isArray(step?.group?.items) ? step.group.items : []).map((item) => ({ ...item })),
  })).filter((group) => group.items.length > 0)
}

export function updateSupplyOrderDraftReviewQuantity(groups = [], groupIndex, itemIndex, rawQuantity) {
  const quantity = Number(rawQuantity)

  return (Array.isArray(groups) ? groups : []).map((group, currentGroupIndex) => {
    if (currentGroupIndex !== groupIndex) return group
    const items = (group.items ?? []).flatMap((item, currentItemIndex) => {
      if (currentItemIndex !== itemIndex) return [item]
      if (!Number.isFinite(quantity) || quantity <= 0) return []
      return [{
        ...item,
        quantity,
        totalPrice: computeOrderLineTotal(quantity, item.costPrice),
        needLabel: formatStockQuantity(quantity, item.unit),
      }]
    })
    return {
      ...group,
      items,
    }
  }).filter((group) => Array.isArray(group.items) && group.items.length > 0)
}

export function reviewPlanToWrites(groups = []) {
  return (Array.isArray(groups) ? groups : [])
    .filter((group) => Array.isArray(group?.items) && group.items.length > 0)
    .map((group) => ({
      action: group.action === 'update' ? 'update' : 'create',
      orderId: group.orderId ?? null,
      notes: group.notes ?? '',
      expectedDeliveryDate: group.expectedDeliveryDate ?? null,
      group: {
        supplier: group.supplier,
        supplierId: group.supplierId ?? null,
        items: group.items,
        totalCost: computeOrderTotalCost(group.items),
      },
    }))
}

export function formatSupplyOrderDraftNotice({ created = [], updated = [] } = {}) {
  const createdCount = Array.isArray(created) ? created.length : 0
  const updatedCount = Array.isArray(updated) ? updated.length : 0
  if (createdCount === 0 && updatedCount === 0) return SUPPLY_ORDER_DRAFT_EMPTY_MESSAGE

  const parts = []
  if (createdCount > 0) {
    parts.push(`Created ${createdCount} draft${createdCount === 1 ? '' : 's'}`)
  }
  if (updatedCount > 0) {
    parts.push(`updated ${updatedCount} draft${updatedCount === 1 ? '' : 's'}`)
  }
  const lead = parts.join(' and ')
  const capitalized = lead.charAt(0).toUpperCase() + lead.slice(1)
  return `${capitalized} from supply pars. Edit them before sending.`
}
