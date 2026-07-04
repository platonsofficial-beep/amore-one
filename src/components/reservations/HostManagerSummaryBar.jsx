const SUMMARY_ITEMS = [
  { key: 'totalReservations', label: 'Bookings' },
  { key: 'totalGuests', label: 'Guests' },
  { key: 'seated', label: 'Seated' },
  { key: 'unassigned', label: 'Unassigned', warnWhenPositive: true },
  { key: 'needsAttention', label: 'Attention', warnWhenPositive: true },
]

export function HostManagerSummaryBar({ summary }) {
  if (!summary) return null

  return (
    <div className="host-manager-summary-bar" aria-label="Manager summary">
      {SUMMARY_ITEMS.map((item) => {
        const value = summary[item.key] ?? 0
        const isWarn = item.warnWhenPositive && value > 0

        return (
          <div
            key={item.key}
            className={`host-manager-summary-item${isWarn ? ' is-warn' : ''}`}
          >
            <span className="host-manager-summary-value">{value}</span>
            <span className="host-manager-summary-label">{item.label}</span>
          </div>
        )
      })}
    </div>
  )
}
