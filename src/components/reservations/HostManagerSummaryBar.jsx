export function HostManagerSummaryBar({ summary, dashboard = null, problemsCount = 0 }) {
  if (!summary && !dashboard) return null

  if (dashboard) {
    const peak = dashboard.peakSeating

    return (
      <div className="host-service-dashboard" aria-label="Host service dashboard">
        <div className="host-service-dashboard-row">
          <span className="host-service-dashboard-tag">Today</span>
          <span>Expected {dashboard.expectedGuests}</span>
          <span>·</span>
          <span>Arrived {dashboard.arrivedGuests}</span>
          <span>·</span>
          <span>Remaining {dashboard.remainingGuests}</span>
          <span>·</span>
          <span>Seated {dashboard.seatedGuests}</span>
        </div>
        <div className="host-service-dashboard-row">
          <span>Reservations {dashboard.totalReservations}</span>
          <span>·</span>
          <span>Upcoming {dashboard.upcomingCount}</span>
          <span>·</span>
          <span>Arrived {dashboard.arrivedCount}</span>
          <span>·</span>
          <span>Seated {dashboard.seatedCount}</span>
          <span>·</span>
          <span>Completed {dashboard.completedCount}</span>
          {dashboard.problemsCount > 0 ? (
            <>
              <span>·</span>
              <span className="host-service-dashboard-problems">Problems {dashboard.problemsCount}</span>
            </>
          ) : null}
        </div>
        <div className="host-service-dashboard-row">
          <span>Tables {dashboard.totalTables}</span>
          <span>·</span>
          <span>Free {dashboard.availableTables}</span>
          <span>·</span>
          <span>Reserved {dashboard.reservedTables}</span>
          <span>·</span>
          <span>Occupied {dashboard.occupiedTables}</span>
        </div>
        {peak?.covers > 0 ? (
          <div className="host-service-dashboard-row is-peak">
            <span>Peak: {peak.name} · {peak.startTime} · {peak.covers} covers</span>
          </div>
        ) : null}
      </div>
    )
  }

  const attentionCount = Number(summary.needsAttention) || 0
  const problems = Number(problemsCount) || 0

  return (
    <div className="host-manager-summary-bar" aria-label="Reservations summary">
      <div className="host-manager-summary-item">
        <span className="host-manager-summary-value">{summary.totalCovers ?? 0}</span>
        <span className="host-manager-summary-label">Covers</span>
      </div>
      <div className="host-manager-summary-item">
        <span className="host-manager-summary-value">{summary.upcomingArrivals ?? 0}</span>
        <span className="host-manager-summary-label">Upcoming</span>
      </div>
      <div className="host-manager-summary-item">
        <span className="host-manager-summary-value">{summary.seatedGuests ?? 0}</span>
        <span className="host-manager-summary-label">Seated</span>
      </div>
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
