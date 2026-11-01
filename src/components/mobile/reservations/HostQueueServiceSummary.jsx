// Emojis plus words (Platon t370u):
// "👥 75 guests · 🍽 3 tables booked · 🪑 0 seated · 👤 0 in house"
export function HostQueueServiceSummary({
  expectedGuests = 0,
  reservedTables = 0,
  totalPublishedTables = 0,
  freeTables = 0,
  seatedTables = 0,
  inHouseGuests = 0,
  className = '',
}) {
  const tablesTitle = totalPublishedTables
    ? `${reservedTables} of ${totalPublishedTables} tables booked · ${freeTables} free`
    : `${reservedTables} tables booked`
  return (
    <div className={`host-queue-service-summary${className ? ` ${className}` : ''}`} aria-label="Service summary">
      <span className="host-queue-metric">
        <span className="host-queue-metric-icon" aria-hidden="true">👥</span>
        <strong>{expectedGuests}</strong>
        <span className="host-queue-metric-label">{expectedGuests === 1 ? 'guest' : 'guests'}</span>
      </span>
      <span className="host-queue-metric" title={tablesTitle}>
        <span className="host-queue-metric-icon" aria-hidden="true">🍽</span>
        <strong>{reservedTables}</strong>
        <span className="host-queue-metric-label">{reservedTables === 1 ? 'table booked' : 'tables booked'}</span>
      </span>
      <span className="host-queue-metric">
        <span className="host-queue-metric-icon" aria-hidden="true">🪑</span>
        <strong>{seatedTables}</strong>
        <span className="host-queue-metric-label">seated</span>
      </span>
      <span className="host-queue-metric">
        <span className="host-queue-metric-icon" aria-hidden="true">👤</span>
        <strong>{inHouseGuests}</strong>
        <span className="host-queue-metric-label">in house</span>
      </span>
    </div>
  )
}
