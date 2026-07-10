import { useMediaQuery } from '../../lib/useMediaQuery'
import { formatHostListUnitLabel } from '../../lib/seatingAssignment'
import { getHostListStatusLabel } from '../../lib/reservationHostStatus'
import { formatTableConflictReason } from '../../lib/tableAvailability'
import { formatTime24 } from '../../lib/timeFormatUtils'

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

export function FloorTableSeatingDialog({
  table,
  tableLabel,
  areaLabel = '',
  rows = [],
  onNewReservation,
  onOpenReservation,
  onClose,
  isSaving = false,
}) {
  const isPhone = useMediaQuery('(max-width: 720px)')
  const overlayClassName = getFloorTableSeatingDialogOverlayClass(isPhone)
  const safeRows = Array.isArray(rows) ? rows : []

  return (
    <div className={overlayClassName} role="presentation" data-testid="floor-table-seating-dialog">
      <button
        type="button"
        className="floor-table-seating-dialog-backdrop"
        onClick={onClose}
        aria-label="Close table seating status"
      />
      <div
        className="floor-table-seating-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="floor-table-seating-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="floor-table-seating-dialog-header">
          <div className="floor-table-seating-dialog-heading">
            <h3 id="floor-table-seating-dialog-title">{tableLabel}</h3>
            {areaLabel ? (
              <p className="floor-table-seating-dialog-subtitle">{areaLabel}</p>
            ) : null}
            {table ? (
              <p className="floor-table-seating-dialog-capacity">{formatGuestRange(table)}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-btn floor-table-seating-dialog-close"
            onClick={onClose}
            aria-label="Close table seating status"
          >
            ✕
          </button>
        </header>

        {safeRows.length > 0 ? (
          <ul className="floor-table-seating-dialog-list" aria-label="Seating availability">
            {safeRows.map((row) => {
              const reservation = row.reservation
              const statusLabel = reservation
                ? getHostListStatusLabel(reservation.status)
                : 'Available'

              return (
                <li key={row.seating.id} className="floor-table-seating-dialog-item">
                  <div className="floor-table-seating-dialog-item-main">
                    <div className="floor-table-seating-dialog-item-head">
                      <strong>{row.seating.name}</strong>
                      <time>{row.timeLabel || formatTime24(row.seating.startTime)}</time>
                    </div>
                    {row.isAvailable ? (
                      <p className="floor-table-seating-dialog-status is-available">Available</p>
                    ) : (
                      <button
                        type="button"
                        className="floor-table-seating-dialog-reserved"
                        disabled={isSaving}
                        onClick={() => onOpenReservation?.(reservation)}
                      >
                        <span className="floor-table-seating-dialog-status is-reserved">Reserved</span>
                        <span className="floor-table-seating-dialog-reserved-copy">
                          {reservation?.guestName || 'Guest'}
                          {' · '}
                          {Math.max(0, Number(reservation?.guests) || 0)} guests
                          {' · '}
                          {statusLabel}
                        </span>
                      </button>
                    )}
                  </div>
                  {row.isAvailable ? (
                    <button
                      type="button"
                      className="floor-table-seating-dialog-action"
                      disabled={isSaving}
                      onClick={() => onNewReservation?.(row.seating)}
                    >
                      New reservation
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="floor-table-seating-dialog-empty">No active seatings configured for this date.</p>
        )}
      </div>
    </div>
  )
}

export function getFloorTableDialogLabel(table) {
  if (!table) return 'TABLE'
  const unitLabel = table.displayLabel ?? (table.unitType === 'table' ? `Table ${table.label}` : table.label)
  return `${unitLabel}`.toUpperCase()
}

export function formatFloorTableAreaLabel(layout, table) {
  if (!table?.zoneId || !layout?.zones?.length) return ''
  return layout.zones.find((zone) => zone.id === table.zoneId)?.label ?? ''
}

export { formatTableConflictReason, formatHostListUnitLabel }
