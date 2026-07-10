import { useMemo, useState } from 'react'
import {
  formatHostReservationListTime,
} from '../../lib/timeFormatUtils'
import {
  formatHostListTableLabel,
  formatHostListTableTooltip,
} from '../../lib/seatingAssignment'
import {
  getHostReservationQuickActions,
  getHostReservationVisualIndicator,
  getHostStatusMeta,
  getReservationDisplayStatus,
} from '../../lib/reservationHostStatus'
import {
  groupHostListReservations,
} from './hostReservationListUtils'
import { getHostListEmptyState } from '../../lib/reservationServiceIntelligence'
import { HostReservationStatusPicker } from './HostReservationStatusPicker'

function formatHostListScheduleLabel(reservation, todayKey) {
  return formatHostReservationListTime(reservation, todayKey)
}

function getQuickActionClassName(action) {
  if (action.variant === 'danger') return 'host-reservation-card-quick-action is-danger'
  if (action.variant === 'primary') return 'host-reservation-card-quick-action is-primary'
  return 'host-reservation-card-quick-action'
}

function HostReservationListRow({
  reservation,
  nowMinutes,
  todayKey,
  isSelected,
  isEditing,
  isDragging,
  isStatusPickerOpen,
  isNextArrival,
  isSavingStatus,
  onOpenEdit,
  onOpenStatusPicker,
  onQuickStatusUpdate,
  onDragStart,
  onDragEnd,
  helpers,
}) {
  const {
    formatReservationGuestName,
    getHostReservationWarnings,
  } = helpers

  const guestName = formatReservationGuestName(reservation.guestName)
  const guestCount = Number(reservation.guests) || 0
  const tableLabel = formatHostListTableLabel(reservation)
  const tableTooltip = formatHostListTableTooltip(reservation)
  const scheduleLabel = formatHostListScheduleLabel(
    reservation,
    todayKey,
  )
  const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)
  const statusMeta = getHostStatusMeta(displayStatus)
  const visualIndicator = getHostReservationVisualIndicator(reservation, nowMinutes, todayKey)
  const warnings = getHostReservationWarnings(reservation, nowMinutes, todayKey)
  const quickActions = getHostReservationQuickActions(reservation, { nowMinutes, todayKey })

  const handleCardActivate = () => {
    onOpenEdit(reservation)
  }

  const handleOpenStatusPicker = (event) => {
    event.stopPropagation()
    onOpenStatusPicker(reservation, event)
  }

  const handleQuickAction = (event, action) => {
    event.stopPropagation()
    if (isSavingStatus || !action.status) return
    onQuickStatusUpdate?.(reservation, action.status)
  }

  return (
    <article
      className={`host-reservation-card tone-${statusMeta.tone}${isSelected ? ' is-selected' : ''}${isEditing ? ' is-editing' : ''}${isDragging ? ' is-dragging' : ''}${isStatusPickerOpen ? ' is-status-picker-open' : ''}${isNextArrival ? ' is-next-arrival' : ''}`}
      role="listitem"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={handleCardActivate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleCardActivate()
        }
      }}
    >
      <div className="host-reservation-card-main">
        <span className="host-reservation-card-time">{scheduleLabel}</span>

        <div className="host-reservation-card-body">
          <div className="host-reservation-card-title-row">
          {['confirmed', 'seated', 'finished', 'late'].includes(visualIndicator) ? (
            <span
              className={`host-reservation-visual-dot is-${visualIndicator}`}
              aria-hidden="true"
            />
          ) : null}
          <strong className="host-reservation-card-guest">{guestName}</strong>
          {warnings.length > 0 ? (
            <span className="host-reservation-card-warning" title="Needs attention" aria-label="Needs attention">
              !
            </span>
          ) : null}
          </div>
          <div className="host-reservation-card-details">
            <span className="host-reservation-card-guests">
              {guestCount} {guestCount === 1 ? 'guest' : 'guests'}
              {tableLabel ? (
                <>
                  {' · '}
                  <span
                    className="host-reservation-card-tables"
                    title={tableTooltip !== tableLabel ? tableTooltip : undefined}
                  >
                    {tableLabel}
                  </span>
                </>
              ) : null}
            </span>
            {reservation.area ? (
              <span className="host-reservation-card-area">{reservation.area}</span>
            ) : null}
          </div>
        </div>

        <button
        type="button"
        className={`host-reservation-card-status-pill tone-${statusMeta.tone} is-compact`}
        aria-label={`Status: ${statusMeta.label}. Change status.`}
        aria-expanded={isStatusPickerOpen}
        aria-haspopup="dialog"
        onClick={handleOpenStatusPicker}
      >
        {statusMeta.label}
      </button>
      </div>

      {quickActions.length > 0 ? (
        <div className="host-reservation-card-quick-actions" role="group" aria-label="Quick actions">
          {quickActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={getQuickActionClassName(action)}
              onClick={(event) => handleQuickAction(event, action)}
              disabled={isSavingStatus}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  )
}

export function HostReservationList({
  reservations,
  nowMinutes,
  todayKey,
  isLoading,
  isSelected,
  hostEditingReservation,
  draggingReservationId,
  isSavingStatus,
  nextArrivalId = null,
  listFilter = 'All',
  searchTerm = '',
  dailySnapshot = null,
  isViewingToday = true,
  onOpenEdit,
  onStatusChange,
  onDragStart,
  onDragEnd,
  helpers,
}) {
  const groupedReservations = useMemo(
    () => groupHostListReservations(reservations),
    [reservations],
  )

  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set(['completed']))
  const [statusPicker, setStatusPicker] = useState(null)

  const toggleGroup = (groupId) => {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  const handleOpenStatusPicker = (reservation, event) => {
    const anchorRect = event.currentTarget.getBoundingClientRect()
    const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)

    setStatusPicker({
      reservation,
      anchorRect,
      currentStatusId: displayStatus,
    })
  }

  const handleCloseStatusPicker = () => {
    setStatusPicker(null)
  }

  const handleStatusChange = async (reservation, status) => {
    await onStatusChange(reservation, status)
    setStatusPicker(null)
  }

  if (isLoading) {
    return <p className="host-reservation-list-empty">Loading reservations…</p>
  }

  if (!reservations.length) {
    const emptyState = getHostListEmptyState({
      filter: listFilter,
      searchTerm,
      snapshot: dailySnapshot,
      isViewingToday,
    })

    return (
      <div className="host-reservation-list-empty">
        <p className="reservations-empty-icon" aria-hidden="true">🍽</p>
        <h4>{emptyState.title}</h4>
        <p>{emptyState.copy}</p>
      </div>
    )
  }

  return (
    <>
      <div className="host-reservation-list host-reservation-list-grouped" aria-label="Reservations">
        {groupedReservations.map((group) => {
          const isCollapsed = collapsedGroups.has(group.id)

          return (
            <section key={group.id} className={`host-reservation-group tone-${group.tone}`}>
              <button
                type="button"
                className="host-reservation-group-header"
                aria-expanded={!isCollapsed}
                onClick={() => toggleGroup(group.id)}
              >
                <span className="host-reservation-group-label">{group.label}</span>
                <span className="host-reservation-group-count">{group.reservations.length}</span>
                <span className={`host-reservation-group-chevron${isCollapsed ? ' is-collapsed' : ''}`} aria-hidden="true">
                  ▾
                </span>
              </button>

              {!isCollapsed ? (
                <div className="host-reservation-group-items" role="list">
                  {group.reservations.map((reservation) => (
                    <HostReservationListRow
                      key={reservation.id}
                      reservation={reservation}
                      nowMinutes={nowMinutes}
                      todayKey={todayKey}
                      isSelected={isSelected(reservation)}
                      isEditing={hostEditingReservation
                        && String(hostEditingReservation.id) === String(reservation.id)}
                      isDragging={draggingReservationId === String(reservation.id)}
                      isStatusPickerOpen={String(statusPicker?.reservation?.id) === String(reservation.id)}
                      isNextArrival={nextArrivalId !== null
                        && String(nextArrivalId) === String(reservation.id)}
                      isSavingStatus={isSavingStatus}
                      onOpenEdit={onOpenEdit}
                      onOpenStatusPicker={handleOpenStatusPicker}
                      onQuickStatusUpdate={onStatusChange}
                      onDragStart={(event) => onDragStart(event, reservation)}
                      onDragEnd={onDragEnd}
                      helpers={helpers}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          )
        })}
      </div>

      <HostReservationStatusPicker
        reservation={statusPicker?.reservation}
        currentStatusId={statusPicker?.currentStatusId}
        anchorRect={statusPicker?.anchorRect}
        isOpen={Boolean(statusPicker)}
        isSaving={isSavingStatus}
        onClose={handleCloseStatusPicker}
        onSelectStatus={handleStatusChange}
      />
    </>
  )
}
