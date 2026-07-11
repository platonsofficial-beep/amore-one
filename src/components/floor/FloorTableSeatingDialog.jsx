import { createPortal } from 'react-dom'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { formatHostListUnitLabel, getReservationSeatingAssignment } from '../../lib/seatingAssignment'
import { formatHostAssignmentActionLabel } from '../../lib/hostAssignmentPanelUtils'
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

function TableDayViewStatusPill({ presentation }) {
  if (!presentation) return null

  return (
    <span
      className={`host-reservation-card-status-pill floor-table-day-status-pill tone-${presentation.tone} is-compact is-readonly`}
      aria-label={`Status: ${presentation.label}`}
    >
      {`${presentation.dot} ${presentation.label}`}
    </span>
  )
}

function buildTableDayViewInfoItems(reservation, assignedTablesLabel) {
  if (!reservation) return []

  const guestCount = Math.max(0, Number(reservation?.guests) || 0)
  const arrivalTime = reservation?.time ? formatTime24(reservation.time) : null
  const assignment = getReservationSeatingAssignment(reservation)
  const extraChairs = Math.max(0, Number(assignment?.extraChairs) || 0)
  const tableChip = getTableChipMeta(reservation, assignedTablesLabel)
  const items = []

  if (arrivalTime) {
    items.push({ id: 'time', icon: '🕣', label: arrivalTime })
  }
  if (guestCount > 0) {
    items.push({
      id: 'guests',
      icon: '👥',
      label: `${guestCount} ${guestCount === 1 ? 'guest' : 'guests'}`,
    })
  }
  if (tableChip) {
    items.push({
      id: 'table',
      icon: '🍽',
      label: `${tableChip.prefix} ${tableChip.value}`,
    })
  }
  if (extraChairs > 0) {
    items.push({
      id: 'extra-chair',
      icon: '🪑',
      label: `+${extraChairs} Extra chair${extraChairs === 1 ? '' : 's'}`,
    })
  }

  return items
}

function TableDayViewAssignmentRow({
  row,
  assignmentReservation,
  tableLabel,
  draftTableLabels = '',
  isSaving,
  canAssign = true,
  onConfirmAssignment,
  onCancelAssignment,
}) {
  const { seating, timeWindowLabel } = row
  const guestName = assignmentReservation?.guestName || 'Guest'
  const infoItems = buildTableDayViewInfoItems(assignmentReservation, '')

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

        <TableDayViewInfoList items={infoItems} />

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

export function formatTableDayViewCapacity(table) {
  const minGuests = Math.max(0, Number(table.minGuests ?? table.min_guests) || 0)
  const maxGuests = Math.max(
    minGuests,
    Number(table.maxGuestCapacity ?? table.maxGuests ?? table.seatedCapacity) || 0,
  )

  if (maxGuests > 0) return `Capacity ${maxGuests}`
  return 'Capacity varies'
}

export function getFloorTableSeatingDialogOverlayClass(isPhone) {
  return `floor-table-seating-dialog-overlay${isPhone ? ' is-phone' : ' is-tablet'}`
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
}) {
  const { seating, reservation, conflicts, hasConflict, isAvailable, timeWindowLabel, state } = row
  const isAssignmentMode = Boolean(assignmentContext?.reservation)
  const isAssignmentSelected = assignmentContext?.seatingId === seating.id
  const releaseLabel = tableLabel ? `Release ${tableLabel}` : 'Release table'
  const guestName = reservation?.guestName || 'Guest'
  const infoItems = buildTableDayViewInfoItems(reservation, row.assignedTablesLabel)
  const statusPresentation = getTableDayViewStatusPresentation({
    statusLabel: row.statusLabel,
    state,
    isAvailable,
  })

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
    const rowClassName = getAssignmentRowClassName(
      'floor-table-day-row is-assignment-pending',
      { isAssignmentMode, isAssignmentSelected },
    )

    return (
      <li className={rowClassName} data-testid="floor-table-day-row-assignment">
        <TableDayViewAssignmentRow
          row={row}
          assignmentReservation={assignmentContext.reservation}
          tableLabel={assignmentContext.tableLabel}
          draftTableLabels={assignmentContext.draftTableLabels}
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
        className={getAssignmentRowClassName('floor-table-day-row is-available is-centered', {
          isAssignmentMode,
          isAssignmentSelected,
        })}
        data-testid="floor-table-day-row-available"
        role={isAssignmentMode ? 'button' : undefined}
        tabIndex={isAssignmentMode ? 0 : undefined}
        onClick={isAssignmentMode ? handleSelectSeating : undefined}
        onKeyDown={isAssignmentMode ? handleSelectSeatingKeyDown : undefined}
      >
        <div className="floor-table-day-available-body">
          <strong className="floor-table-day-seating-name">{seating.name}</strong>
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
        <h4 className="floor-table-day-guest-name">
          <span className="floor-table-day-guest-icon" aria-hidden="true">👤</span>
          {guestName}
        </h4>

        <TableDayViewInfoList items={infoItems} />

        {row.statusLabel ? (
          <TableDayViewStatusPill presentation={statusPresentation} />
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
                Edit
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

export function FloorTableSeatingDialog({
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
}) {
  const isPhone = useMediaQuery('(max-width: 720px)')
  const overlayClassName = getFloorTableSeatingDialogOverlayClass(isPhone)
  const safeRows = Array.isArray(rows) ? rows : []
  const releaseTableLabel = formatHostListUnitLabel(tableLabel?.replace(/^TABLE\s*/i, 'T') ?? table?.label ?? '')
  const needsSeatingChoice = Boolean(assignmentContext?.reservation) && !assignmentContext?.seatingId

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className={overlayClassName} role="presentation" data-testid="floor-table-seating-dialog">
      <button
        type="button"
        className="floor-table-seating-dialog-backdrop"
        onClick={onClose}
        aria-label="Close table day view"
      />
      <div
        className={`floor-table-seating-dialog floor-table-day-view${assignmentContext ? ' is-assignment-mode' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="floor-table-seating-dialog-title"
        onClick={(event) => event.stopPropagation()}
        data-testid="floor-table-day-view"
        data-assignment-mode={assignmentContext ? 'true' : 'false'}
      >
        <header className="floor-table-seating-dialog-header">
          <div className="floor-table-seating-dialog-heading">
            <h3 id="floor-table-seating-dialog-title">{tableLabel}</h3>
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
                  {formatTableDayViewCapacity(table)}
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
            aria-label="Close table day view"
            data-testid="floor-table-day-close"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        {safeRows.length > 0 ? (
          <ul className="floor-table-seating-dialog-list floor-table-day-list" aria-label="Table day seatings">
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
              />
            ))}
          </ul>
        ) : (
          <p className="floor-table-seating-dialog-empty">No active seatings configured for this date.</p>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function getFloorTableDialogLabel(table) {
  if (!table) return 'TABLE'
  const unitLabel = table.displayLabel ?? (table.unitType === 'table' ? `Table ${table.label}` : table.label)
  return formatHostListUnitLabel(unitLabel).toUpperCase()
}

export function formatFloorTableAreaLabel(layout, table) {
  if (!table?.zoneId || !layout?.zones?.length) return ''
  return layout.zones.find((zone) => zone.id === table.zoneId)?.label ?? ''
}
