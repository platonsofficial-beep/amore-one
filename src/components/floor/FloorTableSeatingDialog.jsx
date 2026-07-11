import { createPortal } from 'react-dom'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { formatHostListUnitLabel, getReservationSeatingAssignment } from '../../lib/seatingAssignment'
import { formatTime24 } from '../../lib/timeFormatUtils'

function TableDayViewAssignmentRow({
  row,
  assignmentReservation,
  tableLabel,
  draftTableLabels = '',
  isSaving,
  onConfirmAssignment,
  onCancelAssignment,
}) {
  const { seating, timeWindowLabel } = row
  const guestName = assignmentReservation?.guestName || 'Guest'
  const guestCount = Math.max(0, Number(assignmentReservation?.guests) || 0)
  const arrivalTime = assignmentReservation?.time ? formatTime24(assignmentReservation.time) : null
  const assignLabel = tableLabel ? `Assign to ${tableLabel}` : 'Assign to table'
  const confirmLabel = draftTableLabels?.includes('+')
    ? `Confirm seating (${draftTableLabels})`
    : assignLabel

  return (
    <li className="floor-table-day-row is-assignment-pending" data-testid="floor-table-day-row-assignment">
      <div className="floor-table-day-row-head">
        <strong className="floor-table-day-seating-name">{seating.name}</strong>
        <time className="floor-table-day-seating-time">{timeWindowLabel}</time>
      </div>

      <div className="floor-table-day-guest-row">
        <h4 className="floor-table-day-guest-name">{guestName}</h4>
      </div>

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

      <div className="floor-table-day-row-actions">
        <button
          type="button"
          className="floor-table-day-action is-primary"
          disabled={isSaving}
          onClick={onConfirmAssignment}
          data-testid="floor-table-day-assign-reservation"
        >
          {confirmLabel}
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
    </li>
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

function formatGuestRange(table) {
  const minGuests = Math.max(0, Number(table.minGuests ?? table.min_guests) || 0)
  const maxGuests = Math.max(
    minGuests,
    Number(table.maxGuestCapacity ?? table.maxGuests ?? table.seatedCapacity) || 0,
  )

  if (minGuests > 0 && maxGuests > minGuests) {
    return `${minGuests}–${maxGuests} guests`
  }

  if (maxGuests > 0) return `Up to ${maxGuests} guests`
  return 'Capacity varies'
}

export function getFloorTableSeatingDialogOverlayClass(isPhone) {
  return `floor-table-seating-dialog-overlay${isPhone ? ' is-phone' : ' is-tablet'}`
}

function getQuickActionClassName(action) {
  if (action.variant === 'danger') return 'floor-table-day-quick-action is-danger'
  return 'floor-table-day-quick-action is-secondary'
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

  if (
    assignmentContext?.reservation
    && assignmentContext.seatingId === seating.id
  ) {
    return (
      <TableDayViewAssignmentRow
        row={row}
        assignmentReservation={assignmentContext.reservation}
        tableLabel={assignmentContext.tableLabel}
        draftTableLabels={assignmentContext.draftTableLabels}
        isSaving={isSaving}
        onConfirmAssignment={assignmentContext.onConfirmAssignment}
        onCancelAssignment={assignmentContext.onCancelAssignment}
      />
    )
  }
  const releaseLabel = tableLabel ? `Release ${tableLabel}` : 'Release table'
  const guestName = reservation?.guestName || 'Guest'
  const guestCount = Math.max(0, Number(reservation?.guests) || 0)
  const arrivalTime = reservation?.time ? formatTime24(reservation.time) : null
  const tableChip = getTableChipMeta(reservation, row.assignedTablesLabel)

  const handleEditReservation = (event) => {
    event.stopPropagation()
    onEditReservation?.(reservation)
  }

  if (hasConflict) {
    return (
      <li className="floor-table-day-row is-problem" data-testid="floor-table-day-row-problem">
        <div className="floor-table-day-row-head">
          <strong className="floor-table-day-seating-name">{seating.name}</strong>
          <time className="floor-table-day-seating-time">{timeWindowLabel}</time>
        </div>
        <span className="floor-table-day-status-badge is-problem">Problem</span>
        <p className="floor-table-day-row-lead">Overlapping reservations</p>
        <ul className="floor-table-day-conflict-list">
          {conflicts.map((conflictReservation) => (
            <li key={conflictReservation.id}>
              <button
                type="button"
                className="floor-table-day-conflict-btn"
                disabled={isSaving}
                onClick={() => onOpenReservation?.(conflictReservation)}
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
      </li>
    )
  }

  if (isAvailable) {
    return (
      <li className="floor-table-day-row is-available" data-testid="floor-table-day-row-available">
        <div className="floor-table-day-row-head">
          <strong className="floor-table-day-seating-name">{seating.name}</strong>
          <time className="floor-table-day-seating-time">{timeWindowLabel}</time>
        </div>
        <span className="floor-table-day-status-badge is-available">Available</span>
        <div className="floor-table-day-row-footer">
          <button
            type="button"
            className="floor-table-day-action is-primary is-compact"
            disabled={isSaving}
            onClick={() => onNewReservation?.(seating)}
            data-testid="floor-table-day-new-reservation"
          >
            + New reservation
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className={`floor-table-day-row is-${state}`} data-testid="floor-table-day-row-occupied">
      <div className="floor-table-day-row-head">
        <strong className="floor-table-day-seating-name">{seating.name}</strong>
        <time className="floor-table-day-seating-time">{timeWindowLabel}</time>
      </div>

      <div className="floor-table-day-guest-row">
        <h4 className="floor-table-day-guest-name">{guestName}</h4>
        {onEditReservation ? (
          <button
            type="button"
            className="floor-table-day-edit-btn"
            disabled={isSaving}
            onClick={handleEditReservation}
            data-testid="floor-table-day-edit-reservation"
            aria-label={`Edit reservation for ${guestName}`}
          >
            <span className="floor-table-day-edit-btn-icon" aria-hidden="true">✏</span>
            Edit
          </button>
        ) : null}
      </div>

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

      {tableChip ? (
        <div className="floor-table-day-table-chip">
          <span className="floor-table-day-table-chip-label">{tableChip.prefix}</span>
          <span className="floor-table-day-table-chip-separator" aria-hidden="true">·</span>
          <span className="floor-table-day-table-chip-value">{tableChip.value}</span>
        </div>
      ) : null}

      {row.statusLabel ? (
        <span className={`floor-table-day-status-badge is-${state}`}>{row.statusLabel}</span>
      ) : null}

      {row.hasNotes ? (
        <p className="floor-table-day-row-notes" aria-label="Reservation has notes">Notes</p>
      ) : null}

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
            className="floor-table-day-action is-release"
            disabled={isSaving}
            onClick={() => onReleaseTable?.(reservation)}
            data-testid="floor-table-day-release-table"
          >
            {releaseLabel}
          </button>
        ) : null}
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
            {areaLabel || table ? (
              <p className="floor-table-seating-dialog-subtitle">
                {[areaLabel, table ? formatGuestRange(table) : ''].filter(Boolean).join(' · ')}
              </p>
            ) : null}
            {dateLabel ? (
              <p className="floor-table-seating-dialog-date">{dateLabel}</p>
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
