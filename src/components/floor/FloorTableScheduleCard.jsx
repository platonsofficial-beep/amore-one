function ScheduleEntryActions({
  entry,
  isSaving,
  onCompleteReservation,
  onEditReservation,
  onSeatGuests,
}) {
  if (entry.actionKind === 'seated') {
    return (
      <div className="floor-table-schedule-card-actions">
        <button
          type="button"
          className="floor-table-schedule-card-action is-primary"
          disabled={isSaving}
          onClick={() => onCompleteReservation?.(entry.reservation)}
        >
          Complete
        </button>
        <button
          type="button"
          className="floor-table-schedule-card-action"
          disabled={isSaving}
          onClick={() => onEditReservation?.(entry.reservation)}
        >
          Edit
        </button>
      </div>
    )
  }

  if (entry.actionKind === 'upcoming') {
    return (
      <div className="floor-table-schedule-card-actions">
        <button
          type="button"
          className="floor-table-schedule-card-action is-primary"
          disabled={isSaving}
          onClick={() => onSeatGuests?.(entry.reservation)}
        >
          Seat guests
        </button>
        <button
          type="button"
          className="floor-table-schedule-card-action"
          disabled={isSaving}
          onClick={() => onEditReservation?.(entry.reservation)}
        >
          Edit
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      className="floor-table-schedule-card-edit"
      disabled={isSaving}
      onClick={() => onEditReservation?.(entry.reservation)}
    >
      Edit
    </button>
  )
}

export function FloorTableScheduleCard({
  tableLabel,
  entries = [],
  onEditReservation,
  onSeatGuests,
  onCompleteReservation,
  onNewReservation,
  onClose,
  isSaving = false,
}) {
  const safeEntries = Array.isArray(entries)
    ? entries.filter((entry) => entry && entry.id && entry.reservation)
    : []

  return (
    <div className="floor-table-schedule-card-overlay" role="presentation">
      <button
        type="button"
        className="floor-table-schedule-card-backdrop"
        onClick={onClose}
        aria-label="Close table schedule"
      />
      <div
        className="floor-table-schedule-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="floor-table-schedule-card-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="floor-table-schedule-card-header">
          <div className="floor-table-schedule-card-heading">
            <h3 id="floor-table-schedule-card-title">{tableLabel}</h3>
            <p className="floor-table-schedule-card-subtitle">
              {safeEntries.length > 0
                ? `${safeEntries.length} reservation${safeEntries.length === 1 ? '' : 's'} today`
                : 'No reservations today'}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn floor-table-schedule-card-close"
            onClick={onClose}
            aria-label="Close table schedule"
          >
            ✕
          </button>
        </header>

        {safeEntries.length > 0 ? (
          <ol className="floor-table-schedule-card-timeline" aria-label="Table reservations">
            {safeEntries.map((entry, index) => (
              <li
                key={entry.id}
                className={`floor-table-schedule-card-item${entry.isHighlighted ? ' is-active' : ''}`}
              >
                <div className="floor-table-schedule-card-rail" aria-hidden="true">
                  <span className="floor-table-schedule-card-dot" />
                  {index < safeEntries.length - 1 ? (
                    <span className="floor-table-schedule-card-line" />
                  ) : null}
                </div>

                <article className="floor-table-schedule-card-body">
                  <div className="floor-table-schedule-card-row floor-table-schedule-card-row-head">
                    <time className="floor-table-schedule-card-time">{entry.time}</time>
                    <span className="floor-table-schedule-card-status">
                      {entry.statusLabel}
                    </span>
                  </div>
                  <strong className="floor-table-schedule-card-guest">{entry.guestName}</strong>
                  <div className="floor-table-schedule-card-details">
                    <span className="floor-table-schedule-card-guests">{entry.guests} guests</span>
                    <span className="floor-table-schedule-card-sep" aria-hidden="true">·</span>
                    <span className="floor-table-schedule-card-tables">{entry.tablesLabel || '—'}</span>
                  </div>
                  <ScheduleEntryActions
                    entry={entry}
                    isSaving={isSaving}
                    onCompleteReservation={onCompleteReservation}
                    onEditReservation={onEditReservation}
                    onSeatGuests={onSeatGuests}
                  />
                </article>
              </li>
            ))}
          </ol>
        ) : (
          <p className="floor-table-schedule-card-empty">No reservations for this table today.</p>
        )}

        <footer className="floor-table-schedule-card-footer">
          <button
            type="button"
            className="floor-table-schedule-card-new"
            disabled={isSaving}
            onClick={() => onNewReservation?.()}
          >
            + New reservation
          </button>
        </footer>
      </div>
    </div>
  )
}
