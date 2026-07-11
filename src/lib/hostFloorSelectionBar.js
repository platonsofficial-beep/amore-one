import {
  buildHostQueueRowPresentation,
  HOST_QUEUE_META_SEPARATOR,
} from './hostQueuePipeline'
import { resolveReservationSeatingId } from './reservationSeatings'

export function resolveHostFloorSelectionSeatingLabel(
  reservation,
  seatings = [],
  dateKey = '',
) {
  const seatingId = resolveReservationSeatingId(reservation, seatings, dateKey)
  if (!seatingId) return ''

  const seating = seatings.find((entry) => String(entry.id) === String(seatingId))
  return `${seating?.name ?? ''}`.trim()
}

export function buildHostFloorSelectionMetaLine(
  reservation,
  {
    floorLayout = null,
    seatings = [],
    dateKey = '',
  } = {},
) {
  const rowPresentation = buildHostQueueRowPresentation(reservation, floorLayout)
  const seatingLabel = resolveHostFloorSelectionSeatingLabel(
    reservation,
    seatings,
    dateKey,
  )

  const metaParts = [rowPresentation.metaLine]
  if (seatingLabel) {
    metaParts.push(`🍷 ${seatingLabel}`)
  }

  return {
    metaLine: metaParts.join(HOST_QUEUE_META_SEPARATOR),
    metaAriaLabel: [
      rowPresentation.metaAriaLabel,
      seatingLabel ? `seating ${seatingLabel}` : '',
    ].filter(Boolean).join(', '),
  }
}
