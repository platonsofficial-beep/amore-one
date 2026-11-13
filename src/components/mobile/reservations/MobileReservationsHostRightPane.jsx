import { HostTableInspector } from '../../floor/HostTableInspector'
import { shouldCompactHostFloorSelectionCard } from '../../../lib/hostTableInspectorUtils'
import {
  getHostFloorSelectionStatusPresentation,
  getHostStatusMeta,
  getReservationDisplayStatus,
} from '../../../lib/reservationHostStatus'
import { formatHostReservationListTime } from '../../../lib/timeFormatUtils'
import { buildHostFloorSelectionMetaLine } from '../../../lib/hostFloorSelectionBar'
import { t } from '../../../i18n/i18n'

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
  onCloseSelection = null,
  isAssignmentMode = false,
  floorLayout = null,
  reservationSeatings = [],
  tableInspectorProps = null,
  layoutStatus = hasLayout ? 'floor' : 'empty',
  layoutMessage = '',
  onRetryLayout = null,
}) {
  if (layoutStatus === 'loading') {
    return (
      <div className="mobile-host-reservations-right-pane">
        <div className="mobile-host-floor-refreshing" role="status">
          <p>{layoutMessage || t("Loading published layout…")}</p>
        </div>
      </div>
    )
  }

  if (layoutStatus === 'error') {
    return (
      <div className="mobile-host-reservations-right-pane">
        <div className="host-station-error-boundary" role="alert">
          <h3>{layoutMessage || "Couldn't load"}</h3>
          <p>{t("The floor plan did not load. This is not an empty layout.")}</p>
          {typeof onRetryLayout === 'function' ? (
            <div className="host-station-error-actions">
              <button type="button" className="host-station-error-retry" onClick={onRetryLayout}>
                {t("Retry")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  if (!hasLayout || layoutStatus === 'empty') {
    return (
      <div className="mobile-host-reservations-right-pane">
        <div className="mobile-host-floor-empty" role="status">
          <p className="mobile-host-floor-empty-eyebrow">{t("Floor plan")}</p>
          <h2>{t("No published layout")}</h2>
          <p>{t("Publish a floor plan to seat guests and view table status here.")}</p>
          {canEditFloorPlan ? (
            <button
              type="button"
              className="mobile-host-layout-btn mobile-host-floor-empty-action"
              onClick={onOpenFloorPlanLayout}
            >
              {t("Open layout editor")}
            </button>
          ) : (
            <p className="mobile-host-floor-empty-hint">
              {t("Ask a manager to publish the floor plan before seating guests.")}
            </p>
          )}
        </div>
      </div>
    )
  }

  const inspectorOpen = Boolean(tableInspectorProps?.isOpen)
  const compactBottomCard = shouldCompactHostFloorSelectionCard({
    inspectorOpen,
    selectedReservation,
    inspectorRows: tableInspectorProps?.rows ?? [],
  })

  return (
    <div
      className={`mobile-host-reservations-right-pane${isAssignmentMode ? ' is-assignment-mode' : ''}${inspectorOpen ? ' has-table-inspector' : ''}`}
      data-assignment-mode={isAssignmentMode ? 'true' : 'false'}
      data-table-inspector-open={inspectorOpen ? 'true' : 'false'}
    >
      <div className="mobile-host-floor-stage" aria-label={t("Floor plan")}>
        {floorPlanContent}
      </div>

      {selectedReservation && !isAssignmentMode && !compactBottomCard ? (
        <MobileHostFloorSelectionCard
          key={selectedReservation.id}
          reservation={selectedReservation}
          todayKey={todayKey}
          nowMinutes={nowMinutes}
          floorLayout={floorLayout}
          reservationSeatings={reservationSeatings}
          onEdit={onEditReservation}
          onOpenRowMenu={onOpenRowMenu}
          onClose={onCloseSelection}
        />
      ) : null}

      {selectedReservation && !isAssignmentMode && compactBottomCard ? (
        <MobileHostFloorSelectionCompactStrip
          reservation={selectedReservation}
          todayKey={todayKey}
          nowMinutes={nowMinutes}
          onEdit={onEditReservation}
          onOpenRowMenu={onOpenRowMenu}
          onClose={onCloseSelection}
        />
      ) : null}

      {inspectorOpen ? (
        <HostTableInspector {...tableInspectorProps} />
      ) : null}
    </div>
  )
}

function MobileHostFloorSelectionCompactStrip({
  reservation,
  todayKey,
  nowMinutes,
  onEdit,
  onOpenRowMenu = null,
  onClose = null,
}) {
  const guestName = `${reservation?.guestName ?? 'Guest'}`.trim() || 'Guest'
  const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)
  const statusMeta = getHostStatusMeta(displayStatus)
  const statusPresentation = getHostFloorSelectionStatusPresentation(
    reservation,
    nowMinutes,
    todayKey,
  )

  return (
    <div className="mobile-host-floor-selection is-compact-context" data-testid="host-floor-selection-compact">
      <article className="mobile-host-floor-selection-card is-compact-context">
        <div className="mobile-host-floor-selection-left">
          <h3 className="mobile-host-floor-selection-guest">{guestName}</h3>
          <p className="mobile-host-floor-selection-meta">{t("Viewing in table inspector")}</p>
        </div>
        <div className="mobile-host-floor-selection-center">
          <span
            className={`host-reservation-card-status-pill mobile-host-floor-selection-status selected-reservation-status tone-${statusMeta.tone} is-compact is-readonly${statusPresentation.severity ? ` is-late-${statusPresentation.severity}` : ''}`}
            aria-label={`Reservation status: ${statusPresentation.label}`}
          >
            <span className="selected-reservation-status-icon" aria-hidden="true">
              {statusPresentation.icon}
            </span>
            <span className="selected-reservation-status-label">
              {statusPresentation.label}
            </span>
          </span>
        </div>
        <div className="mobile-host-floor-selection-actions">
          <button
            type="button"
            className="mobile-host-floor-selection-edit-btn"
            onClick={() => onEdit?.(reservation)}
          >
            <span className="mobile-host-floor-selection-action-icon" aria-hidden="true">✏️</span>
            <span>{t("Edit")}</span>
          </button>
          {onOpenRowMenu ? (
            <button
              type="button"
              className="mobile-host-floor-selection-menu-btn"
              aria-label={t("More reservation actions")}
              aria-haspopup="menu"
              onClick={(event) => onOpenRowMenu(reservation, event)}
            >
              ⋯
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              className="mobile-host-floor-selection-close-btn"
              aria-label={t("Close reservation card")}
              onClick={() => onClose()}
            >
              ✕
            </button>
          ) : null}
        </div>
      </article>
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
  onClose = null,
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
            className={`host-reservation-card-status-pill mobile-host-floor-selection-status selected-reservation-status tone-${statusMeta.tone} is-compact is-readonly${statusPresentation.severity ? ` is-late-${statusPresentation.severity}` : ''}`}
            aria-label={`Reservation status: ${statusPresentation.label}`}
          >
            <span className="selected-reservation-status-icon" aria-hidden="true">
              {statusPresentation.icon}
            </span>
            <span className="selected-reservation-status-label">
              {statusPresentation.label}
            </span>
          </span>
        </div>

        <div className="mobile-host-floor-selection-actions">
          <button
            type="button"
            className="mobile-host-floor-selection-edit-btn"
            onClick={() => onEdit?.(reservation)}
          >
            <span className="mobile-host-floor-selection-action-icon" aria-hidden="true">✏️</span>
            <span>{t("Edit")}</span>
          </button>
          {onOpenRowMenu ? (
            <button
              type="button"
              className="mobile-host-floor-selection-menu-btn"
              aria-label={t("More reservation actions")}
              aria-haspopup="menu"
              onClick={(event) => onOpenRowMenu(reservation, event)}
            >
              ⋯
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              className="mobile-host-floor-selection-close-btn"
              aria-label={t("Close reservation card")}
              onClick={() => onClose()}
            >
              ✕
            </button>
          ) : null}
        </div>
      </article>
    </div>
  )
}
