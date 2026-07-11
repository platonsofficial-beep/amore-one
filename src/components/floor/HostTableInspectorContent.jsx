import { useEffect } from 'react'
import { buildHostTableInspectorSummary } from '../../lib/hostTableInspectorUtils'
import { buildHostFloorSelectionMetaLine } from '../../lib/hostFloorSelectionBar'
import { formatHostListUnitLabel, getReservationSeatingAssignment } from '../../lib/seatingAssignment'
import { formatHostAssignmentActionLabel } from '../../lib/hostAssignmentPanelUtils'
import {
  getHostFloorSelectionStatusPresentation,
  getHostListCompactStatusPresentation,
} from '../../lib/reservationHostStatus'
import { getTableDayViewStatusPresentation } from '../../lib/tableDayView'
import { formatTime24 } from '../../lib/timeFormatUtils'

function TableDayViewRowDivider() {
  return <div className="floor-table-day-row-divider" aria-hidden="true" />
}

function TableDayViewInfoList({ items = [] }) {
  if (!items.length) return null

  return (
    <ul className="floor-table-day-info-list">
      {items.map((item) => (
        <li key={item.id} className="floor-table-day-info-item">
          <span className="floor-table-day-info-icon" aria-hidden="true">{item.icon}</span>
          <span
            className={`floor-table-day-info-label${item.id === 'time' ? ' floor-table-day-guest-time' : ''}${item.id === 'guests' ? ' floor-table-day-guest-count' : ''}${item.id === 'table' ? ' floor-table-day-table-chip' : ''}`}
          >
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  )
}

function TableDayViewStatusPill({
  presentation,
  reservation = null,
  nowMinutes = 0,
  todayKey = '',
}) {
  if (!presentation && !reservation) return null

  const hostPresentation = reservation
    ? getHostFloorSelectionStatusPresentation(reservation, nowMinutes, todayKey)
    : null
  const icon = hostPresentation?.icon ?? presentation?.dot ?? '•'
  const label = hostPresentation?.label ?? presentation?.label ?? ''
  const tone = hostPresentation?.tone ?? presentation?.tone ?? 'confirmed'
  const severity = hostPresentation?.severity ?? null

  if (!label) return null

  return (
    <span
      className={`host-reservation-card-status-pill floor-table-day-status-pill selected-reservation-status tone-${tone} is-compact is-readonly${severity ? ` is-late-${severity}` : ''}`}
      aria-label={`Reservation status: ${label}`}
    >
      <span className="selected-reservation-status-icon" aria-hidden="true">{icon}</span>
      <span className="selected-reservation-status-label">{label}</span>
    </span>
  )
}

function getTableChipMeta(reservation, assignedTablesLabel) {
  if (!assignedTablesLabel || assignedTablesLabel === '—') return null

  const assignment = getReservationSeatingAssignment(reservation)
  let tableCount = assignment?.assignedUnits?.length ?? 0
  if (tableCount === 0) {
    tableCount = assignedTablesLabel.split(' + ').filter(Boolean).length
  }

  return {
    prefix: tableCount === 1 ? 'Table' : 'Tables',
    value: assignedTablesLabel,
  }
}

function buildTableDayViewInfoItems(
  reservation,
  assignedTablesLabel,
  {
    floorLayout = null,
    reservationSeatings = [],
    dateKey = '',
  } = {},
) {
  if (!reservation) return []

  const items = []
  const arrivalTime = reservation?.time ? formatTime24(reservation.time) : null

  if (arrivalTime) {
    items.push({ id: 'time', icon: '🕣', label: arrivalTime })
  }

  const metaPresentation = buildHostFloorSelectionMetaLine(reservation, {
    floorLayout,
    seatings: reservationSeatings,
    dateKey,
  })

  metaPresentation.metaLine.split('  •  ').filter(Boolean).forEach((part, index) => {
    const icon = ['👤', '🍽', '🪑', '🍷'].find((prefix) => part.startsWith(prefix)) ?? '•'
    const id = icon === '👤'
      ? 'guests'
      : icon === '🍽'
        ? 'table'
        : icon === '🪑'
          ? 'extra-chair'
          : icon === '🍷'
            ? 'seating'
            : `meta-${index}`

    items.push({
      id,
      icon,
      label: part.startsWith(icon) ? part.slice(icon.length).trim() : part,
    })
  })

  return items
}

function InspectorSummary({ rows = [] }) {
  const summary = buildHostTableInspectorSummary(rows)
  if (!summary?.primary) return null

  return (
    <div className="host-table-inspector-summary" data-testid="host-table-inspector-summary">
      <p className="host-table-inspector-summary-primary">{summary.primary}</p>
      {summary.secondary ? (
        <p className="host-table-inspector-summary-secondary">{summary.secondary}</p>
      ) : null}
      {summary.detail ? (
        <p className="host-table-inspector-summary-detail">{summary.detail}</p>
      ) : null}
    </div>
  )
}

function TableDayViewAssignmentRow({
  row,
  assignmentReservation,
  tableLabel,
  draftTableLabels = '',
  tableCapacityLabel = '',
  isSaving,
  canAssign = true,
  onConfirmAssignment,
  onCancelAssignment,
}) {
  const { seating, timeWindowLabel } = row
  const guestName = assignmentReservation?.guestName || 'Guest'
  const arrivalTime = assignmentReservation?.time ? formatTime24(assignmentReservation.time) : null
  const guestCount = Math.max(0, Number(assignmentReservation?.guests) || 0)

  return (
    <>
      <div className="floor-table-day-row-head">
        <strong className="floor-table-day-seating-name">{seating.name}</strong>
        <time className="floor-table-day-seating-time">{timeWindowLabel}</time>
      </div>

      <TableDayViewRowDivider />

      <div className="floor-table-day-row-body">
        <h4 className="floor-table-day-guest-name">
          <span className="floor-table-day-guest-icon" aria-hidden="true">👤</span>
          {guestName}
        </h4>

        <p className="floor-table-day-guest-meta">
          {arrivalTime ? (
            <>
              <span className="floor-table-day-guest-time">{arrivalTime}</span>
              <span className="floor-table-day-guest-count">
                {' · '}
                {guestCount}
                {' '}
                {guestCount === 1 ? 'guest' : 'guests'}
              </span>
            </>
          ) : (
            <span className="floor-table-day-guest-count">
              {guestCount}
              {' '}
              {guestCount === 1 ? 'guest' : 'guests'}
            </span>
          )}
        </p>

        {draftTableLabels ? (
          <div className="host-table-inspector-assignment-tables">
            <p className="host-table-inspector-assignment-label">Selected tables</p>
            <p className="host-table-inspector-assignment-value">{draftTableLabels}</p>
            {tableCapacityLabel ? (
              <p className="host-table-inspector-assignment-capacity">{tableCapacityLabel}</p>
            ) : null}
          </div>
        ) : null}

        {!canAssign ? (
          <p className="floor-table-day-assignment-blocked" role="status">
            This seating is not available for assignment on this table.
          </p>
        ) : null}

        <div className="floor-table-day-row-actions">
          <button
            type="button"
            className="floor-table-day-action is-primary"
            disabled={isSaving || !canAssign}
            onClick={onConfirmAssignment}
            data-testid="floor-table-day-assign-reservation"
          >
            {formatHostAssignmentActionLabel({ draftTableLabels, tableLabel })}
          </button>
          {onCancelAssignment ? (
            <button
              type="button"
              className="floor-table-day-action is-secondary"
              disabled={isSaving}
              onClick={onCancelAssignment}
              data-testid="floor-table-day-cancel-assignment"
            >
              Cancel selection
            </button>
          ) : null}
        </div>
      </div>
    </>
  )
}

function getQuickActionClassName(action) {
  if (action.variant === 'danger') return 'floor-table-day-action is-danger'
  return 'floor-table-day-action is-secondary'
}

function getAssignmentRowClassName(baseClassName, {
  isAssignmentMode = false,
  isAssignmentSelected = false,
} = {}) {
  return [
    baseClassName,
    isAssignmentMode ? 'is-seating-selectable' : '',
    isAssignmentSelected ? 'is-seating-selected' : '',
  ].filter(Boolean).join(' ')
}

function TableDayViewRow({
  row,
  tableLabel,
  isSaving,
  canManageAssignment,
  assignmentContext = null,
  onNewReservation,
  onOpenReservation,
  onEditReservation,
  onQuickStatusUpdate,
  onReleaseTable,
  nowMinutes = 0,
  todayKey = '',
  floorLayout = null,
  reservationSeatings = [],
  tableCapacityLabel = '',
}) {
  const { seating, reservation, conflicts, hasConflict, isAvailable, timeWindowLabel, state } = row
  const isAssignmentMode = Boolean(assignmentContext?.reservation)
  const isAssignmentSelected = assignmentContext?.seatingId === seating.id
  const releaseLabel = tableLabel ? `Release ${tableLabel}` : 'Release table'
  const guestName = reservation?.guestName || 'Guest'
  const infoItems = buildTableDayViewInfoItems(reservation, row.assignedTablesLabel, {
    floorLayout,
    reservationSeatings,
    dateKey: todayKey,
  })
  const statusPresentation = getTableDayViewStatusPresentation({
    statusLabel: row.statusLabel,
    state,
    isAvailable,
  })
  const compactStatus = reservation
    ? getHostListCompactStatusPresentation(reservation, nowMinutes, todayKey)
    : null

  const handleSelectSeating = () => {
    assignmentContext?.onSelectSeating?.(seating.id)
  }

  const handleSelectSeatingKeyDown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handleSelectSeating()
  }

  const stopRowSelection = (event) => {
    event.stopPropagation()
  }

  if (isAssignmentMode && isAssignmentSelected) {
    return (
      <li className="floor-table-day-row is-assignment-pending" data-testid="floor-table-day-row-assignment">
        <TableDayViewAssignmentRow
          row={row}
          assignmentReservation={assignmentContext.reservation}
          tableLabel={assignmentContext.tableLabel}
          draftTableLabels={assignmentContext.draftTableLabels}
          tableCapacityLabel={tableCapacityLabel}
          isSaving={isSaving}
          canAssign={assignmentContext.canAssign !== false}
          onConfirmAssignment={assignmentContext.onConfirmAssignment}
          onCancelAssignment={assignmentContext.onCancelAssignment}
        />
      </li>
    )
  }

  if (hasConflict) {
    return (
      <li
        className={getAssignmentRowClassName('floor-table-day-row is-problem', {
          isAssignmentMode,
          isAssignmentSelected,
        })}
        data-testid="floor-table-day-row-problem"
        role={isAssignmentMode ? 'button' : undefined}
        tabIndex={isAssignmentMode ? 0 : undefined}
        onClick={isAssignmentMode ? handleSelectSeating : undefined}
        onKeyDown={isAssignmentMode ? handleSelectSeatingKeyDown : undefined}
      >
        <div className="floor-table-day-row-head">
          <strong className="floor-table-day-seating-name">{seating.name}</strong>
          <time className="floor-table-day-seating-time">{timeWindowLabel}</time>
        </div>
        <TableDayViewRowDivider />
        <div className="floor-table-day-row-body">
          <TableDayViewStatusPill presentation={statusPresentation} />
          <p className="floor-table-day-row-lead">Overlapping reservations</p>
          <ul className="floor-table-day-conflict-list">
            {conflicts.map((conflictReservation) => (
              <li key={conflictReservation.id}>
                <button
                  type="button"
                  className="floor-table-day-conflict-btn"
                  disabled={isSaving}
                  onClick={(event) => {
                    stopRowSelection(event)
                    onOpenReservation?.(conflictReservation)
                  }}
                >
                  {conflictReservation.guestName || 'Guest'}
                  {' · '}
                  {formatTime24(conflictReservation.time)}
                  {' · '}
                  {Math.max(0, Number(conflictReservation.guests) || 0)} guests
                </button>
              </li>
            ))}
          </ul>
        </div>
      </li>
    )
  }

  if (isAvailable) {
    const availablePresentation = getTableDayViewStatusPresentation({ isAvailable: true, state: 'available' })

    return (
      <li
        className={getAssignmentRowClassName('floor-table-day-row is-available', {
          isAssignmentMode,
          isAssignmentSelected,
        })}
        data-testid="floor-table-day-row-available"
        role={isAssignmentMode ? 'button' : undefined}
        tabIndex={isAssignmentMode ? 0 : undefined}
        onClick={isAssignmentMode ? handleSelectSeating : undefined}
        onKeyDown={isAssignmentMode ? handleSelectSeatingKeyDown : undefined}
      >
        <div className="floor-table-day-row-head">
          <strong className="floor-table-day-seating-name">{seating.name}</strong>
          <time className="floor-table-day-seating-time">{timeWindowLabel}</time>
        </div>
        <TableDayViewRowDivider />
        <div className="floor-table-day-row-body is-compact-available">
          <TableDayViewStatusPill presentation={availablePresentation} />
          {!isAssignmentMode ? (
            <button
              type="button"
              className="floor-table-day-action is-primary"
              disabled={isSaving}
              onClick={() => onNewReservation?.(seating)}
              data-testid="floor-table-day-new-reservation"
            >
              + New reservation
            </button>
          ) : (
            <p className="floor-table-day-seating-select-hint">Tap to seat here</p>
          )}
        </div>
      </li>
    )
  }

  return (
    <li
      className={getAssignmentRowClassName(`floor-table-day-row is-${state}`, {
        isAssignmentMode,
        isAssignmentSelected,
      })}
      data-testid="floor-table-day-row-occupied"
      role={isAssignmentMode ? 'button' : undefined}
      tabIndex={isAssignmentMode ? 0 : undefined}
      onClick={isAssignmentMode ? handleSelectSeating : undefined}
      onKeyDown={isAssignmentMode ? handleSelectSeatingKeyDown : undefined}
    >
      <div className="floor-table-day-row-head">
        <strong className="floor-table-day-seating-name">{seating.name}</strong>
        <time className="floor-table-day-seating-time">{timeWindowLabel}</time>
      </div>

      <TableDayViewRowDivider />

      <div className="floor-table-day-row-body">
        <div className="floor-table-day-guest-headline">
          <h4 className="floor-table-day-guest-name">
            {guestName}
          </h4>
          {compactStatus?.label && compactStatus.label !== guestName ? (
            <span className="floor-table-day-guest-status-note">{compactStatus.label}</span>
          ) : null}
        </div>

        <TableDayViewInfoList items={infoItems} />

        {row.statusLabel ? (
          <TableDayViewStatusPill
            reservation={reservation}
            nowMinutes={nowMinutes}
            todayKey={todayKey}
          />
        ) : null}

        {row.hasNotes ? (
          <p className="floor-table-day-row-notes" aria-label="Reservation has notes">Notes</p>
        ) : null}

        {!isAssignmentMode ? (
          <div className="floor-table-day-row-actions">
            <button
              type="button"
              className="floor-table-day-action is-primary"
              disabled={isSaving}
              onClick={() => onOpenReservation?.(reservation)}
              data-testid="floor-table-day-open-reservation"
            >
              Open reservation
            </button>
            {onEditReservation ? (
              <button
                type="button"
                className="floor-table-day-action is-secondary"
                disabled={isSaving}
                onClick={(event) => {
                  event.stopPropagation()
                  onEditReservation(reservation)
                }}
                data-testid="floor-table-day-edit-reservation"
                aria-label={`Edit reservation for ${guestName}`}
              >
                ✏ Edit
              </button>
            ) : null}
            {row.quickActions?.map((action) => (
              <button
                key={action.id}
                type="button"
                className={getQuickActionClassName(action)}
                disabled={isSaving}
                onClick={() => onQuickStatusUpdate?.(reservation, action.status)}
              >
                {action.label}
              </button>
            ))}
            {canManageAssignment ? (
              <button
                type="button"
                className="floor-table-day-action is-secondary is-release"
                disabled={isSaving}
                onClick={() => onReleaseTable?.(reservation)}
                data-testid="floor-table-day-release-table"
              >
                {releaseLabel}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="floor-table-day-seating-select-hint">Tap to review assignment</p>
        )}
      </div>
    </li>
  )
}

export function formatTableDayViewCapacity(table) {
  const minGuests = Math.max(0, Number(table.minGuests ?? table.min_guests) || 0)
  const maxGuests = Math.max(
    minGuests,
    Number(table.maxGuestCapacity ?? table.maxGuests ?? table.seatedCapacity) || 0,
  )

  if (maxGuests > 0) return `Capacity ${maxGuests}`
  return 'Capacity varies'
}

export function HostTableInspectorContent({
  table,
  tableLabel,
  areaLabel = '',
  dateLabel = '',
  rows = [],
  assignmentContext = null,
  onNewReservation,
  onOpenReservation,
  onEditReservation,
  onQuickStatusUpdate,
  onReleaseTable,
  onClose,
  isSaving = false,
  canManageAssignment = true,
  variant = 'drawer',
  nowMinutes = 0,
  todayKey = '',
  floorLayout = null,
  reservationSeatings = [],
  titleId = 'host-table-inspector-title',
  animateEntrance = true,
}) {
  const safeRows = Array.isArray(rows) ? rows : []
  const releaseTableLabel = formatHostListUnitLabel(tableLabel?.replace(/^TABLE\s*/i, 'T') ?? table?.label ?? '')
  const needsSeatingChoice = Boolean(assignmentContext?.reservation) && !assignmentContext?.seatingId
  const tableCapacity = table ? formatTableDayViewCapacity(table) : ''
  const guestCount = Math.max(0, Number(assignmentContext?.reservation?.guests) || 0)
  const assignmentCapacityLabel = assignmentContext?.reservation && tableCapacity
    ? `${tableCapacity} · Guests ${guestCount}`
    : ''

  const accessibleTitle = tableLabel
    ? `Table ${tableLabel.replace(/^TABLE\s*/i, '')} details`
    : 'Table details'

  return (
    <>
      <header className="host-table-inspector-header floor-table-seating-dialog-header">
        <div className="floor-table-seating-dialog-heading">
          <h3 id={titleId}>{tableLabel}</h3>
          <span className="host-table-inspector-accessible-title">{accessibleTitle}</span>
          <ul className="floor-table-day-header-meta">
            {areaLabel ? (
              <li className="floor-table-day-header-meta-item">
                <span aria-hidden="true">📍</span>
                {areaLabel}
              </li>
            ) : null}
            {table ? (
              <li className="floor-table-day-header-meta-item">
                <span aria-hidden="true">👥</span>
                {tableCapacity}
              </li>
            ) : null}
            {dateLabel ? (
              <li className="floor-table-day-header-meta-item">
                <span aria-hidden="true">📅</span>
                {dateLabel}
              </li>
            ) : null}
          </ul>
          {needsSeatingChoice ? (
            <p className="floor-table-day-assignment-hint" data-testid="floor-table-day-choose-seating">
              Choose a seating
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="floor-table-seating-dialog-close"
          onClick={onClose}
          aria-label="Close table inspector"
          data-testid="floor-table-day-close"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      {variant === 'drawer' ? <InspectorSummary rows={safeRows} /> : null}

      {safeRows.length > 0 ? (
        <ul
          className={`floor-table-seating-dialog-list floor-table-day-list host-table-inspector-list${animateEntrance ? ' is-initial' : ''}`}
          aria-label="Table day seatings"
        >
          {safeRows.map((row) => (
            <TableDayViewRow
              key={row.seating.id}
              row={row}
              tableLabel={releaseTableLabel}
              isSaving={isSaving}
              canManageAssignment={canManageAssignment}
              assignmentContext={assignmentContext}
              onNewReservation={onNewReservation}
              onOpenReservation={onOpenReservation}
              onEditReservation={onEditReservation}
              onQuickStatusUpdate={onQuickStatusUpdate}
              onReleaseTable={onReleaseTable}
              nowMinutes={nowMinutes}
              todayKey={todayKey}
              floorLayout={floorLayout}
              reservationSeatings={reservationSeatings}
              tableCapacityLabel={assignmentCapacityLabel}
            />
          ))}
        </ul>
      ) : (
        <p className="floor-table-seating-dialog-empty">No active seatings configured for this date.</p>
      )}
    </>
  )
}

export function useHostTableInspectorEscape(onClose, isOpen = false) {
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return undefined

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])
}
