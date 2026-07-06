import { getStockMovementLabel, formatStockQuantity } from './stockUtils'

export function formatStockHistoryTimestamp(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const day = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(date)
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  return `${day} ${time}`
}

export function formatStockMovementQuantityLine(movement, unit = '') {
  if (!movement?.type) return ''

  const quantity = Number(movement.quantity)
  if (!Number.isFinite(quantity)) return ''

  if (movement.type === 'stock_count') {
    return formatStockQuantity(quantity, unit)
  }

  if (movement.type === 'receive') {
    return `+${formatStockQuantity(Math.abs(quantity), unit)}`
  }

  if (movement.type === 'usage') {
    return `-${formatStockQuantity(Math.abs(quantity), unit)}`
  }

  const sign = quantity >= 0 ? '+' : '-'
  return `${sign}${formatStockQuantity(Math.abs(quantity), unit)}`
}

export function formatStockMovementHistoryType(type) {
  return getStockMovementLabel(type)
}
