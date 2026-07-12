import {
  formatHostListTableLabel,
} from '../../../lib/seatingAssignment'
import {
  getHostReservationQuickActions,
  getHostListCompactStatusPresentation,
  getHostStatusMeta,
  getReservationDisplayStatus,
} from '../../../lib/reservationHostStatus'
import { formatHostReservationListTime } from '../../../lib/timeFormatUtils'
import { HostQueueReservationDetails, HostQueueNameIndicators, HostReservationGuestTypeBadge } from './HostQueueReservationDetails'
import { buildHostQueueRowPresentation } from '../../../lib/hostQueuePipeline'
import { HOST_LIST_HELPERS } from '../../reservations/hostReservationListHelpers'
import { getHostNameGuestTypeBadgeMeta } from '../../reservations/hostReservationListUtils'

function getActionClassName(action) {
  if (action.id === 'edit') return 'mobile-host-reservation-action is-ghost'
  if (action.variant === 'danger') return 'mobile-host-reservation-action is-danger'
  if (action.variant === 'primary' || action.id === 'arrived' || action.id === 'seat' || action.id === 'complete') {
    return 'mobile-host-reservation-action is-service-primary'
  }
  return 'mobile-host-reservation-action'
}

function MobileHostReservationCompactRow({
  reservation,
  todayKey,
  nowMinutes,
  isSelected,
  isStatusMenuOpen,
  isSaving,
  onSelect,
  onOpenStatusMenu,
  onOpenRowMenu,
  floorLayout = null,
  useHostQueuePresentation = false,
}) {
  const guestName = `${reservation?.guestName ?? 'Guest'}`.trim() || 'Guest'
  const partySize = Number(reservation?.guests) || 0
  const tableLabel = formatHostListTableLabel(reservation)
  const tableSection = tableLabel !== '—' ? tableLabel : 'Unassigned'
  const timeLabel = formatHostReservationListTime(reservation, todayKey)
  const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)
  const statusMeta = getHostStatusMeta(displayStatus)
  const statusPresentation = useHostQueuePresentation
    ? getHostListCompactStatusPresentation(reservation, nowMinutes, todayKey)
    : { label: statusMeta.label, severity: null }
  const nameIndicators = useHostQueuePresentation
    ? buildHostQueueRowPresentation(reservation, floorLayout).nameIndicators
    : []
  const guestTypeBadge = getHostNameGuestTypeBadgeMeta(
    reservation,
    HOST_LIST_HELPERS.getGuestCustomerType,
  )

  return (
    <li className="mobile-host-reservation-item">
      <article
        className={`mobile-host-reservation-row is-compact${isSelected ? ' is-selected' : ''}${isStatusMenuOpen ? ' is-status-menu-open' : ''}`}
      >
        <span
          className={`mobile-host-reservation-row-indicator tone-${statusMeta.tone}`}
          aria-hidden="true"
          title={statusMeta.label}
        >
          {statusMeta.icon}
        </span>

        <button
          type="button"
          className="mobile-host-reservation-row-main"
          onClick={() => onSelect?.(reservation)}
        >
          <div className="mobile-host-reservation-row-primary">
            <span className="mobile-host-reservation-row-time">{timeLabel}</span>
            <div className="mobile-host-reservation-row-name-column">
              <span className="mobile-host-reservation-row-name">
                {guestName}
                <HostQueueNameIndicators indicators={nameIndicators} />
              </span>
              {guestTypeBadge ? (
                <div className="host-reservation-card-guest-type-row">
                  <HostReservationGuestTypeBadge badge={guestTypeBadge} />
                </div>
              ) : null}
            </div>
          </div>
          {useHostQueuePresentation ? (
            <HostQueueReservationDetails
              reservation={reservation}
              layout={floorLayout}
              className="host-queue-row-details mobile-host-reservation-row-meta"
            />
          ) : (
            <p className="mobile-host-reservation-row-meta">
              {partySize} {partySize === 1 ? 'guest' : 'guests'} · {tableSection}
            </p>
          )}
        </button>

        <button
          type="button"
          className={`mobile-host-reservation-row-status tone-${statusMeta.tone}${statusPresentation.severity ? ` is-late-${statusPresentation.severity}` : ''}`}
          aria-label={`Status: ${statusMeta.label}. Change status.`}
          aria-expanded={isStatusMenuOpen}
          aria-haspopup="dialog"
          disabled={isSaving}
          onClick={(event) => {
            event.stopPropagation()
            onOpenStatusMenu?.(reservation, event)
          }}
        >
          <span className="mobile-host-reservation-row-status-label">{statusPresentation.label}</span>
          <span className="mobile-host-reservation-row-status-caret" aria-hidden="true">▾</span>
        </button>

        <button
          type="button"
          className="mobile-host-reservation-row-more"
          aria-label="More reservation actions"
          aria-haspopup="menu"
          disabled={isSaving}
          onClick={(event) => {
            event.stopPropagation()
            onOpenRowMenu?.(reservation, event)
          }}
        >
          ⋯
        </button>
      </article>
    </li>
  )
}

export function MobileReservationHostCard({
  reservation,
  groupId: _groupId,
  todayKey = '',
  nowMinutes = 0,
  isSelected = false,
  isLandscapeLayout = false,
  isStatusMenuOpen = false,
  onSelect,
  onQuickStatusUpdate,
  onEdit,
  onOpenStatusMenu,
  onOpenRowMenu,
  isSaving = false,
  layout = null,
  useHostQueuePresentation = false,
}) {
  const guestName = `${reservation?.guestName ?? 'Guest'}`.trim() || 'Guest'
  const partySize = Number(reservation?.guests) || 0
  const phone = `${reservation?.phone ?? ''}`.trim()
  const tableLabel = formatHostListTableLabel(reservation)
  const tableSection = tableLabel !== '—' ? tableLabel : 'Unassigned'
  const timeLabel = formatHostReservationListTime(reservation, todayKey)
  const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)
  const statusMeta = getHostStatusMeta(displayStatus)
  const quickActions = [
    ...getHostReservationQuickActions(reservation, { nowMinutes, todayKey }),
    { id: 'edit', label: 'Edit' },
  ]

  const handleAction = (event, action) => {
    event.stopPropagation()
    if (isSaving) return

    if (action.id === 'edit') {
      onEdit?.(reservation)
      return
    }

    if (action.status) {
      onQuickStatusUpdate?.(reservation, action.status)
    }
  }

  if (isLandscapeLayout) {
    return (
      <MobileHostReservationCompactRow
        reservation={reservation}
        todayKey={todayKey}
        nowMinutes={nowMinutes}
        isSelected={isSelected}
        isStatusMenuOpen={isStatusMenuOpen}
        isSaving={isSaving}
        onSelect={onSelect}
        onOpenStatusMenu={onOpenStatusMenu}
        onOpenRowMenu={onOpenRowMenu}
        floorLayout={layout}
        useHostQueuePresentation={useHostQueuePresentation}
      />
    )
  }

  return (
    <li className="mobile-host-reservation-item">
      <article className={`mobile-host-reservation-card${isSelected ? ' is-selected' : ''}`}>
        <button
          type="button"
          className="mobile-host-reservation-card-main"
          onClick={() => onSelect?.(reservation)}
        >
          <div className="mobile-host-reservation-card-top">
            <span className="mobile-host-reservation-time">{timeLabel}</span>
            <span className={`mobile-host-reservation-status tone-${statusMeta.tone}`}>
              {statusMeta.label}
            </span>
          </div>

          <div className="mobile-host-reservation-card-body">
            <h3 className="mobile-host-reservation-guest">{guestName}</h3>
            <p className="mobile-host-reservation-meta">
              {partySize} {partySize === 1 ? 'guest' : 'guests'}
              {phone ? ` · ${phone}` : ''}
            </p>
            <p className="mobile-host-reservation-table">{tableSection}</p>
          </div>
        </button>

        <div className="mobile-host-reservation-actions" role="group" aria-label="Quick actions">
          {quickActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={getActionClassName(action)}
              onClick={(event) => handleAction(event, action)}
              disabled={isSaving}
            >
              {action.label}
            </button>
          ))}
        </div>
      </article>
    </li>
  )
}
