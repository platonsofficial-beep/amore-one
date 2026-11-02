export function HostQueueServiceSummary({
  expectedGuests = 0,
  reservedTables = 0,
  totalPublishedTables = 0,
  freeTables = 0,
  seatedTables = 0,
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
        <strong>{reservedTables}/{totalPublishedTables}</strong>
        <span className="host-queue-metric-label">tables · {freeTables} free</span>
      </span>
      <span className="host-queue-metric">
        <span className="host-queue-metric-icon" aria-hidden="true">🪑</span>
        <strong>{seatedTables}</strong>
        <span className="host-queue-metric-label">seated tables</span>
      </span>
      <span className="host-queue-metric">
        <span className="host-queue-metric-icon" aria-hidden="true">👤</span>
        <strong>{inHouseGuests}</strong>
        <span className="host-queue-metric-label">in house</span>
      </span>
    </div>
  )
}
