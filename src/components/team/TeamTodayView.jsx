import { TeamTodayGroupsList } from './TeamTodayGroupsList'

export function TeamTodayView({
  teamStatus,
  teamTodayGroups,
  isLoading,
  noticeMessage,
}) {
  const status = teamStatus ?? {
    scheduleLabel: 'Working now',
    scheduleValue: 'No one on shift',
    nextShiftLabel: 'Next shift',
    nextShiftValue: 'No more shifts today',
    coverageLabel: 'Coverage',
    coverageValue: 'All covered',
    coverageTone: 'ok',
    coverageDetail: '',
  }

  return (
    <section className="team-today-page" aria-label="Team today">
      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading today&apos;s team…</div> : null}

      <section className="team-today-status-card" aria-label="Team status">
        <div className="team-today-status-row">
          <span className="team-today-status-label">{status.scheduleLabel}</span>
          <span className="team-today-status-value">{status.scheduleValue}</span>
        </div>
        <div className="team-today-status-row">
          <span className="team-today-status-label">{status.nextShiftLabel}</span>
          <span className="team-today-status-value">{status.nextShiftValue}</span>
        </div>
        <div className="team-today-status-row">
          <span className="team-today-status-label">{status.coverageLabel}</span>
          <span className={`team-today-status-value tone-${status.coverageTone}`}>
            {status.coverageValue}
          </span>
        </div>
        {status.coverageDetail && status.coverageTone !== 'ok' ? (
          <p className="team-today-status-detail">{status.coverageDetail}</p>
        ) : null}
      </section>

      {isLoading ? null : (teamTodayGroups ?? []).length === 0 ? (
        <p className="team-today-empty">No shifts scheduled today.</p>
      ) : (
        <TeamTodayGroupsList groups={teamTodayGroups} />
      )}
    </section>
  )
}
