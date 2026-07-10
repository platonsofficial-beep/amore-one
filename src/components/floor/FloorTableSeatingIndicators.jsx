import { formatTime24 } from '../../lib/timeFormatUtils'

export function FloorTableSeatingIndicators({ indicators = [] }) {
  if (!indicators.length) return null

  return (
    <div className="floor-table-seating-indicators" aria-hidden="true">
      {indicators.map((indicator) => (
        <span
          key={indicator.seatingId}
          className={`floor-table-seating-indicator is-${indicator.state || 'empty'}`}
          title={indicator.ariaLabel}
          aria-label={indicator.ariaLabel}
        />
      ))}
    </div>
  )
}

export function formatFloorTableSeatingIndicatorTooltip(indicator) {
  if (!indicator) return ''
  if (indicator.reservation) {
    return `${indicator.seatingName} · Reserved by ${indicator.reservation.guestName || 'Guest'} at ${formatTime24(indicator.reservation.time)}`
  }
  return `${indicator.seatingName} · Available`
}
