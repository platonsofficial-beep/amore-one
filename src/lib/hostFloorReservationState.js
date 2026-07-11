import { buildReservationUpdatePayload } from '../services/reservationService'

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
  return {
    ...reservation,
    ...payload,
    status: payload.status,
    seatingAssignment: payload.seatingAssignment,
    tableNumber: payload.tableNumber,
    notes: payload.notes,
  }
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
