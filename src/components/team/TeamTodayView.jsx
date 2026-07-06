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
      </section>

      {isLoading ? null : (teamTodayGroups ?? []).length === 0 ? (
        <p className="team-today-empty">No shifts scheduled today.</p>
      ) : (
        <div className="team-today-groups">
          {(teamTodayGroups ?? []).map((group) => (
            <section key={group.department} className="team-today-group" aria-label={group.department}>
              <h3 className="team-today-department">{group.department}</h3>
              <ul className="team-today-member-list">
                {group.members.map((member) => (
                  <li key={member.shiftId} className="team-today-member">
                    <div className="team-today-member-main">
                      <span className="team-today-member-name">{member.name}</span>
                      <span className="team-today-member-shift">{member.shiftLabel}</span>
                    </div>
                    {member.roleLabel ? (
                      <span className="team-today-member-role">{member.roleLabel}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
