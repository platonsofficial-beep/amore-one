export const INVENTORY_TARGET_STOCK_LABEL = 'Target Stock (PAR)'

export const INVENTORY_UNIT_PRESETS = [
  'Bottle 0.7L',
  'Bottle 1L',
  'Bottle 1.5L',
  'Case 6',
  'Case 12',
  'Keg',
  'Kg',
  'Gram',
  'Liter',
  'Piece',
  'Box',
  'Bag',
  'Pack',
]

export const INVENTORY_UNIT_CUSTOM_VALUE = '__custom__'

export function isInventoryParConfigured(item) {
  return (Number(item?.minimumQuantity) || 0) > 0
}

export function needsOrder(item) {
  const targetStock = Number(item?.minimumQuantity) || 0
  const currentQuantity = Number(item?.quantity) || 0
  return targetStock > 0 && currentQuantity < targetStock
}

export function getInventoryOrderNeeded(item) {
  if (!needsOrder(item)) return 0

  const currentQuantity = Number(item?.quantity) || 0
  const targetStock = Number(item?.minimumQuantity) || 0
  return targetStock - currentQuantity
}

export function getInventoryEstimatedOrderCost(item) {
  const orderNeeded = getInventoryOrderNeeded(item)
  const unitCost = Number(item?.cost) || 0
  return orderNeeded * unitCost
}

export function getInventoryStockHealthPercent(quantity, minimumQuantity) {
  const targetStock = Number(minimumQuantity) || 0
  const currentQuantity = Number(quantity) || 0
  if (targetStock <= 0) return null
  return Math.min((currentQuantity / targetStock) * 100, 100)
}

export function getInventoryStockHealthTone(healthPercent, status = '') {
  if (healthPercent === null) return 'unset'
  if (status === 'Out of Stock' || healthPercent <= 0) return 'critical'
  if (healthPercent < 100) return 'warning'
  return 'healthy'
}

export function buildInventoryReorderSummary(items = []) {
  const reorderItems = getInventoryReorderItems(items)
  const groups = groupInventoryReorderBySupplier(reorderItems).map((group) => {
    const rows = group.items.map((item) => ({
      item,
      orderNeeded: getInventoryOrderNeeded(item),
      unitCost: Number(item?.cost) || 0,
      estimatedCost: getInventoryEstimatedOrderCost(item),
    }))
    const supplierTotal = rows.reduce((sum, row) => sum + row.estimatedCost, 0)

    return {
      supplier: group.supplier,
      rows,
      supplierTotal,
    }
  })

  const overallTotal = groups.reduce((sum, group) => sum + group.supplierTotal, 0)

  return {
    groups,
    overallTotal,
    reorderCount: reorderItems.length,
  }
}

export function formatInventoryOrderQty(orderNeeded, unit) {
  const qty = Number(orderNeeded) || 0
  const trimmedUnit = `${unit ?? ''}`.trim()
  if (!trimmedUnit) return `Order Qty: ${qty}`
  return `Order Qty: ${qty} x ${trimmedUnit}`
}

export function formatInventoryOrderQtyDetail(orderNeeded, unit) {
  const qty = Number(orderNeeded) || 0
  const trimmedUnit = `${unit ?? ''}`.trim()
  if (!trimmedUnit) return `${qty}`
  return `${qty} x ${trimmedUnit}`
}

export function buildInventoryReorderCopyText(summary) {
  if (!summary?.reorderCount) {
    return 'AMORE ORDER\n\nAll stock is at or above target.'
  }

  const lines = ['AMORE ORDER', '']

  summary.groups.forEach((group) => {
    lines.push('Supplier:')
    lines.push(group.supplier)
    lines.push('')
    lines.push('----------------')
    lines.push('')

    group.rows.forEach((row) => {
      lines.push(row.item?.itemName || 'Unnamed item')
      lines.push(formatInventoryOrderQty(row.orderNeeded, row.item?.unit))
      lines.push(`Current: ${row.item?.quantity ?? 0} / Target: ${row.item?.minimumQuantity ?? 0}`)
      lines.push('')
    })

    lines.push('----------------')
    lines.push('')
  })

  lines.push('Thank you')
  return lines.join('\n')
}

export function getInventoryReorderItems(items = []) {
  return items.filter(needsOrder)
}

export function groupInventoryReorderBySupplier(items = []) {
  const groups = new Map()

  items.forEach((item) => {
    const supplier = `${item?.supplier ?? ''}`.trim() || 'No Supplier'
    if (!groups.has(supplier)) {
      groups.set(supplier, [])
    }
    groups.get(supplier).push(item)
  })

  return Array.from(groups.entries())
    .map(([supplier, supplierItems]) => ({
      supplier,
      items: supplierItems.sort((left, right) => (
        `${left?.itemName ?? ''}`.localeCompare(`${right?.itemName ?? ''}`, undefined, { sensitivity: 'base' })
      )),
    }))
    .sort((left, right) => {
      if (left.supplier === 'No Supplier') return 1
      if (right.supplier === 'No Supplier') return -1
      return left.supplier.localeCompare(right.supplier, undefined, { sensitivity: 'base' })
    })
}

export function getInventoryUnitSelectValue(unit) {
  const trimmed = `${unit ?? ''}`.trim()
  if (!trimmed) return ''
  if (INVENTORY_UNIT_PRESETS.includes(trimmed)) return trimmed
  return INVENTORY_UNIT_CUSTOM_VALUE
}

export function isInventoryUnitPreset(unit) {
  const trimmed = `${unit ?? ''}`.trim()
  return trimmed.length > 0 && INVENTORY_UNIT_PRESETS.includes(trimmed)
}
