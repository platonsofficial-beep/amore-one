const SUMMARY_ITEMS = [
  { key: 'totalCovers', label: 'Covers' },
  { key: 'upcomingArrivals', label: 'Upcoming' },
  { key: 'seatedGuests', label: 'Seated' },
  { key: 'waitingLateCount', label: 'Wait/Late', warnWhenPositive: true },
  { key: 'completedTables', label: 'Done' },
]

export function HostManagerSummaryBar({ summary, problemsCount = 0 }) {
  if (!summary) return null

  const attentionCount = Number(summary.needsAttention) || 0
  const problems = Number(problemsCount) || 0

  return (
    <div className="host-manager-summary-bar" aria-label="Reservations summary">
      {SUMMARY_ITEMS.map((item) => {
        const value = summary[item.key] ?? 0
        const isWarn = item.warnWhenPositive ? value > 0 : item.key === 'unassigned' && value > 0

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
      {Number(summary.unassigned) > 0 ? (
        <div className="host-manager-summary-item is-warn" role="status">
          <span className="host-manager-summary-value">{summary.unassigned}</span>
          <span className="host-manager-summary-label">Unassigned</span>
        </div>
      ) : null}
      {attentionCount > 0 ? (
        <div className="host-manager-summary-item is-warn" role="status">
          <span className="host-manager-summary-value">{attentionCount}</span>
          <span className="host-manager-summary-label">Need attention</span>
        </div>
      ) : null}
      {problems > 0 ? (
        <div className="host-manager-summary-item is-problems" role="status">
          <span className="host-manager-summary-value">{problems}</span>
          <span className="host-manager-summary-label">Problems</span>
        </div>
      ) : null}
    </div>
  )
}
