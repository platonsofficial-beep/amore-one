import { formatTime24 } from './timeFormatUtils'
import { resolveHostFloorSemanticClass } from './hostFloorTableVisualState'

export const HOST_FLOOR_CONTENT_TIERS = {
  VERY_SMALL: 'very-small',
  SMALL: 'small',
  NORMAL: 'normal',
}

const OCCUPIED_SEMANTIC_CLASSES = new Set(['is-seated', 'is-arrived', 'is-reserved'])
const HOST_FLOOR_STATUS_BADGE_WORDS = [
  'RESERVED',
  'SEATED',
  'AVAILABLE',
  'IN HOUSE',
  'OCCUPIED',
  'CONFIRMED',
]

export function formatHostFloorTableLabel(table) {
  const raw = `${table?.displayLabel ?? table?.label ?? ''}`.trim()
  if (!raw) return 'T?'
  if (/^T\d+/i.test(raw)) return raw.toUpperCase()
  if (/^table\s+/i.test(raw)) return raw.replace(/^table\s+/i, 'T').toUpperCase()
  if (/^\d+$/.test(raw)) return `T${raw}`
  return raw.toUpperCase()
}

export function resolveHostFloorTableContentTier(table) {
  const width = Number(table?.widthPercent) || 12
  const height = Number(table?.heightPercent ?? table?.widthPercent) || width
  const minDimension = Math.min(width, height)

  if (minDimension < 7) return HOST_FLOOR_CONTENT_TIERS.VERY_SMALL
  if (minDimension < 10) return HOST_FLOOR_CONTENT_TIERS.SMALL
  return HOST_FLOOR_CONTENT_TIERS.NORMAL
}

export function formatHostFloorCompactGuestIndicator(guestCount) {
  const count = Math.max(0, Number(guestCount) || 0)
  if (count <= 0) return ''
  return `👤${count}`
}

export function formatHostFloorCompactPartyLabel(guestCount) {
  return formatHostFloorCompactGuestIndicator(guestCount)
}

export function formatHostFloorCompactCapacityLabel(table) {
  const maxGuests = Math.max(
    0,
    Number(table?.maxGuestCapacity ?? table?.maxGuests ?? table?.seatedCapacity ?? table?.seats) || 0,
  )

  return formatHostFloorCompactGuestIndicator(maxGuests)
}

export function parseHostFloorGuestIndicator(label) {
  const match = `${label ?? ''}`.match(/^👤(\d+)$/)
  return match ? Number(match[1]) : null
}

export function buildHostFloorCompactTableContent({
  table,
  operational,
  displayReservation = null,
  semanticClass = null,
}) {
  const resolvedSemanticClass = semanticClass
    ?? resolveHostFloorSemanticClass(operational, {
      hasSeatingConflict: operational?.hasSeatingConflict,
    })
  const tier = resolveHostFloorTableContentTier(table)
  const tableLabel = formatHostFloorTableLabel(table)
  const reservation = displayReservation ?? operational?.displayReservation ?? null
  const isOccupied = OCCUPIED_SEMANTIC_CLASSES.has(resolvedSemanticClass) && reservation

  if (!isOccupied) {
    return {
      mode: 'available',
      tier,
      semanticClass: resolvedSemanticClass,
      tableLabel,
      timeLabel: null,
      partyLabel: formatHostFloorCompactCapacityLabel(table),
      showChairDots: tier === HOST_FLOOR_CONTENT_TIERS.NORMAL,
      statusBadgeText: null,
    }
  }

  const guestCount = Number(reservation.guests) || 0
  const timeLabel = formatTime24(reservation.time) || null

  return {
    mode: 'occupied',
    tier,
    semanticClass: resolvedSemanticClass,
    tableLabel,
    timeLabel,
    partyLabel: formatHostFloorCompactPartyLabel(guestCount),
    showChairDots: false,
    statusBadgeText: null,
  }
}

export function hostFloorCompactContentIncludesStatusWords(content) {
  if (!content) return false

  const values = [
    content.statusBadgeText,
    content.tableLabel,
    content.timeLabel,
    content.partyLabel,
  ].filter(Boolean)

  return values.some((value) => (
    HOST_FLOOR_STATUS_BADGE_WORDS.includes(`${value}`.trim().toUpperCase())
  ))
}

export function buildHostFloorCompactAriaLabel(content) {
  if (!content) return 'Table'

  const guestCount = parseHostFloorGuestIndicator(content.partyLabel)

  if (content.mode === 'occupied') {
    const parts = [content.tableLabel]
    if (content.timeLabel) parts.push(content.timeLabel)
    if (guestCount !== null) parts.push(`${guestCount} guests`)
    return parts.join(', ')
  }

  const parts = [content.tableLabel, 'available']
  if (guestCount !== null) parts.push(`${guestCount} seats`)
  else if (content.partyLabel) parts.push(content.partyLabel)
  return parts.join(', ')
}
