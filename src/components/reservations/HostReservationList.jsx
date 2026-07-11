import { useEffect, useMemo, useState } from 'react'
import {
  formatHostReservationListTime,
} from '../../lib/timeFormatUtils'
import {
  formatHostListTableLabel,
} from '../../lib/seatingAssignment'
import {
  getHostReservationQuickActions,
  getHostReservationVisualIndicator,
  getHostListCompactStatusLabel,
  getHostListCompactStatusPresentation,
  getHostStatusMeta,
  getReservationDisplayStatus,
} from '../../lib/reservationHostStatus'
import {
  formatHostListMetaLine,
} from './hostReservationListHelpers'
import {
  getDefaultHostListCollapsedSections,
  groupHostListOperationalSections,
  HOST_LIST_OPERATIONAL_SECTION_DEFS,
  HOST_LIST_SECTION_COLLAPSE_STORAGE_KEY,
} from './hostReservationListUtils'
import { getHostListEmptyState } from '../../lib/reservationServiceIntelligence'
import { groupHostQueueOperationalSections } from '../../lib/hostQueuePipeline'
import { HostQueueReservationDetails, HostQueueNameIndicators } from '../mobile/reservations/HostQueueReservationDetails'
import { buildHostQueueRowPresentation } from '../../lib/hostQueuePipeline'
import { HostReservationStatusPicker } from './HostReservationStatusPicker'

function formatHostListScheduleLabel(reservation, todayKey) {
  return formatHostReservationListTime(reservation, todayKey)
}

function getQuickActionClassName(action) {
  if (action.variant === 'danger') return 'host-reservation-card-quick-action is-danger'
  if (action.variant === 'primary') return 'host-reservation-card-quick-action is-primary'
  return 'host-reservation-card-quick-action'
}

function readCollapsedSections() {
  if (typeof window === 'undefined') return getDefaultHostListCollapsedSections()

  try {
    const raw = window.localStorage.getItem(HOST_LIST_SECTION_COLLAPSE_STORAGE_KEY)
    if (!raw) return getDefaultHostListCollapsedSections()

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return getDefaultHostListCollapsedSections()

    return new Set(parsed)
  } catch {
    return getDefaultHostListCollapsedSections()
  }
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
  onOpenRowMenu = null,
  layout = 'default',
  floorLayout = null,
  useHostQueuePresentation = false,
  helpers,
}) {
  const {
    formatReservationGuestName,
    getHostReservationWarnings,
  } = helpers

  const guestName = formatReservationGuestName(reservation.guestName)
  const guestCount = Number(reservation.guests) || 0
  const tableLabel = formatHostListTableLabel(reservation)
  const scheduleLabel = formatHostListScheduleLabel(
    reservation,
    todayKey,
  )
  const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)
  const statusMeta = getHostStatusMeta(displayStatus)
  const statusPresentation = useHostQueuePresentation
    ? getHostListCompactStatusPresentation(reservation, nowMinutes, todayKey)
    : { label: getHostListCompactStatusLabel(displayStatus), severity: null }
  const compactStatusLabel = statusPresentation.label
  const nameIndicators = useHostQueuePresentation
    ? buildHostQueueRowPresentation(reservation, floorLayout).nameIndicators
    : []
  const visualIndicator = getHostReservationVisualIndicator(reservation, nowMinutes, todayKey)
  const warnings = getHostReservationWarnings(reservation, nowMinutes, todayKey)
  const quickActions = layout === 'default'
    ? getHostReservationQuickActions(reservation, { nowMinutes, todayKey })
    : []
  const isCompactTablet = layout === 'compactTablet'
  const metaLine = formatHostListMetaLine(guestCount, tableLabel)

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

  const handleOpenRowMenu = (event) => {
    event.stopPropagation()
    onOpenRowMenu?.(reservation, event)
  }

  return (
    <article
      className={`host-reservation-card tone-${statusMeta.tone}${isSelected ? ' is-selected' : ''}${isEditing ? ' is-editing' : ''}${isDragging ? ' is-dragging' : ''}${isStatusPickerOpen ? ' is-status-picker-open' : ''}${isNextArrival ? ' is-next-arrival' : ''}${isCompactTablet ? ' is-compact-tablet' : ''}`}
      role="listitem"
      tabIndex={0}
      draggable={!isCompactTablet}
      onDragStart={isCompactTablet ? undefined : onDragStart}
      onDragEnd={isCompactTablet ? undefined : onDragEnd}
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
          <HostQueueNameIndicators indicators={nameIndicators} />
          {warnings.length > 0 ? (
            <span className="host-reservation-card-warning" title="Needs attention" aria-label="Needs attention">
              !
            </span>
          ) : null}
          </div>
          {useHostQueuePresentation ? (
            <HostQueueReservationDetails
              reservation={reservation}
              layout={floorLayout}
              className="host-reservation-card-details host-queue-row-details"
            />
          ) : (
            <div className="host-reservation-card-details">
              <span className="host-reservation-card-meta">{metaLine}</span>
            </div>
          )}
        </div>

        <div className="host-reservation-card-trailing">
        <button
        type="button"
        className={`host-reservation-card-status-pill tone-${statusMeta.tone} is-compact${statusPresentation.severity ? ` is-late-${statusPresentation.severity}` : ''}`}
        aria-label={`Status: ${statusMeta.label}. Change status.`}
        aria-expanded={isStatusPickerOpen}
        aria-haspopup="dialog"
        onClick={handleOpenStatusPicker}
      >
        {compactStatusLabel}
      </button>
      {onOpenRowMenu ? (
        <button
          type="button"
          className="host-reservation-card-row-menu"
          aria-label="More reservation actions"
          aria-haspopup="menu"
          disabled={isSavingStatus}
          onClick={handleOpenRowMenu}
        >
          ⋯
        </button>
      ) : null}
      </div>
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
  problemFilterOptions = null,
  onOpenEdit,
  onStatusChange,
  onDragStart,
  onDragEnd,
  onOpenRowMenu = null,
  layout = 'default',
  floorLayout = null,
  sortId = null,
  queueEmptyState = null,
  onClearQueueFilters = null,
  useHostQueuePresentation = false,
  helpers,
}) {
  const operationalSections = useMemo(
    () => (
      sortId
        ? groupHostQueueOperationalSections(reservations, {
          nowMinutes,
          todayKey,
          sortId,
          problemFilterOptions: problemFilterOptions ?? {},
        })
        : groupHostListOperationalSections(
          reservations,
          nowMinutes,
          todayKey,
          problemFilterOptions ?? {},
        )
    ),
    [reservations, nowMinutes, todayKey, problemFilterOptions, sortId],
  )

  const listLayoutClass = layout === 'compactTablet' ? ' is-compact-tablet-layout' : ''

  const [collapsedSections, setCollapsedSections] = useState(readCollapsedSections)
  const [statusPicker, setStatusPicker] = useState(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    window.localStorage.setItem(
      HOST_LIST_SECTION_COLLAPSE_STORAGE_KEY,
      JSON.stringify([...collapsedSections]),
    )
  }, [collapsedSections])

  const toggleSection = (sectionId) => {
    setCollapsedSections((current) => {
      const next = new Set(current)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
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

  const visibleSections = operationalSections.filter((section) => section.reservations.length > 0)
  const totalVisible = visibleSections.reduce(
    (count, section) => count + section.reservations.length,
    0,
  )

  if (!totalVisible) {
    const emptyState = queueEmptyState ?? getHostListEmptyState({
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
        {emptyState.showClearFilters && onClearQueueFilters ? (
          <button
            type="button"
            className="host-queue-toolbar-clear"
            onClick={onClearQueueFilters}
          >
            Clear filters
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <div
        className={`host-reservation-list host-reservation-list-grouped host-reservation-list-sections${listLayoutClass}`}
        aria-label="Reservations"
      >
        {operationalSections
          .filter((section) => section.reservations.length > 0)
          .map((section) => {
          const isCollapsed = collapsedSections.has(section.id)
          const sectionTone = HOST_LIST_OPERATIONAL_SECTION_DEFS.find(
            (entry) => entry.id === section.id,
          )?.id === 'problems' ? 'cancelled' : (
            section.id === 'completed' ? 'completed' : (
              section.id === 'seated' ? 'in-house' : (
                section.id === 'arrived' ? 'waiting' : 'booked'
              )
            )
          )

          return (
            <section
              key={section.id}
              className={`host-reservation-group tone-${sectionTone}${section.reservations.length === 0 ? ' is-empty' : ''}`}
            >
              <button
                type="button"
                className="host-reservation-group-header"
                aria-expanded={!isCollapsed}
                onClick={() => toggleSection(section.id)}
              >
                <span
                  className={`host-reservation-group-chevron${isCollapsed ? ' is-collapsed' : ''}`}
                  aria-hidden="true"
                >
                  {isCollapsed ? '▶' : '▼'}
                </span>
                <span className="host-reservation-group-label">{section.label}</span>
                <span className="host-reservation-group-count">({section.reservations.length})</span>
              </button>

              {!isCollapsed && section.reservations.length > 0 ? (
                <div className="host-reservation-group-items" role="list">
                  {section.reservations.map((reservation) => (
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
                      onOpenRowMenu={onOpenRowMenu}
                      layout={layout}
                      floorLayout={floorLayout}
                      useHostQueuePresentation={useHostQueuePresentation}
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
