import { useMemo, useState } from 'react'
import {
  formatHostListTableLabel,
  formatHostListTableTooltip,
} from '../../lib/seatingAssignment'
import {
  getHostReservationVisualIndicator,
  getHostStatusMeta,
  getReservationDisplayStatus,
} from '../../lib/reservationHostStatus'
import {
  getHostListCustomerTypeMeta,
  groupHostListReservations,
} from './hostReservationListUtils'
import { HostReservationStatusPicker } from './HostReservationStatusPicker'

function formatHostListScheduleLabel(reservation, todayKey, formatHostReservationListTime) {
  return formatHostReservationListTime(reservation, todayKey)
}

function HostReservationListRow({
  reservation,
  nowMinutes,
  todayKey,
  isSelected,
  isEditing,
  isDragging,
  isStatusPickerOpen,
  onSelect,
  onOpenEdit,
  onOpenStatusPicker,
  onDragStart,
  onDragEnd,
  helpers,
}) {
  const {
    formatReservationGuestName,
    formatHostReservationListTime,
    getHostReservationWarnings,
    getGuestCustomerType,
  } = helpers

  const guestName = formatReservationGuestName(reservation.guestName)
  const guestCount = Number(reservation.guests) || 0
  const tableLabel = formatHostListTableLabel(reservation)
  const tableTooltip = formatHostListTableTooltip(reservation)
  const scheduleLabel = formatHostListScheduleLabel(
    reservation,
    todayKey,
    formatHostReservationListTime,
  )
  const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)
  const statusMeta = getHostStatusMeta(displayStatus)
  const visualIndicator = getHostReservationVisualIndicator(reservation, nowMinutes, todayKey)
  const showVisualDot = ['confirmed', 'seated', 'finished', 'late'].includes(visualIndicator)
  const typeMeta = getHostListCustomerTypeMeta(reservation, getGuestCustomerType)
  const warnings = getHostReservationWarnings(reservation, nowMinutes, todayKey)

  const handleOpenStatusPicker = (event) => {
    event.stopPropagation()
    onOpenStatusPicker(reservation, event)
  }

  return (
    <article
      className={`host-reservation-card tone-${statusMeta.tone}${isSelected ? ' is-selected' : ''}${isEditing ? ' is-editing' : ''}${isDragging ? ' is-dragging' : ''}${isStatusPickerOpen ? ' is-status-picker-open' : ''}`}
      role="listitem"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(reservation)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(reservation)
        }
      }}
    >
      <button
        type="button"
        className={`host-reservation-card-status tone-${statusMeta.tone}`}
        aria-label={`Status: ${statusMeta.label}. Change status.`}
        aria-expanded={isStatusPickerOpen}
        aria-haspopup="dialog"
        onClick={handleOpenStatusPicker}
      >
        <span className="host-reservation-card-status-icon" aria-hidden="true">
          {statusMeta.icon}
        </span>
      </button>

      <div className="host-reservation-card-main">
        <div className="host-reservation-card-top">
          <span className="host-reservation-card-guest-row">
            {showVisualDot ? (
              <span
                className={`host-reservation-visual-dot is-${visualIndicator}`}
                aria-hidden="true"
              />
            ) : null}
            <span className="host-reservation-card-guest">{guestName}</span>
          </span>
          <span className={`host-reservation-card-type ${typeMeta.className}`}>{typeMeta.label}</span>
        </div>

        <div className="host-reservation-card-meta">
          <span className="host-reservation-card-schedule">{scheduleLabel}</span>
          <span className="host-reservation-card-dot" aria-hidden="true">·</span>
          <span className="host-reservation-card-guests">{guestCount} guests</span>
          {warnings.includes('unassigned') ? (
            <span className="host-reservation-card-warning" title="No table assigned">!</span>
          ) : null}
          {warnings.includes('capacity') ? (
            <span
              className="host-reservation-card-warning is-capacity"
              title="Guest count exceeds selected table capacity"
              aria-label="Guest count exceeds selected table capacity"
            >
              !
            </span>
          ) : null}
        </div>

        <div
          className="host-reservation-card-tables"
          title={tableTooltip !== tableLabel ? tableTooltip : undefined}
        >
          {tableLabel}
        </div>

        <button
          type="button"
          className={`host-reservation-card-status-pill tone-${statusMeta.tone}`}
          aria-label={`Status: ${statusMeta.label}. Change status.`}
          aria-expanded={isStatusPickerOpen}
          aria-haspopup="dialog"
          onClick={handleOpenStatusPicker}
        >
          {statusMeta.label}
        </button>
      </div>

      <button
        type="button"
        className="host-reservation-card-action"
        aria-label={`Edit reservation for ${guestName}`}
        onClick={(event) => {
          event.stopPropagation()
          onOpenEdit(reservation)
        }}
      >
        ›
      </button>
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
  onSelectReservation,
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

  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set())
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
    return (
      <div className="host-reservation-list-empty">
        <p className="reservations-empty-icon" aria-hidden="true">🍽</p>
        <h4>No reservations</h4>
        <p>Matching reservations will appear here.</p>
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
                <span className="host-reservation-group-leading" aria-hidden="true">
                  <span className="host-reservation-group-icon">{group.icon}</span>
                  <span className={`host-reservation-group-accent tone-${group.tone}`} />
                </span>
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
                      onSelect={onSelectReservation}
                      onOpenEdit={onOpenEdit}
                      onOpenStatusPicker={handleOpenStatusPicker}
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
