import {
  getHostFloorSelectionStatusPresentation,
  getHostStatusMeta,
  getReservationDisplayStatus,
} from '../../../lib/reservationHostStatus'
import { formatHostReservationListTime } from '../../../lib/timeFormatUtils'
import { buildHostFloorSelectionMetaLine } from '../../../lib/hostFloorSelectionBar'

export function MobileReservationsHostRightPane({
  hasLayout = false,
  floorPlanContent = null,
  selectedReservation = null,
  todayKey = '',
  nowMinutes = 0,
  canEditFloorPlan = false,
  onEditReservation,
  onOpenFloorPlanLayout,
  onOpenRowMenu = null,
  isAssignmentMode = false,
  floorLayout = null,
  reservationSeatings = [],
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
    <div
      className={`mobile-host-reservations-right-pane${isAssignmentMode ? ' is-assignment-mode' : ''}`}
      data-assignment-mode={isAssignmentMode ? 'true' : 'false'}
    >
      <div className="mobile-host-floor-stage" aria-label="Floor plan">
        {floorPlanContent}
      </div>

      {selectedReservation && !isAssignmentMode ? (
        <MobileHostFloorSelectionCard
          key={selectedReservation.id}
          reservation={selectedReservation}
          todayKey={todayKey}
          nowMinutes={nowMinutes}
          floorLayout={floorLayout}
          reservationSeatings={reservationSeatings}
          onEdit={onEditReservation}
          onOpenRowMenu={onOpenRowMenu}
        />
      ) : null}
    </div>
  )
}

export function MobileHostFloorSelectionCard({
  reservation,
  todayKey,
  nowMinutes,
  floorLayout = null,
  reservationSeatings = [],
  onEdit,
  onOpenRowMenu = null,
}) {
  const guestName = `${reservation?.guestName ?? 'Guest'}`.trim() || 'Guest'
  const timeLabel = formatHostReservationListTime(reservation, todayKey)
  const metaPresentation = buildHostFloorSelectionMetaLine(reservation, {
    floorLayout,
    seatings: reservationSeatings,
    dateKey: todayKey,
  })
  const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)
  const statusMeta = getHostStatusMeta(displayStatus)
  const statusPresentation = getHostFloorSelectionStatusPresentation(
    reservation,
    nowMinutes,
    todayKey,
  )
  const statusLabel = `${statusPresentation.icon} ${statusPresentation.label}`.trim()

  return (
    <div className="mobile-host-floor-selection" data-testid="host-floor-selection-summary">
      <article className="mobile-host-floor-selection-card">
        <div className="mobile-host-floor-selection-left">
          <p className="mobile-host-floor-selection-time">{timeLabel}</p>
          <h3 className="mobile-host-floor-selection-guest">{guestName}</h3>
          <p
            className="mobile-host-floor-selection-meta"
            aria-label={metaPresentation.metaAriaLabel}
          >
            {metaPresentation.metaLine}
          </p>
        </div>

        <div className="mobile-host-floor-selection-center">
          <span
            className={`host-reservation-card-status-pill mobile-host-floor-selection-status tone-${statusMeta.tone} is-compact is-readonly${statusPresentation.severity ? ` is-late-${statusPresentation.severity}` : ''}`}
            aria-label={`Status: ${statusMeta.label}`}
          >
            {statusLabel}
          </span>
        </div>

        <div className="mobile-host-floor-selection-actions">
          <button
            type="button"
            className="mobile-host-floor-selection-edit-btn"
            onClick={() => onEdit?.(reservation)}
          >
            <span className="mobile-host-floor-selection-action-icon" aria-hidden="true">✏️</span>
            <span>Edit</span>
          </button>
          {onOpenRowMenu ? (
            <button
              type="button"
              className="mobile-host-floor-selection-menu-btn"
              aria-label="More reservation actions"
              aria-haspopup="menu"
              onClick={(event) => onOpenRowMenu(reservation, event)}
            >
              ⋯
            </button>
          ) : null}
        </div>
      </article>
    </div>
  )
}
