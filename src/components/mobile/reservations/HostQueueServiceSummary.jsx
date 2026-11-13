import { t } from '../../../i18n/i18n'
// Emojis plus words (Platon t370u):
// "👥 75 guests · 🍽 3/49 tables · 🪑 0 seated · 👤 0 in house"
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
    <div className={`host-queue-service-summary${className ? ` ${className}` : ''}`} aria-label={t("Service summary")}>
      <span className="host-queue-metric">
        <span className="host-queue-metric-icon" aria-hidden="true">👥</span>
        <strong>{expectedGuests}</strong>
        <span className="host-queue-metric-label">{expectedGuests === 1 ? 'guest' : 'guests'}</span>
      </span>
      <span className="host-queue-metric" title={tablesTitle}>
        <span className="host-queue-metric-icon" aria-hidden="true">🍽</span>
        <strong>{totalPublishedTables ? `${reservedTables}/${totalPublishedTables}` : reservedTables}</strong>
        <span className="host-queue-metric-label">{t("tables")}</span>
      </span>
      <span className="host-queue-metric">
        <span className="host-queue-metric-icon" aria-hidden="true">🪑</span>
        <strong>{seatedTables}</strong>
        <span className="host-queue-metric-label">{t("seated")}</span>
      </span>
      <span className="host-queue-metric">
        <span className="host-queue-metric-icon" aria-hidden="true">👤</span>
        <strong>{inHouseGuests}</strong>
        <span className="host-queue-metric-label">{t("in house")}</span>
      </span>
    </div>
  )
}
