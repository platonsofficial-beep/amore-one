const SUMMARY_ITEMS = [
  { key: 'totalReservations', label: 'Reservations' },
  { key: 'totalGuests', label: 'Guests' },
  { key: 'inHouse', label: 'In House' },
]

export function HostManagerSummaryBar({ summary }) {
  if (!summary) return null

  const attentionCount = Number(summary.needsAttention) || 0

  return (
    <div className="host-manager-summary-bar" aria-label="Reservations summary">
      {SUMMARY_ITEMS.map((item) => {
        const value = summary[item.key] ?? 0

        return (
          <div key={item.key} className="host-manager-summary-item">
            <span className="host-manager-summary-value">{value}</span>
            <span className="host-manager-summary-label">{item.label}</span>
          </div>
        )
      })}
      {attentionCount > 0 ? (
        <div className="host-manager-summary-item is-warn" role="status">
          <span className="host-manager-summary-value">{attentionCount}</span>
          <span className="host-manager-summary-label">Need attention</span>
        </div>
      ) : null}
    </div>
  )
}
