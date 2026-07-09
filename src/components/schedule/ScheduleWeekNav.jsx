export function ScheduleWeekNav({
  isWeekUpdating = false,
  isViewingCurrentWeek = false,
  onPreviousWeek,
  onGoToCurrentWeek,
  onNextWeek,
}) {
  return (
    <div className="mobile-week-nav" role="group" aria-label="Week navigation">
      <button
        type="button"
        className="mobile-week-nav-btn mobile-week-nav-btn-text"
        onClick={onPreviousWeek}
        disabled={isWeekUpdating}
      >
        ‹ Prev
      </button>
      <button
        type="button"
        className={`mobile-week-nav-btn mobile-week-nav-btn-text${isViewingCurrentWeek ? ' is-active' : ''}`}
        onClick={onGoToCurrentWeek}
        disabled={isWeekUpdating || isViewingCurrentWeek}
      >
        This week
      </button>
      <button
        type="button"
        className="mobile-week-nav-btn mobile-week-nav-btn-text"
        onClick={onNextWeek}
        disabled={isWeekUpdating}
      >
        Next ›
      </button>
    </div>
  )
}
