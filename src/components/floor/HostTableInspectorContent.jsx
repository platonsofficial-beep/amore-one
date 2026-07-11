import { useEffect } from 'react'
import { resolveHostFloorSelectionSeatingLabel } from '../../lib/hostFloorSelectionBar'
import {
  buildHostTableInspectorContextStrip,
  resolveInspectorPrimaryRowId,
  sortInspectorRowsForPresentation,
  formatInspectorExtraChairLabel,
} from '../../lib/hostTableInspectorUtils'
import { formatHostListUnitLabel, getReservationSeatingAssignment } from '../../lib/seatingAssignment'
import { formatHostAssignmentActionLabel } from '../../lib/hostAssignmentPanelUtils'
import {
  getHostFloorSelectionStatusPresentation,
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
  className = '',
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
      className={`host-reservation-card-status-pill floor-table-day-status-pill selected-reservation-status tone-${tone} is-compact is-readonly${severity ? ` is-late-${severity}` : ''}${className ? ` ${className}` : ''}`}
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

function buildInspectorDetailItems(
  reservation,
  assignedTablesLabel,
  {
    reservationSeatings = [],
    dateKey = '',
    hideSeatingName = false,
  } = {},
) {
  if (!reservation) return []

  const items = []
  const arrivalTime = reservation?.time ? formatTime24(reservation.time) : null
  const guestCount = Math.max(0, Number(reservation?.guests) || 0)
  const assignment = getReservationSeatingAssignment(reservation)
  const extraChairs = Math.max(0, Number(assignment?.extraChairs) || 0)
  const standingGuests = Math.max(0, Number(assignment?.standingGuests) || 0)
  const tableChip = getTableChipMeta(reservation, assignedTablesLabel)
  const extraChairLabel = formatInspectorExtraChairLabel(extraChairs)
  const seatingLabel = hideSeatingName
    ? ''
    : resolveHostFloorSelectionSeatingLabel(reservation, reservationSeatings, dateKey)

  if (arrivalTime) {
    items.push({ id: 'time', icon: '🕣', label: arrivalTime })
  }
  if (guestCount > 0) {
    items.push({
      id: 'guests',
      icon: '👤',
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
  if (extraChairLabel) {
    items.push({ id: 'extra-chair', icon: '🪑', label: extraChairLabel })
  }
  if (standingGuests > 0) {
    items.push({
      id: 'standing',
      icon: '🧍',
      label: `${standingGuests} standing guest${standingGuests === 1 ? '' : 's'}`,
    })
  }
  if (seatingLabel) {
    items.push({ id: 'seating', icon: '🍷', label: seatingLabel })
  }

  return items
}

function InspectorContextStrip({ rows = [] }) {
  const strip = buildHostTableInspectorContextStrip(rows)
  if (!strip?.contextLine) return null

  return (
    <div className="host-table-inspector-context" data-testid="host-table-inspector-context">
      <p className="host-table-inspector-context-line">{strip.contextLine}</p>
      {strip.guestLine ? (
        <p className="host-table-inspector-context-guest">{strip.guestLine}</p>
      ) : null}
    </div>
  )
}

function OccupiedReservationActions({
  reservation,
  guestName,
  row,
  isSaving,
  canManageAssignment,
  releaseLabel,
  onOpenReservation,
  onEditReservation,
  onQuickStatusUpdate,
  onReleaseTable,
  useHierarchy = false,
}) {
  const quickActions = row.quickActions ?? []
  const dangerActions = quickActions.filter((action) => action.variant === 'danger')
  const secondaryActions = quickActions.filter((action) => action.variant !== 'danger')

  if (!useHierarchy) {
    return (
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
        {quickActions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={action.variant === 'danger' ? 'floor-table-day-action is-danger' : 'floor-table-day-action is-secondary'}
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
    )
  }

  return (
    <div className="floor-table-day-row-actions is-hierarchy">
      <button
        type="button"
        className="floor-table-day-action is-primary is-full-width"
        disabled={isSaving}
        onClick={() => onOpenReservation?.(reservation)}
        data-testid="floor-table-day-open-reservation"
      >
        Open reservation
      </button>
      {(onEditReservation || secondaryActions.length > 0) ? (
        <div className="floor-table-day-row-actions-secondary">
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
          {secondaryActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="floor-table-day-action is-secondary"
              disabled={isSaving}
              onClick={() => onQuickStatusUpdate?.(reservation, action.status)}
            >
              {action.label === 'Complete' ? '✓ Complete' : action.label}
            </button>
          ))}
        </div>
      ) : null}
      {dangerActions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="floor-table-day-action is-danger"
          disabled={isSaving}
          onClick={() => onQuickStatusUpdate?.(reservation, action.status)}
        >
          {action.label}
        </button>
      ))}
      {canManageAssignment ? (
        <button
          type="button"
          className="floor-table-day-action is-release-muted"
          disabled={isSaving}
          onClick={() => onReleaseTable?.(reservation)}
          data-testid="floor-table-day-release-table"
        >
          {releaseLabel}
        </button>
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
        <h4 className="floor-table-day-guest-name">{guestName}</h4>
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
  reservationSeatings = [],
  tableCapacityLabel = '',
  isHeroPrimary = false,
  useDrawerHierarchy = false,
}) {
  const { seating, reservation, conflicts, hasConflict, isAvailable, timeWindowLabel, state } = row
  const isAssignmentMode = Boolean(assignmentContext?.reservation)
  const isAssignmentSelected = assignmentContext?.seatingId === seating.id
  const releaseLabel = tableLabel ? `Release ${tableLabel}` : 'Release table'
  const guestName = reservation?.guestName || 'Guest'
  const infoItems = buildInspectorDetailItems(reservation, row.assignedTablesLabel, {
    reservationSeatings,
    dateKey: todayKey,
    hideSeatingName: isHeroPrimary || useDrawerHierarchy,
  })
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
    return (
      <li className="floor-table-day-row is-assignment-pending is-hero-primary" data-testid="floor-table-day-row-assignment">
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
        className={getAssignmentRowClassName(
          `floor-table-day-row is-available${useDrawerHierarchy ? ' is-compact-available-row' : ''}`,
          { isAssignmentMode, isAssignmentSelected },
        )}
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
        {useDrawerHierarchy ? null : <TableDayViewRowDivider />}
        <div className={`floor-table-day-row-body${useDrawerHierarchy ? ' is-compact-available' : ''}`}>
          <div className="host-table-inspector-available-inline">
            <TableDayViewStatusPill
              presentation={availablePresentation}
              className="is-compact-available-status"
            />
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
        </div>
      </li>
    )
  }

  return (
    <li
      className={getAssignmentRowClassName(
        `floor-table-day-row is-${state}${isHeroPrimary ? ' is-hero-primary' : ''}`,
        { isAssignmentMode, isAssignmentSelected },
      )}
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
          <h4 className="floor-table-day-guest-name">{guestName}</h4>
          {row.statusLabel ? (
            <TableDayViewStatusPill
              reservation={reservation}
              nowMinutes={nowMinutes}
              todayKey={todayKey}
              className="is-headline-status"
            />
          ) : null}
        </div>

        <TableDayViewInfoList items={infoItems} />

        {row.hasNotes ? (
          <p className="floor-table-day-row-notes" aria-label="Reservation has notes">Notes</p>
        ) : null}

        {!isAssignmentMode ? (
          <OccupiedReservationActions
            reservation={reservation}
            guestName={guestName}
            row={row}
            isSaving={isSaving}
            canManageAssignment={canManageAssignment}
            releaseLabel={releaseLabel}
            onOpenReservation={onOpenReservation}
            onEditReservation={onEditReservation}
            onQuickStatusUpdate={onQuickStatusUpdate}
            onReleaseTable={onReleaseTable}
            useHierarchy={useDrawerHierarchy && isHeroPrimary}
          />
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
  const useDrawerHierarchy = variant === 'drawer'
  const displayRows = useDrawerHierarchy
    ? sortInspectorRowsForPresentation(safeRows)
    : safeRows
  const primaryRowId = useDrawerHierarchy ? resolveInspectorPrimaryRowId(safeRows) : null
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
      <header className={`host-table-inspector-header floor-table-seating-dialog-header${useDrawerHierarchy ? ' is-compact' : ''}`}>
        <div className="floor-table-seating-dialog-heading">
          <h3 id={titleId}>{tableLabel}</h3>
          <span className="host-table-inspector-accessible-title">{accessibleTitle}</span>
          {useDrawerHierarchy ? (
            <div className="host-table-inspector-header-meta">
              {(areaLabel || table) ? (
                <div className="host-table-inspector-meta-line">
                  {areaLabel ? <span><span aria-hidden="true">📍 </span>{areaLabel}</span> : null}
                  {table ? <span><span aria-hidden="true">👥 </span>{tableCapacity}</span> : null}
                </div>
              ) : null}
              {dateLabel ? (
                <div className="host-table-inspector-meta-line is-date">
                  <span aria-hidden="true">📅 </span>
                  {dateLabel}
                </div>
              ) : null}
            </div>
          ) : (
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
          )}
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

      {useDrawerHierarchy ? <InspectorContextStrip rows={safeRows} /> : null}

      {displayRows.length > 0 ? (
        <ul
          className={`floor-table-seating-dialog-list floor-table-day-list host-table-inspector-list${animateEntrance ? ' is-initial' : ''}`}
          aria-label="Table day seatings"
        >
          {displayRows.map((row) => (
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
              reservationSeatings={reservationSeatings}
              tableCapacityLabel={assignmentCapacityLabel}
              isHeroPrimary={primaryRowId != null && row.seating.id === primaryRowId}
              useDrawerHierarchy={useDrawerHierarchy}
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
