import { formatStockCategoryTypeLine } from './stockCatalog'
import { computeOrderTotalCost, formatStockOrderDate, normalizeStockOrderStatus } from './stockOrderUtils'
import { formatStockPurchasePrice, formatStockQuantity } from './stockUtils'

export function normalizeSupplierName(name) {
  return `${name ?? ''}`.trim()
}

export function supplierNameMatches(left, right) {
  const normalizedLeft = normalizeSupplierName(left)
  const normalizedRight = normalizeSupplierName(right)
  if (!normalizedLeft || !normalizedRight) return false
  return normalizedLeft === normalizedRight
}

export function isSupplierActive(supplier) {
  return supplier?.active !== false
}

export function getStockItemsForSupplier(stockItems = [], companyName = '') {
  return (stockItems ?? []).filter((item) => supplierNameMatches(companyName, item.supplier))
}

export function getStockOrdersForSupplier(stockOrders = [], companyName = '') {
  return (stockOrders ?? []).filter((order) => supplierNameMatches(companyName, order.supplier))
}

export function countInventoryItemsForSupplier(inventoryItems = [], companyName = '') {
  return (inventoryItems ?? []).filter((item) => supplierNameMatches(companyName, item.supplier)).length
}

export function isOpenStockOrder(order) {
  const status = normalizeStockOrderStatus(order?.status)
  return status === 'draft' || status === 'sent'
}

function getOrderTimestamp(order, field = 'createdAt') {
  const value = order?.[field]
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

export function getOrderTotalValue(order) {
  return Number(order?.totalCost) || computeOrderTotalCost(order?.items ?? [])
}

export function buildSupplierMetrics(supplier, stockItems = [], stockOrders = []) {
  const linkedItems = getStockItemsForSupplier(stockItems, supplier?.companyName)
  const linkedOrders = getStockOrdersForSupplier(stockOrders, supplier?.companyName)
  const openOrders = linkedOrders.filter(isOpenStockOrder)
  const receivedOrders = linkedOrders.filter(
    (order) => normalizeStockOrderStatus(order.status) === 'received',
  )

  const totalSpend = receivedOrders.reduce((sum, order) => sum + getOrderTotalValue(order), 0)
  const lastOrderDate = linkedOrders.reduce(
    (latest, order) => Math.max(latest, getOrderTimestamp(order, 'createdAt')),
    0,
  )
  const lastDelivery = receivedOrders.reduce(
    (latest, order) => Math.max(
      latest,
      getOrderTimestamp(order, 'receivedAt')
        || getOrderTimestamp(order, 'updatedAt')
        || getOrderTimestamp(order, 'createdAt'),
    ),
    0,
  )

  return {
    productsCount: linkedItems.length,
    openOrdersCount: openOrders.length,
    totalOrders: linkedOrders.length,
    totalSpend,
    averageOrderValue: receivedOrders.length > 0 ? totalSpend / receivedOrders.length : 0,
    lastOrderDate: lastOrderDate || null,
    lastDelivery: lastDelivery || null,
    linkedItems,
    linkedOrders: [...linkedOrders].sort(
      (left, right) => getOrderTimestamp(right, 'createdAt') - getOrderTimestamp(left, 'createdAt'),
    ),
    openOrders,
    receivedOrders,
  }
}

export function buildSuppliersDashboardSummary(suppliers = [], stockItems = [], stockOrders = []) {
  const activeSuppliers = suppliers.filter(isSupplierActive).length
  const linkedProductIds = new Set()

  suppliers.forEach((supplier) => {
    getStockItemsForSupplier(stockItems, supplier.companyName).forEach((item) => {
      if (item?.id != null) linkedProductIds.add(item.id)
    })
  })

  const nonCancelledOrders = (stockOrders ?? []).filter(
    (order) => normalizeStockOrderStatus(order.status) !== 'cancelled',
  )
  const receivedOrders = nonCancelledOrders.filter(
    (order) => normalizeStockOrderStatus(order.status) === 'received',
  )
  const pendingOrders = nonCancelledOrders.filter(isOpenStockOrder)

  const totalPurchaseValue = receivedOrders.reduce((sum, order) => sum + getOrderTotalValue(order), 0)

  return {
    totalSuppliers: suppliers.length,
    activeSuppliers,
    totalProductsSupplied: linkedProductIds.size,
    totalPurchaseValue,
    pendingOrders: pendingOrders.length,
  }
}

export function supplierHasHistory(supplier, {
  stockItems = [],
  stockOrders = [],
  inventoryItems = [],
} = {}) {
  const metrics = buildSupplierMetrics(supplier, stockItems, stockOrders)
  const inventoryCount = countInventoryItemsForSupplier(inventoryItems, supplier?.companyName)

  return metrics.productsCount > 0 || metrics.totalOrders > 0 || inventoryCount > 0
}

export function formatSupplierStatusLabel(supplier) {
  return isSupplierActive(supplier) ? 'Active' : 'Inactive'
}

export function getSupplierStatusTone(supplier) {
  return isSupplierActive(supplier) ? 'success' : 'muted'
}

export function formatSupplierMetricDate(value) {
  return formatStockOrderDate(value)
}

export function formatSupplierProductLine(item) {
  return {
    id: item.id,
    name: item.name ?? 'Unnamed product',
    categoryType: formatStockCategoryTypeLine(item.category, item.itemType),
    currentStock: formatStockQuantity(item.currentQuantity, item.unit),
    lastPurchasePrice: formatStockPurchasePrice(item.costPrice),
  }
}

export function buildSupplierSearchHaystack(supplier, stockItems = []) {
  const linkedItems = getStockItemsForSupplier(stockItems, supplier?.companyName)
  const productNames = linkedItems.map((item) => item.name ?? '').join(' ')

  return [
    supplier?.companyName ?? '',
    supplier?.contactPerson ?? '',
    supplier?.phone ?? '',
    supplier?.email ?? '',
    supplier?.address ?? '',
    productNames,
  ].join(' ').toLowerCase()
}

export function getSupplierInitials(name = '') {
  const parts = `${name}`.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'S'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

export function buildStockItemSupplierOptions(suppliers = [], selectedSupplier = '') {
  const trimmedSelected = normalizeSupplierName(selectedSupplier)
  const activeNameSet = new Set()
  const supplierByName = new Map()

  ;(suppliers ?? []).forEach((supplier) => {
    const name = normalizeSupplierName(supplier.companyName)
    if (!name) return
    supplierByName.set(name, supplier)
    if (isSupplierActive(supplier)) {
      activeNameSet.add(name)
    }
  })

  const options = [{ value: '', label: 'No supplier', disabled: false }]

  if (trimmedSelected && !activeNameSet.has(trimmedSelected)) {
    const matchedSupplier = supplierByName.get(trimmedSelected)
    if (matchedSupplier && !isSupplierActive(matchedSupplier)) {
      options.push({
        value: trimmedSelected,
        label: `${trimmedSelected} (Inactive)`,
        disabled: true,
      })
    } else if (!matchedSupplier) {
      options.push({
        value: trimmedSelected,
        label: `${trimmedSelected} (Not in directory)`,
        disabled: true,
      })
    }
  }

  ;(suppliers ?? [])
    .filter(isSupplierActive)
    .sort((left, right) => (
      `${left.companyName ?? ''}`.localeCompare(`${right.companyName ?? ''}`, undefined, {
        sensitivity: 'base',
      })
    ))
    .forEach((supplier) => {
      const name = normalizeSupplierName(supplier.companyName)
      if (!name || options.some((option) => option.value === name)) return
      options.push({ value: name, label: name, disabled: false })
    })

  return options
}
