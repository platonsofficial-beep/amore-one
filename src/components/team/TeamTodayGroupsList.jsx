function TeamTodayMemberRow({ member }) {
  const stateLabel = `${member.shiftStateLabel ?? ''}`.trim()
  const stateTone = member.shiftState ?? 'scheduled'

  return (
    <li className="team-today-member">
      <div className="team-today-member-main">
        <div className="team-today-member-title-row">
          <span className="team-today-member-name">{member.name}</span>
          {stateLabel ? (
            <span className={`team-today-member-state tone-${stateTone}`}>
              {stateLabel}
            </span>
          ) : null}
        </div>
        <span className="team-today-member-shift">{member.shiftLabel}</span>
      </div>
      {member.roleLabel ? (
        <span className="team-today-member-role">{member.roleLabel}</span>
      ) : null}
    </li>
  )
}

export function TeamTodayGroupsList({
  groups = [],
  listClassName = 'team-today-member-list',
  groupClassName = 'team-today-group',
  departmentClassName = 'team-today-department',
}) {
  if (!groups.length) return null

  return (
    <div className="team-today-groups">
      {groups.map((group) => (
        <section
          key={group.department}
          className={groupClassName}
          aria-label={group.department}
        >
          <div className="team-today-department-row">
            <h3 className={departmentClassName}>{group.department}</h3>
            {group.coverageHint ? (
              <span className={`team-today-department-hint tone-${group.coverageTone ?? 'warn'}`}>
                {group.coverageHint}
              </span>
            ) : null}
          </div>
          <ul className={listClassName}>
            {group.members.map((member) => (
              <TeamTodayMemberRow key={member.shiftId} member={member} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
