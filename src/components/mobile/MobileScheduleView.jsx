export function MobileScheduleView({
  weekLabel = '',
  employeeName = '',
  days = [],
  needsEmployeeLink = false,
  isWeekPublished = false,
  isLoading = false,
  canOpenFullSchedule = false,
  onOpenFullSchedule,
  onPreviousWeek,
  onNextWeek,
}) {
  if (isLoading) {
    return (
      <div className="mobile-screen mobile-schedule">
        <p className="mobile-empty-note">Loading schedule…</p>
      </div>
    )
  }

  if (needsEmployeeLink) {
    return (
      <div className="mobile-screen mobile-schedule">
        <header className="mobile-screen-header mobile-schedule-header">
          <div>
            <p className="mobile-screen-eyebrow">My schedule</p>
            <h1 className="mobile-screen-title">Your week</h1>
            {weekLabel ? <p className="mobile-screen-subtitle">{weekLabel}</p> : null}
          </div>
          <div className="mobile-week-nav" aria-label="Week navigation">
            <button type="button" className="mobile-week-nav-btn" onClick={onPreviousWeek} aria-label="Previous week">
              ‹
            </button>
            <button type="button" className="mobile-week-nav-btn" onClick={onNextWeek} aria-label="Next week">
              ›
            </button>
          </div>
        </header>

        <section className="mobile-card tone-neutral">
          <p className="mobile-card-detail">Link your employee profile to view your schedule</p>
        </section>
      </div>
    )
  }

  return (
    <div className="mobile-screen mobile-schedule">
      <header className="mobile-screen-header mobile-schedule-header">
        <div>
          <p className="mobile-screen-eyebrow">My schedule</p>
          <h1 className="mobile-screen-title">{employeeName || 'Your week'}</h1>
          {weekLabel ? <p className="mobile-screen-subtitle">{weekLabel}</p> : null}
        </div>
        <div className="mobile-week-nav" aria-label="Week navigation">
          <button type="button" className="mobile-week-nav-btn" onClick={onPreviousWeek} aria-label="Previous week">
            ‹
          </button>
          <button type="button" className="mobile-week-nav-btn" onClick={onNextWeek} aria-label="Next week">
            ›
          </button>
        </div>
      </header>

      {!isWeekPublished ? (
        <section className="mobile-card tone-neutral">
          <h2 className="mobile-card-headline">Schedule not published</h2>
          <p className="mobile-card-detail">Published shifts will appear here when your manager releases the schedule.</p>
        </section>
      ) : (
        <div className="mobile-schedule-days">
          {days.map((day) => (
            <article
              key={day.date}
              className={`mobile-schedule-day${day.isDayOff ? ' is-off' : ' has-shifts'}`}
            >
              <div className="mobile-schedule-day-head">
                <div>
                  <p className="mobile-schedule-day-label">{day.dayLabel}</p>
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
                      <span>{shift.role}</span>
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
