function ScheduleWeekNav({
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

function ScheduleWeekHeader({
  employeeName = '',
  weekLabel = '',
  isWeekUpdating = false,
  isWeekNavigationDisabled = false,
  isViewingCurrentWeek = false,
  onPreviousWeek,
  onGoToCurrentWeek,
  onNextWeek,
}) {
  return (
    <>
      <header className="mobile-screen-header mobile-schedule-header">
        <div className="mobile-schedule-title-block">
          <p className="mobile-screen-eyebrow">My schedule</p>
          <h1 className="mobile-screen-title">{employeeName || 'Your week'}</h1>
          {weekLabel ? <p className="mobile-screen-subtitle">{weekLabel}</p> : null}
          {isWeekUpdating ? (
            <p className="mobile-week-updating" aria-live="polite">Updating…</p>
          ) : null}
        </div>
      </header>

      <ScheduleWeekNav
        isWeekUpdating={isWeekNavigationDisabled}
        isViewingCurrentWeek={isViewingCurrentWeek}
        onPreviousWeek={onPreviousWeek}
        onGoToCurrentWeek={onGoToCurrentWeek}
        onNextWeek={onNextWeek}
      />
    </>
  )
}

export function MobileScheduleView({
  weekLabel = '',
  employeeName = '',
  days = [],
  needsEmployeeLink = false,
  isWeekPublished = false,
  isWeekUpdating = false,
  isViewingCurrentWeek = false,
  canOpenFullSchedule = false,
  onOpenFullSchedule,
  onPreviousWeek,
  onGoToCurrentWeek,
  onNextWeek,
}) {
  const showUnpublishedMessage = !isWeekUpdating && !isWeekPublished

  if (needsEmployeeLink) {
    return (
      <div className="mobile-screen mobile-schedule">
        <ScheduleWeekHeader
          employeeName="Your week"
          weekLabel={weekLabel}
          isWeekUpdating={isWeekUpdating}
          isWeekNavigationDisabled={isWeekUpdating}
          isViewingCurrentWeek={isViewingCurrentWeek}
          onPreviousWeek={onPreviousWeek}
          onGoToCurrentWeek={onGoToCurrentWeek}
          onNextWeek={onNextWeek}
        />

        <section className="mobile-card tone-neutral">
          <p className="mobile-card-detail">Link your employee profile to view your schedule</p>
        </section>
      </div>
    )
  }

  return (
    <div className="mobile-screen mobile-schedule">
      <ScheduleWeekHeader
        employeeName={employeeName}
        weekLabel={weekLabel}
        isWeekUpdating={isWeekUpdating}
        isWeekNavigationDisabled={isWeekUpdating}
        isViewingCurrentWeek={isViewingCurrentWeek}
        onPreviousWeek={onPreviousWeek}
        onGoToCurrentWeek={onGoToCurrentWeek}
        onNextWeek={onNextWeek}
      />

      {showUnpublishedMessage ? (
        <section className="mobile-card tone-neutral">
          <h2 className="mobile-card-headline">Schedule not published</h2>
          <p className="mobile-card-detail">Published shifts will appear here when your manager releases the schedule.</p>
        </section>
      ) : days.length === 0 ? (
        <section className="mobile-card tone-neutral">
          <h2 className="mobile-card-headline">No shifts this week</h2>
          <p className="mobile-card-detail">You have no published shifts for this week. Check another week or ask your manager if something looks wrong.</p>
        </section>
      ) : (
        <div className="mobile-schedule-days">
          {days.map((day) => (
            <article
              key={day.date}
              className={`mobile-schedule-day${day.isDayOff ? ' is-off' : ' has-shifts'}${day.isToday ? ' is-today' : ''}`}
            >
              <div className="mobile-schedule-day-head">
                <div>
                  <div className="mobile-schedule-day-title-row">
                    <p className="mobile-schedule-day-label">{day.dayLabel}</p>
                    {day.isToday ? <span className="mobile-schedule-today-badge">Today</span> : null}
                  </div>
                  <p className="mobile-schedule-day-date">{day.shortDate}</p>
                </div>
                <span className="mobile-schedule-day-status">
                  {day.isDayOff ? 'Off' : `${day.shifts.length} shift${day.shifts.length === 1 ? '' : 's'}`}
                </span>
              </div>
              {day.isDayOff ? (
                <p className="mobile-schedule-day-off">No shift scheduled</p>
              ) : (
                <ul className="mobile-schedule-shift-list">
                  {day.shifts.map((shift) => (
                    <li key={shift.shiftId ?? `${day.date}-${shift.startTime}`} className="mobile-schedule-shift-item">
                      <strong>{shift.startTimeLabel} - {shift.endTimeLabel}</strong>
                      <span>{shift.positionAreaLabel ?? shift.position ?? shift.role ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}

      {canOpenFullSchedule ? (
        <button type="button" className="mobile-secondary-btn" onClick={onOpenFullSchedule}>
          Open full team schedule
        </button>
      ) : null}
    </div>
  )
}
