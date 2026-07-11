export function HostQueueServiceSummary({
  expectedGuests = 0,
  expectedAssignedTables = 0,
  totalPublishedTables = 0,
  inHouseGuests = 0,
}) {
  return (
    <div className="host-queue-service-summary" aria-label="Service summary">
      <span className="host-queue-metric">
        <span className="host-queue-metric-icon" aria-hidden="true">👥</span>
        <strong>{expectedGuests}</strong>
        <span className="host-queue-metric-label">expected</span>
      </span>
      <span className="host-queue-metric">
        <span className="host-queue-metric-icon" aria-hidden="true">🍽</span>
        <strong>{expectedAssignedTables}/{totalPublishedTables}</strong>
        <span className="host-queue-metric-label">tables</span>
      </span>
      <span className="host-queue-metric">
        <span className="host-queue-metric-icon" aria-hidden="true">🪑</span>
        <strong>{inHouseGuests}</strong>
        <span className="host-queue-metric-label">in house</span>
      </span>
    </div>
  )
}
