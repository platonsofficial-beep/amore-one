import {
  formatHostListTableLabel,
} from '../../../lib/seatingAssignment'
import {
  getHostStatusMeta,
  getReservationDisplayStatus,
} from '../../../lib/reservationHostStatus'
import { formatHostReservationListTime } from '../../../lib/timeFormatUtils'

export function MobileReservationsHostRightPane({
  hasLayout = false,
  floorPlanContent = null,
  selectedReservation = null,
  todayKey = '',
  nowMinutes = 0,
  canEditFloorPlan = false,
  onEditReservation,
  onOpenFloorPlanLayout,
}) {
  if (!hasLayout) {
    return (
      <div className="mobile-host-reservations-right-pane">
        <div className="mobile-host-floor-empty" role="status">
          <p className="mobile-host-floor-empty-eyebrow">Floor plan</p>
          <h2>No published layout</h2>
          <p>Publish a floor plan to seat guests and view table status here.</p>
          {canEditFloorPlan ? (
            <button
              type="button"
              className="mobile-host-layout-btn mobile-host-floor-empty-action"
              onClick={onOpenFloorPlanLayout}
            >
              Open layout editor
            </button>
          ) : (
            <p className="mobile-host-floor-empty-hint">
              Ask a manager to publish the floor plan before seating guests.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mobile-host-reservations-right-pane">
      <div className="mobile-host-floor-stage" aria-label="Floor plan">
        {floorPlanContent}
      </div>

      {selectedReservation ? (
        <div className="mobile-host-floor-selection">
          <MobileHostFloorSelectionCard
            reservation={selectedReservation}
            todayKey={todayKey}
            nowMinutes={nowMinutes}
            onEdit={onEditReservation}
          />
        </div>
      ) : null}
    </div>
  )
}

function MobileHostFloorSelectionCard({
  reservation,
  todayKey,
  nowMinutes,
  onEdit,
}) {
  const guestName = `${reservation?.guestName ?? 'Guest'}`.trim() || 'Guest'
  const partySize = Number(reservation?.guests) || 0
  const tableLabel = formatHostListTableLabel(reservation)
  const timeLabel = formatHostReservationListTime(reservation, todayKey)
  const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)
  const statusMeta = getHostStatusMeta(displayStatus)

  return (
    <article className="mobile-host-floor-selection-card">
      <div className="mobile-host-floor-selection-main">
        <p className="mobile-host-floor-selection-time">{timeLabel}</p>
        <div className="mobile-host-floor-selection-copy">
          <h3>{guestName}</h3>
          <p>
            {partySize} {partySize === 1 ? 'guest' : 'guests'}
            {tableLabel !== '—' ? ` · ${tableLabel}` : ''}
          </p>
        </div>
        <span className={`mobile-host-reservation-status tone-${statusMeta.tone}`}>
          {statusMeta.label}
        </span>
      </div>
      <button
        type="button"
        className="mobile-host-floor-selection-edit-btn"
        onClick={() => onEdit?.(reservation)}
      >
        Edit
      </button>
    </article>
  )
}
