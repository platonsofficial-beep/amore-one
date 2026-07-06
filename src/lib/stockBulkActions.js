import {
  getStockTypeOptionsForCategory,
  normalizeStockCategory,
  resolveStockItemType,
  resolveStockStorageLocation,
} from './stockCatalog'
import { getStockStatusShortLabel } from './stockUtils'

export function buildStockItemUpdatePayload(item, changes = {}) {
  const category = normalizeStockCategory(changes.category ?? item.category)
  let itemType = changes.itemType ?? resolveStockItemType(item)

  if (changes.category && !changes.itemType) {
    const typeOptions = getStockTypeOptionsForCategory(category)
    if (!typeOptions.includes(itemType)) {
      itemType = typeOptions[0] ?? 'Other'
    }
  }

  return {
    name: item.name,
    category,
    itemType,
    supplier: `${changes.supplier ?? item.supplier ?? ''}`.trim(),
    storageLocation: `${changes.storageLocation ?? resolveStockStorageLocation(item)}`.trim() || 'Main Storage',
    unit: item.unit,
    currentQuantity: item.currentQuantity,
    minimumQuantity: item.minimumQuantity,
    targetQuantity: item.targetQuantity,
    orderQuantity: item.orderQuantity,
    costPrice: item.costPrice,
  }
}

function escapeCsvValue(value) {
  const text = `${value ?? ''}`
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function exportStockItemsToCsv(items = []) {
  const headers = [
    'Name',
    'Category',
    'Type',
    'Supplier',
    'Location',
    'Unit',
    'On hand',
    'Minimum',
    'Target',
    'Cost',
    'Status',
  ]

  const rows = items.map((item) => [
    item.name,
    item.category,
    resolveStockItemType(item),
    item.supplier,
    resolveStockStorageLocation(item),
    item.unit,
    item.currentQuantity,
    item.minimumQuantity,
    item.targetQuantity ?? '',
    item.costPrice,
    getStockStatusShortLabel(item.status),
  ])

  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `stock-export-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function getBulkTypeOptionsForItems(items = []) {
  const options = new Set()

  items.forEach((item) => {
    getStockTypeOptionsForCategory(item.category).forEach((type) => options.add(type))
  })

  return Array.from(options).sort((left, right) => left.localeCompare(right))
}
