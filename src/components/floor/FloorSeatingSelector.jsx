import { formatSeatingChipLabel } from '../../lib/reservationSeatings'

export function FloorSeatingSelector({
  seatings = [],
  dateKey,
  selectedSeatingId = null,
  onSelect,
  summaries = {},
}) {
  if (!seatings.length) return null

  return (
    <section className="floor-seating-selector" aria-label="Today's seatings">
      <p className="floor-seating-selector-label">Today&apos;s seatings</p>
      <div className="floor-seating-selector-scroll" role="group" aria-label="Service seating">
        {seatings.map((seating) => {
          const summary = summaries[seating.id]
          const summaryLabel = summary?.bookedCovers != null && summary?.totalCapacity != null
            ? `${summary.bookedCovers}/${summary.totalCapacity} covers`
            : summary?.occupiedTables != null && summary?.totalTables != null
              ? `${summary.occupiedTables}/${summary.totalTables} tables`
              : ''

          return (
            <button
              key={seating.id}
              type="button"
              className={`floor-seating-selector-chip${selectedSeatingId === seating.id ? ' is-active' : ''}`}
              onClick={() => onSelect?.(seating.id)}
              aria-pressed={selectedSeatingId === seating.id}
            >
              <span className="floor-seating-selector-chip-label">{formatSeatingChipLabel(seating)}</span>
              {summaryLabel ? (
                <span className="floor-seating-selector-chip-summary">{summaryLabel}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
