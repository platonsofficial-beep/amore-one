import { buildReservationUpdatePayload } from '../services/reservationService'

export function normalizeCanonicalReservation(reservation) {
  if (!reservation?.id) return reservation ?? null

  const seatingId = reservation.seatingId ?? reservation.seating_id ?? null
  const { seating_id: _legacySeatingId, ...rest } = reservation

  return {
    ...rest,
    seatingId,
  }
}

export function replaceReservationInCollection(current = [], reservation) {
  const normalized = normalizeCanonicalReservation(reservation)
  if (!normalized?.id) return current

  const reservationId = `${normalized.id}`
  const existingIndex = current.findIndex((entry) => `${entry.id}` === reservationId)
  if (existingIndex === -1) {
    return [...current, normalized]
  }

  const next = [...current]
  next[existingIndex] = normalized
  return next
}

export function getHostFloorReservationRevision(reservations = []) {
  return reservations.map((reservation) => [
    reservation.id,
    reservation.status,
    reservation.seatingId ?? reservation.seating_id ?? '',
    reservation.tableNumber ?? reservation.table_number ?? '',
    reservation.time ?? '',
    reservation.guests ?? '',
    (reservation.seatingAssignment?.assignedUnits ?? [])
      .map((unit) => unit.id)
      .join('+'),
  ].join(':')).join('|')
}

export function resolveHostFloorReservationRecord(reservation, reservations = []) {
  if (!reservation?.id) return reservation ?? null
  return reservations.find((entry) => String(entry.id) === String(reservation.id)) ?? reservation
}

export function hostFloorReservationVisualStateChanged(left, right) {
  if (!left || !right) return left !== right
  if (String(left.id) !== String(right.id)) return true

  return getHostFloorReservationRevision([left]) !== getHostFloorReservationRevision([right])
}

export function mergeOptimisticReservationUpdate(reservation, patch) {
  const payload = buildReservationUpdatePayload(reservation, patch)
  return normalizeCanonicalReservation({
    ...reservation,
    ...payload,
    status: payload.status,
    seatingAssignment: payload.seatingAssignment,
    tableNumber: payload.tableNumber,
    notes: payload.notes,
    seatingId: payload.seatingId,
  })
}

export function syncHostWorkspaceReservationSelection(
  selectedReservation,
  reservations = [],
) {
  if (!selectedReservation?.id) return selectedReservation ?? null
  const fresh = resolveHostFloorReservationRecord(selectedReservation, reservations)
  if (!fresh || !hostFloorReservationVisualStateChanged(selectedReservation, fresh)) {
    return selectedReservation
  }
  return fresh
}
