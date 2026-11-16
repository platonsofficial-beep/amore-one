import { formatTimestampDayAndTime24 } from './timeFormatUtils'
import { isWasteNote } from './stockWaste'
import { applyStockMovementQuantity } from './stockUtils'
import { formatInventoryUnitLabel } from './inventoryUnitDisplay'
import { t } from '../i18n/i18n'

export function buildStockMovementTimeline(movements = [], currentQuantity = 0) {
  const chronological = [...(movements ?? [])].sort((left, right) => {
    const leftTime = Date.parse(left?.createdAt ?? '') || 0
    const rightTime = Date.parse(right?.createdAt ?? '') || 0
    return leftTime - rightTime
  })

  let running = 0

  const enriched = chronological.map((movement) => {
    const before = running
    const after = applyStockMovementQuantity(before, movement.type, movement.quantity, { allowNegative: true })
    running = after

    return {
      ...movement,
      quantityBefore: before,
      quantityAfter: after,
    }
  })

  if (enriched.length > 0) {
    const newest = enriched[enriched.length - 1]
    const current = Number(currentQuantity)
    if (Number.isFinite(current) && Number(newest.quantityAfter) !== current) {
      newest.quantityAfter = current
    }
  }

  return enriched.reverse()
}

export function buildStockMonthlyInsights(movements = [], now = new Date()) {
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  let received = 0
  let used = 0
  let adjustments = 0

  ;(movements ?? []).forEach((movement) => {
    const createdAt = Date.parse(movement?.createdAt ?? '')
    if (!createdAt || createdAt < startOfMonth.getTime()) return

    const quantity = Number(movement?.quantity)
    if (!Number.isFinite(quantity)) return

    if (movement.type === 'receive') {
      received += Math.abs(quantity)
      return
    }

    if (movement.type === 'usage') {
      used += Math.abs(quantity)
      return
    }

    if (movement.type === 'adjustment') {
      adjustments += quantity
    }
  })

  return { received, used, adjustments }
}

function movementInstant(movement) {
  const createdAt = movement?.createdAt ?? movement?.created_at ?? null
  const parsed = Date.parse(createdAt ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

function movementLocationKeys(movement) {
  return [
    movement?.destinationLocationKey,
    movement?.destination_location_key,
    movement?.sourceLocationKey,
    movement?.source_location_key,
  ].map((value) => `${value ?? ''}`.trim().toLowerCase()).filter(Boolean)
}

/**
 * Last counted is the newest stock_count movement for the item.
 * When a location is shown, a count for that location wins over a newer
 * count stored somewhere else. Falls back to the catalog lastCount.
 */
export function resolveLastCountedRecord(movements = [], fallback = null, { locationKey = '' } = {}) {
  const counts = (movements ?? []).filter((movement) => `${movement?.type ?? ''}` === 'stock_count' && movementInstant(movement) > 0)
  const wantedLocation = `${locationKey ?? ''}`.trim().toLowerCase()
  const located = wantedLocation
    ? counts.filter((movement) => movementLocationKeys(movement).includes(wantedLocation))
    : []
  const pool = located.length > 0 ? located : counts
  const latest = [...pool].sort((left, right) => movementInstant(right) - movementInstant(left))[0]
  if (latest) {
    return { createdAt: latest.createdAt ?? latest.created_at }
  }

  const fallbackAt = fallback?.createdAt ?? fallback?.created_at ?? null
  return fallbackAt ? { createdAt: fallbackAt } : null
}

/** Display copy for formatLastCountedLabel. The raw label stays English for age checks. */
export function translateLastCountedLabel(label) {
  const text = `${label ?? ''}`
  if (text === 'Never') return t('Never')
  if (text === 'Today') return t('Today')
  const oneDay = text === '1 day ago'
  const match = oneDay ? ['', '1'] : /^(\d+) days ago$/.exec(text)
  if (match) return t('{{count}} days ago', { count: Number(match[1]) })
  return text
}

export function formatLastCountedLabel(lastCount, now = new Date()) {
  const createdAt = lastCount?.createdAt ?? lastCount?.created_at
  if (!createdAt) return 'Never'

  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return 'Never'

  const days = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000))
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export function getStockMovementTone(type) {
  if (type === 'receive') return 'receive'
  if (type === 'usage') return 'usage'
  if (type === 'adjustment') return 'adjustment'
  if (type === 'stock_count') return 'count'
  return 'neutral'
}

function formatQuantityTransition(before, after, unit = '') {
  return `${formatQuantityWithUnit(before, unit)} → ${formatQuantityWithUnit(after, unit)}`
}

function readQuantityTransition(movement, unit = '') {
  const before = Number(movement?.quantityBefore)
  const after = Number(movement?.quantityAfter)
  if (!Number.isFinite(before) || !Number.isFinite(after)) return ''
  return formatQuantityTransition(before, after, unit)
}

export function formatStockMovementHeadline(movement, unit = '') {
  const quantity = Number(movement?.quantity)
  if (!Number.isFinite(quantity)) return ''

  if (movement.type === 'stock_count') {
    const before = Number(movement?.quantityBefore)
    const after = Number(movement?.quantityAfter)
    if (Number.isFinite(before) && Number.isFinite(after) && before === 0) {
      return t('Opening count {{amount}}', { amount: formatQuantityWithUnit(after, unit) })
    }
    const transition = readQuantityTransition(movement, unit)
    if (transition) return t('Count {{amount}}', { amount: transition })
    return t('Counted {{amount}}', { amount: formatQuantityWithUnit(Math.abs(quantity), unit) })
  }

  if (movement.type === 'adjustment') {
    const transition = readQuantityTransition(movement, unit)
    if (transition) return t('Adjustment {{amount}}', { amount: transition })
  }

  if (movement.type === 'receive') {
    return `+${formatQuantityWithUnit(Math.abs(quantity), unit)}`
  }

  if (movement.type === 'usage' && isWasteNote(movement.note)) {
    return t('Waste −{{amount}}', { amount: formatQuantityWithUnit(Math.abs(quantity), unit) })
  }

  if (movement.type === 'usage') {
    return `-${formatQuantityWithUnit(Math.abs(quantity), unit)}`
  }

  const sign = quantity >= 0 ? '+' : '-'
  return `${sign}${formatQuantityWithUnit(Math.abs(quantity), unit)}`
}

export function formatStockMovementTypeLabel(type, note = '') {
  if (type === 'usage' && isWasteNote(note)) return t('Waste')
  if (type === 'receive') return t('Receive')
  if (type === 'usage') return t('Usage')
  if (type === 'adjustment') return t('Adjustment')
  if (type === 'stock_count') return t("Stock count")
  return t('Update')
}

const KNOWN_MOVEMENT_NOTES = new Set(['Shelf count'])

export function translateStockMovementNote(note) {
  const text = `${note ?? ''}`.trim()
  if (!text || !KNOWN_MOVEMENT_NOTES.has(text)) return text
  return t(text)
}

function formatQuantityWithUnit(value, unit = '') {
  const quantity = Number(value)
  const formatted = Number.isFinite(quantity)
    ? (Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.?0+$/, ''))
    : '0'
  const normalizedUnit = `${unit ?? ''}`.trim()
  const label = normalizedUnit ? (formatInventoryUnitLabel(normalizedUnit) || normalizedUnit) : ''
  return label ? `${formatted} ${label}` : formatted
}

export function formatStockProductHistoryTimestamp(value, timeZone = '') {
  return formatTimestampDayAndTime24(value, '', timeZone)
}

export function formatMonthlyMovementStat(type, value, unit = '') {
  const quantity = Number(value)
  const isZero = !Number.isFinite(quantity) || quantity === 0

  if (type === 'received' && isZero) return t("No receives")
  if (type === 'used' && isZero) return t("No usage")
  if (type === 'adjustments' && isZero) return t("No adjustments")

  return formatQuantityWithUnit(quantity, unit)
}
