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
          const summaryCount = summary?.bookedCovers != null && summary?.totalCapacity != null
            ? `${summary.bookedCovers}/${summary.totalCapacity}`
            : summary?.occupiedTables != null && summary?.totalTables != null
              ? `${summary.occupiedTables}/${summary.totalTables}`
              : ''

          return (
            <button
              key={seating.id}
              type="button"
              className={`floor-seating-selector-chip${selectedSeatingId === seating.id ? ' is-active' : ''}`}
              onClick={() => onSelect?.(seating.id)}
              aria-pressed={selectedSeatingId === seating.id}
            >
              <span className="floor-seating-selector-chip-name">{seating.name}</span>
              <span className="floor-seating-selector-chip-time">{seating.startTime}</span>
              {summaryCount ? (
                <span className="floor-seating-selector-chip-count">{summaryCount}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
