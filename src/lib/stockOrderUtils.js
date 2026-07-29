import { computeSuggestedOrder, itemNeedsOrder } from './stockCatalog'
import { normalizeSupplierId } from './stockSupplierUtils'
import { formatStockPurchasePrice, formatStockQuantity } from './stockUtils'

export const STOCK_ORDER_STATUSES = ['draft', 'sent', 'received', 'cancelled']

const UNASSIGNED_SUPPLIER = 'Unassigned supplier'

export function normalizeStockOrderStatus(status) {
  const normalized = `${status ?? ''}`.trim().toLowerCase()
  return STOCK_ORDER_STATUSES.includes(normalized) ? normalized : 'draft'
}

export function getStockOrderStatusLabel(status) {
  const normalized = normalizeStockOrderStatus(status)
  if (normalized === 'sent') return 'Sent'
  if (normalized === 'received') return 'Received'
  if (normalized === 'cancelled') return 'Cancelled'
  return 'Draft'
}

export function getStockOrderStatusTone(status) {
  const normalized = normalizeStockOrderStatus(status)
  if (normalized === 'sent') return 'info'
  if (normalized === 'received') return 'success'
  if (normalized === 'cancelled') return 'muted'
  return 'warning'
}

export function canEditStockOrder(order) {
  return normalizeStockOrderStatus(order?.status) === 'draft'
}

export function canMarkStockOrderSent(order) {
  return normalizeStockOrderStatus(order?.status) === 'draft'
}

export function canMarkStockOrderReceived(order) {
  return normalizeStockOrderStatus(order?.status) === 'sent'
}

export function canReceiveStockOrder(order) {
  return normalizeStockOrderStatus(order?.status) === 'sent'
}

export function canCancelStockOrder(order) {
  return normalizeStockOrderStatus(order?.status) === 'draft'
}

export function computeOrderLineTotal(quantity, costPrice) {
  const qty = Math.max(0, Number(quantity) || 0)
  const cost = Math.max(0, Number(costPrice) || 0)
  return qty * cost
}

export function computeOrderTotalCost(items = []) {
  return (items ?? []).reduce((sum, item) => {
    const lineTotal = item.totalPrice ?? computeOrderLineTotal(item.quantity, item.costPrice)
    return sum + (Number(lineTotal) || 0)
  }, 0)
}

export function buildSuggestedOrderLine(item) {
  const quantity = computeSuggestedOrder(item)
  const costPrice = Math.max(0, Number(item.costPrice ?? item.cost_price) || 0)

  return {
    stockItemId: item.id,
    itemName: item.name ?? '',
    quantity,
    unit: item.unit ?? '',
    costPrice,
    totalPrice: computeOrderLineTotal(quantity, costPrice),
    needLabel: formatStockQuantity(quantity, item.unit),
  }
}

/**
 * P8.16.15 — Live catalog lookup for draft lines that may reference deactivated products.
 * Missing catalog rows / null stockItemId are treated as unknown (not inactive).
 */
export function isStockOrderLineInactive(line, stockItems = []) {
  const stockItemId = line?.stockItemId ?? line?.stock_item_id ?? null
  if (stockItemId == null || `${stockItemId}`.trim() === '') return false

  const catalogItem = (stockItems ?? []).find((item) => `${item?.id}` === `${stockItemId}`)
  if (!catalogItem) return false
  return catalogItem.active === false
}

/**
 * Active catalog products available to replace a deactivated draft line.
 * Excludes inactive items and other stock items already on the draft.
 */
export function getActiveStockItemsForDraftReplace(stockItems = [], {
  excludeStockItemIds = [],
} = {}) {
  const excluded = new Set(
    (excludeStockItemIds ?? [])
      .filter((id) => id != null && `${id}`.trim() !== '')
      .map((id) => `${id}`),
  )

  return (stockItems ?? [])
    .filter((item) => item && item.active !== false)
    .filter((item) => !excluded.has(`${item.id}`))
    .slice()
    .sort((a, b) => `${a.name ?? ''}`.localeCompare(`${b.name ?? ''}`))
}

/** Apply a catalog product onto an existing draft line, preserving line id + quantity. */
export function replaceDraftOrderLineProduct(line, catalogItem) {
  const quantity = Math.max(0, Number(line?.quantity) || 0)
  const costPrice = Math.max(0, Number(catalogItem?.costPrice ?? catalogItem?.cost_price) || 0)

  return {
    ...line,
    stockItemId: catalogItem?.id ?? null,
    itemName: catalogItem?.name ?? '',
    unit: catalogItem?.unit ?? '',
    costPrice,
    totalPrice: computeOrderLineTotal(quantity, costPrice),
  }
}

/**
 * Create-order group identity (P7.3.6 / P8.26.6c).
 * supplier_id wins; legacy text only when FK missing; Unassigned preserved.
 */
export function resolveOrderGroupIdentity(item, suppliers = []) {
  const supplierId = normalizeSupplierId(item?.supplierId ?? item?.supplier_id)
  const supplierText = `${item?.supplier ?? ''}`.trim()

  if (supplierId != null) {
    const list = Array.isArray(suppliers) ? suppliers : []
    const matched = list.find((supplier) => normalizeSupplierId(supplier?.id) === supplierId)
    const directoryName = `${matched?.companyName ?? matched?.company_name ?? ''}`.trim()
    const displayName = directoryName || supplierText || `Supplier #${supplierId}`

    return {
      groupKey: `id:${supplierId}`,
      supplierId,
      supplier: displayName,
    }
  }

  if (!supplierText) {
    return {
      groupKey: `name:${UNASSIGNED_SUPPLIER}`,
      supplierId: null,
      supplier: UNASSIGNED_SUPPLIER,
    }
  }

  return {
    groupKey: `name:${supplierText}`,
    supplierId: null,
    supplier: supplierText,
  }
}

/**
 * Group suggested order lines by supplier.
 * FK-first (supplier_id); legacy text fallback when FK missing.
 */
export function buildSupplierOrderGroups(stockItems = [], suppliers = []) {
  const groups = new Map()

  ;(stockItems ?? []).forEach((item) => {
    if (item.active === false) return
    if (!itemNeedsOrder(item)) return

    const identity = resolveOrderGroupIdentity(item, suppliers)
    const line = buildSuggestedOrderLine(item)

    if (line.quantity <= 0) return

    if (!groups.has(identity.groupKey)) {
      groups.set(identity.groupKey, {
        groupKey: identity.groupKey,
        supplier: identity.supplier,
        supplierId: identity.supplierId,
        items: [],
      })
    }

    groups.get(identity.groupKey).items.push(line)
  })

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      totalCost: computeOrderTotalCost(group.items),
    }))
    .sort((a, b) => a.supplier.localeCompare(b.supplier))
}

export function formatStockOrderNumber(orderNumber) {
  const value = Math.max(1, Number(orderNumber) || 1)
  return `#${String(value).padStart(4, '0')}`
}

export function formatStockOrderDate(value) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
  }).format(date)
}

export function formatStockOrderDateTime(value) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatStockOrderDeliveryDate(value) {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function getOrderLineReceivedQuantity(item) {
  return Math.max(0, Number(item?.receivedQuantity ?? item?.received_quantity ?? 0) || 0)
}

export function getOrderLineRemainingQuantity(item) {
  const ordered = Math.max(0, Number(item?.quantity ?? 0) || 0)
  return Math.max(0, ordered - getOrderLineReceivedQuantity(item))
}

export function isOrderLineFullyReceived(item) {
  return getOrderLineRemainingQuantity(item) <= 0
}

export function isOrderFullyReceived(order) {
  const items = order?.items ?? []
  if (items.length === 0) return false
  return items.every((item) => isOrderLineFullyReceived(item))
}

export function isOrderPartiallyReceived(order) {
  const items = order?.items ?? []
  const hasAnyReceived = items.some((item) => getOrderLineReceivedQuantity(item) > 0)
  return hasAnyReceived && !isOrderFullyReceived(order)
}

export function getOrderReceivedSummary(order) {
  const items = order?.items ?? []
  const orderedTotal = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
  const receivedTotal = items.reduce((sum, item) => sum + getOrderLineReceivedQuantity(item), 0)

  return {
    orderedTotal,
    receivedTotal,
    remainingTotal: Math.max(0, orderedTotal - receivedTotal),
  }
}

export function getOrderLineReceiveProgress(item) {
  const ordered = Math.max(0, Number(item?.quantity ?? 0) || 0)
  const received = getOrderLineReceivedQuantity(item)
  const percent = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0

  return { ordered, received, percent }
}

export function buildPendingReceiveLines(order, receiveNowByItemId = {}) {
  return (order?.items ?? [])
    .map((item) => ({
      item,
      receiveNow: Math.max(0, Number(receiveNowByItemId[item.id]) || 0),
    }))
    .filter((entry) => entry.receiveNow > 0)
}

export function willCompleteOrderAfterReceive(order, receiveNowByItemId = {}) {
  const items = order?.items ?? []
  if (items.length === 0) return false

  return items.every((item) => {
    const receiveNow = Math.max(0, Number(receiveNowByItemId[item.id]) || 0)
    const afterReceive = getOrderLineReceivedQuantity(item) + receiveNow
    return afterReceive >= (Number(item.quantity) || 0)
  })
}

export function formatStockOrderLineSummary(item) {
  const quantity = Number(item.quantity) || 0
  const costPrice = Number(item.costPrice) || 0
  const totalPrice = Number(item.totalPrice) || computeOrderLineTotal(quantity, costPrice)

  return {
    headline: `${quantity} x ${formatStockPurchasePrice(costPrice)}`,
    total: formatStockPurchasePrice(totalPrice),
  }
}

export function getStockOrderNextAction(order) {
  const status = normalizeStockOrderStatus(order?.status)

  if (status === 'draft') {
    return {
      label: 'Mark sent',
      hint: 'Review products and send to supplier',
      tone: 'warning',
    }
  }

  if (status === 'sent') {
    if (isOrderPartiallyReceived(order)) {
      return {
        label: 'Continue receiving',
        hint: 'Enter quantities for products still waiting',
        tone: 'info',
      }
    }

    return {
      label: 'Receive delivery',
      hint: 'Enter quantities as the delivery arrives',
      tone: 'info',
    }
  }

  if (status === 'received') {
    return {
      label: 'Completed',
      hint: 'All products received',
      tone: 'success',
    }
  }

  if (status === 'cancelled') {
    return {
      label: 'Cancelled',
      hint: null,
      tone: 'muted',
    }
  }

  return null
}

export function buildStockOrdersOperationsSummary(orders = []) {
  let draftCount = 0
  let awaitingDeliveryCount = 0
  let partialCount = 0

  ;(orders ?? []).forEach((order) => {
    const status = normalizeStockOrderStatus(order.status)

    if (status === 'draft') {
      draftCount += 1
      return
    }

    if (status === 'sent') {
      if (isOrderPartiallyReceived(order)) {
        partialCount += 1
      } else {
        awaitingDeliveryCount += 1
      }
    }
  })

  return {
    draftCount,
    awaitingDeliveryCount,
    partialCount,
    pendingCount: draftCount + awaitingDeliveryCount + partialCount,
  }
}

export function buildStockOrderTimeline(order) {
  const status = normalizeStockOrderStatus(order?.status)
  const partiallyReceived = isOrderPartiallyReceived(order)
  const fullyReceived = status === 'received' || isOrderFullyReceived(order)

  const steps = [
    {
      id: 'created',
      label: 'Created',
      isComplete: Boolean(order?.createdAt),
      timestamp: order?.createdAt ?? null,
      actorName: order?.createdByName ?? null,
    },
    {
      id: 'sent',
      label: 'Sent to supplier',
      isComplete: Boolean(order?.sentAt) || status === 'sent' || status === 'received' || partiallyReceived || fullyReceived,
      timestamp: order?.sentAt ?? null,
      actorName: order?.sentByName ?? null,
    },
  ]

  if (order?.partialReceivedAt || (partiallyReceived && !fullyReceived)) {
    steps.push({
      id: 'partial',
      label: 'Partially received',
      isComplete: Boolean(order?.partialReceivedAt) || partiallyReceived,
      timestamp: order?.partialReceivedAt ?? null,
      actorName: order?.partialReceivedByName ?? null,
    })
  }

  steps.push({
    id: 'completed',
    label: 'Completed',
    isComplete: fullyReceived,
    timestamp: order?.receivedAt ?? null,
    actorName: order?.receivedByName ?? null,
  })

  return steps
}

export function serializeDraftOrderItems(items = []) {
  return (items ?? [])
    .map((item) => {
      const quantity = Math.max(0, Number(item.quantity) || 0)
      const costPrice = Math.max(0, Number(item.costPrice) || 0)

      return {
        stock_item_id: item.stockItemId ?? item.stock_item_id ?? null,
        item_name: `${item.itemName ?? item.item_name ?? ''}`.trim(),
        quantity,
        received_quantity: Math.max(0, Number(item.receivedQuantity ?? item.received_quantity ?? 0) || 0),
        unit: `${item.unit ?? ''}`.trim(),
        cost_price: costPrice,
        total_price: computeOrderLineTotal(quantity, costPrice),
      }
    })
    .filter((item) => item.item_name && item.quantity > 0)
}

export { UNASSIGNED_SUPPLIER }
