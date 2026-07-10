import {
  getConflictingUnitIds,
} from './reservationTableOptions'
import {
  getActiveSeatingsForDate,
  normalizeReservationSeating,
} from './reservationSeatings'
import { isTerminalReservationStatus } from './reservationHostStatus'
import { formatTime24 } from './timeFormatUtils'

export { getConflictingUnitIds } from './reservationTableOptions'

export function reservationBlocksTableAvailability(status) {
  return !isTerminalReservationStatus(status)
}

export function formatTableConflictReason(conflict) {
  if (!conflict) return 'Unavailable'

  const parts = []
  if (conflict.time) {
    parts.push(`Reserved at ${formatTime24(conflict.time)}`)
  }
  if (conflict.guests) {
    parts.push(`${conflict.guests} guest${conflict.guests === 1 ? '' : 's'}`)
  }
  if (conflict.guestName) {
    parts.push(conflict.guestName)
  }

  return parts.join(' · ') || 'Unavailable'
}

export function findReservationForTableSeating(
  reservations,
  table,
  dateKey,
  seating,
  {
    layout = null,
    seatingsById = new Map(),
    excludeReservationId = null,
  } = {},
) {
  const normalizedSeating = normalizeReservationSeating(seating)
  if (!normalizedSeating || !table) return null

  const conflicts = getConflictingUnitIds(reservations, dateKey, normalizedSeating.startTime, {
    seatingId: normalizedSeating.id,
    durationMinutes: normalizedSeating.durationMinutes,
    seatingsById,
    layout,
    excludeReservationId,
  })

  const conflict = conflicts.get(table.id)
  if (!conflict?.reservationId) return null

  return reservations.find((reservation) => (
    String(reservation.id) === String(conflict.reservationId)
  )) ?? null
}

export function buildFloorTableSeatingRows(
  table,
  reservations,
  dateKey,
  seatings = [],
  {
    layout = null,
    seatingsById = null,
  } = {},
) {
  const byId = seatingsById ?? new Map(seatings.map((entry) => [entry.id, entry]))
  const activeSeatings = getActiveSeatingsForDate(seatings, dateKey)

  return activeSeatings.map((seating) => {
    const reservation = findReservationForTableSeating(
      reservations,
      table,
      dateKey,
      seating,
      { layout, seatingsById: byId },
    )

    return {
      seating,
      reservation,
      isAvailable: !reservation,
      timeLabel: formatTime24(seating.startTime),
    }
  })
}

export function resolveSeatingFloorStatus(conflict, reservation) {
  if (!conflict && !reservation) {
    return { floorStatus: 'available', hostIndicator: 'empty' }
  }

  const status = `${reservation?.status ?? conflict?.status ?? ''}`.trim()
  if (['Checked In', 'Walk In', 'Checked In (Partial)'].includes(status)) {
    return { floorStatus: 'seated', hostIndicator: 'seated' }
  }
  if (status === 'Waiting') {
    return { floorStatus: 'arrived', hostIndicator: 'waiting' }
  }

  return { floorStatus: 'upcoming', hostIndicator: 'confirmed' }
}
