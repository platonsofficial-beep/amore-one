import {
  formatHostListTableLabel,
} from '../../../lib/seatingAssignment'
import {
  getHostReservationQuickActions,
  getHostStatusMeta,
  getReservationDisplayStatus,
} from '../../../lib/reservationHostStatus'
import { formatHostReservationListTime } from '../../../lib/timeFormatUtils'

function getActionClassName(action) {
  if (action.id === 'edit') return 'mobile-host-reservation-action is-ghost'
  if (action.variant === 'danger') return 'mobile-host-reservation-action is-danger'
  if (action.variant === 'primary' || action.id === 'arrived' || action.id === 'seat' || action.id === 'complete') {
    return 'mobile-host-reservation-action is-service-primary'
  }
  return 'mobile-host-reservation-action'
}

export function MobileReservationHostCard({
  reservation,
  groupId: _groupId,
  todayKey = '',
  nowMinutes = 0,
  isSelected = false,
  isLandscapeLayout = false,
  onSelect,
  onQuickStatusUpdate,
  onEdit,
  isSaving = false,
}) {
  const guestName = `${reservation?.guestName ?? 'Guest'}`.trim() || 'Guest'
  const partySize = Number(reservation?.guests) || 0
  const phone = `${reservation?.phone ?? ''}`.trim()
  const tableLabel = formatHostListTableLabel(reservation)
  const area = `${reservation?.area ?? ''}`.trim()
  const tableSection = tableLabel !== '—'
    ? (area ? `${tableLabel} · ${area}` : tableLabel)
    : (area || 'Unassigned')
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
      <li className="mobile-host-reservation-item">
        <article className={`mobile-host-reservation-card is-landscape-layout${isSelected ? ' is-selected' : ''}`}>
          <button
            type="button"
            className="mobile-host-reservation-card-main"
            onClick={() => onSelect?.(reservation)}
          >
            <span className="mobile-host-reservation-time is-large">{timeLabel}</span>
            <div className="mobile-host-reservation-service-copy">
              <h3 className="mobile-host-reservation-guest">{guestName}</h3>
              <p className="mobile-host-reservation-meta">
                {partySize} {partySize === 1 ? 'guest' : 'guests'}
              </p>
              <p className="mobile-host-reservation-table">{tableSection}</p>
            </div>
            <span className={`mobile-host-reservation-status tone-${statusMeta.tone}`}>
              {statusMeta.label}
            </span>
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
