import { formatTimestampDayAndTime24 } from './timeFormatUtils'
import { getStockMovementLabel, formatStockQuantity } from './stockUtils'

export function formatStockHistoryTimestamp(value) {
  return formatTimestampDayAndTime24(value)
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
