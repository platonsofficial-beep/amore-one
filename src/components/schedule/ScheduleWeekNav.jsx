import { t } from '../../i18n/i18n'
export function ScheduleWeekNav({
  isWeekUpdating = false,
  isViewingCurrentWeek = false,
  onPreviousWeek,
  onGoToCurrentWeek,
  onNextWeek,
}) {
  return (
    <div className="mobile-week-nav" role="group" aria-label={t("Week navigation")}>
      <button
        type="button"
        className="mobile-week-nav-btn mobile-week-nav-btn-text"
        onClick={onPreviousWeek}
        disabled={isWeekUpdating}
      >
        {t("‹ Prev")}
      </button>
      <button
        type="button"
        className={`mobile-week-nav-btn mobile-week-nav-btn-text${isViewingCurrentWeek ? ' is-active' : ''}`}
        onClick={onGoToCurrentWeek}
        disabled={isWeekUpdating || isViewingCurrentWeek}
      >
        {t("This week")}
      </button>
      <button
        type="button"
        className="mobile-week-nav-btn mobile-week-nav-btn-text"
        onClick={onNextWeek}
        disabled={isWeekUpdating}
      >
        {t("Next ›")}
      </button>
    </div>
  )
}
