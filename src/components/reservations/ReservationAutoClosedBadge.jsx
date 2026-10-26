import { AUTO_CLOSED_BADGE_LABEL, isAutoClosedReservation } from '../../lib/reservationAutoClose'

export function ReservationAutoClosedBadge({
  reservation,
  canUndo = false,
  onUndo,
  isSaving = false,
}) {
  if (!isAutoClosedReservation(reservation)) return null

  const guestName = `${reservation?.guestName ?? 'Guest'}`.trim() || 'Guest'

  return (
    <span className="reservation-auto-closed">
      <span className="reservation-auto-closed-badge">{AUTO_CLOSED_BADGE_LABEL}</span>
      {canUndo ? (
        <button
          type="button"
          className="reservation-auto-closed-undo"
          disabled={isSaving}
          onClick={(event) => {
            event.stopPropagation()
            onUndo?.(reservation)
          }}
        >
          Undo
        </button>
      ) : null}
      <span className="sr-only">Auto-closed reservation for {guestName}</span>
    </span>
  )
}
