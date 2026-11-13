import { t } from '../../i18n/i18n'
export function HostManagerSummaryBar({
  dashboard = null,
  dailySnapshot = null,
  upcomingNext30Min = 0,
  isViewingToday = true,
}) {
  if (!dashboard && !dailySnapshot) return null

  const totalCovers = Number(dailySnapshot?.totalCovers ?? dashboard?.expectedGuests) || 0
  const seatedCount = Number(dashboard?.seatedCount ?? dailySnapshot?.seatedTables) || 0
  const waitingCount = Number(dailySnapshot?.waitingCount) || 0
  const lateCount = Number(dailySnapshot?.lateCount) || 0
  const upcomingCount = Number(upcomingNext30Min ?? dailySnapshot?.upcomingArrivals) || 0
  const freeTables = Number(dashboard?.availableTables) || 0

  return (
    <div className="host-operational-summary" aria-label={t("Live operational summary")}>
      <div className="host-operational-summary-heading">
        <span className="host-operational-summary-tag">{isViewingToday ? t('Today') : t('Service')}</span>
        <span className="host-operational-summary-covers">
          <strong>{totalCovers}</strong>
          {' '}
          {t('Covers')}
        </span>
      </div>

      <div className="host-operational-summary-grid" role="list">
        <div className="host-operational-summary-stat" role="listitem">
          <strong>{seatedCount}</strong>
          <span>{t("Seated")}</span>
        </div>
        <div
          className={`host-operational-summary-stat${waitingCount === 0 ? ' is-muted' : ''}`}
          role="listitem"
        >
          <strong>{waitingCount}</strong>
          <span>{t("Waiting")}</span>
        </div>
        <div className="host-operational-summary-stat" role="listitem">
          <strong>{upcomingCount}</strong>
          <span>{t("Upcoming (next 30 min)")}</span>
        </div>
        <div
          className={`host-operational-summary-stat${lateCount === 0 ? ' is-muted' : ''}`}
          role="listitem"
        >
          <strong>{lateCount}</strong>
          <span>{t("Late")}</span>
        </div>
        <div className="host-operational-summary-stat" role="listitem">
          <strong>{freeTables}</strong>
          <span>{t("Free Tables")}</span>
        </div>
      </div>
    </div>
  )
}
