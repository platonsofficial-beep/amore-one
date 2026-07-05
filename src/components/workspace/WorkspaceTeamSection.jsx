function countActiveStaff(employees = []) {
  return employees.filter((employee) => {
    const status = `${employee?.status ?? ''}`.trim().toLowerCase()
    if (!status) return true
    return status === 'working' || status === 'active'
  }).length
}

export function WorkspaceTeamSection({
  employees = [],
  managerName = '',
  onManageStaff,
}) {
  const totalStaff = employees.length
  const activeStaff = countActiveStaff(employees)
  const trimmedManager = `${managerName ?? ''}`.trim()

  return (
    <>
      <div className="workspace-section-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h3 className="workspace-section-heading">
            <span className="workspace-section-icon" aria-hidden="true">👥</span>
            Team
          </h3>
          <p className="workspace-section-subtitle">
            Staff overview from your connected roster.
          </p>
        </div>
        <button type="button" className="ghost-btn workspace-action-btn workspace-link-btn" onClick={onManageStaff}>
          Manage Staff →
        </button>
      </div>

      <div className="workspace-team-grid">
        <article className="workspace-stat-card panel staff-panel">
          <p className="workspace-stat-label">Total staff</p>
          <p className="workspace-stat-value">{totalStaff}</p>
        </article>
        <article className="workspace-stat-card panel staff-panel">
          <p className="workspace-stat-label">Active staff</p>
          <p className="workspace-stat-value">{totalStaff > 0 ? activeStaff : '—'}</p>
        </article>
        <article className="workspace-stat-card panel staff-panel workspace-stat-card-wide">
          <p className="workspace-stat-label">Manager</p>
          <p className="workspace-stat-value workspace-stat-value-text">
            {trimmedManager || 'Not set — configure in Business Profile'}
          </p>
        </article>
      </div>
    </>
  )
}
