import { EmployeeAccountConnectionSection } from './EmployeeAccountConnectionSection'

const DEPARTMENT_FILTERS = ['All', 'Bar', 'Service', 'Kitchen', 'Management']

function getInitials(name) {
  const parts = `${name || ''}`.trim().split(/\s+/).filter(Boolean)

  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
  }

  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return (parts[0]?.[0] ?? 'G').toUpperCase()
}

function getEmployeePositionsLabel(employee) {
  const names = Array.isArray(employee.positions)
    ? employee.positions.map((position) => position.name).filter(Boolean)
    : []

  if (names.length > 0) return names.join(' · ')
  if (employee.position) return employee.position
  return 'No position assigned'
}

function formatEmployeeTodayShift(employee, employeeTodayShifts = {}) {
  const todayShift = employeeTodayShifts[String(employee.id)]
  return todayShift || 'Not scheduled'
}

export function TeamPeopleView({
  employees,
  totalEmployeeCount = 0,
  employeeTodayShifts = {},
  selectedEmployee,
  onSelectEmployee,
  activeFilter,
  onFilterChange,
  onOpenAddEmployee,
  onOpenEditEmployee,
  onRequestDeleteEmployee,
  isLoading,
  noticeMessage,
  isSaving,
  workspaceId = '',
  canManageInvites = false,
  canAssignManagerInviteRole = false,
}) {
  const hasActiveFilter = activeFilter !== 'All'
  const isRosterEmpty = !isLoading && totalEmployeeCount === 0
  const isFilteredEmpty = !isLoading && totalEmployeeCount > 0 && employees.length === 0
  return (
    <section className="team-people-page" aria-label="Team people">
      <div className="team-people-header">
        <div>
          <p className="eyebrow">People</p>
          <h3>Your team</h3>
          <p className="staff-subtitle">Tap a person to view details, edit, or remove.</p>
        </div>
        <button type="button" className="primary-btn" onClick={onOpenAddEmployee} disabled={isSaving}>
          {isSaving ? 'Saving…' : '+ Add Employee'}
        </button>
      </div>

      <div className="staff-toolbar team-people-toolbar">
        <div className="filter-group">
          {DEPARTMENT_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`filter-chip ${activeFilter === filter ? 'active' : ''}`}
              onClick={() => onFilterChange(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading staff roster…</div> : null}

      {isRosterEmpty ? (
        <div className="team-people-empty">
          <p>No employees yet.</p>
          <p className="team-people-empty-hint">Add your first team member, then assign a department and position.</p>
        </div>
      ) : isFilteredEmpty ? (
        <p className="team-people-empty">
          {hasActiveFilter
            ? 'No team members in this department. Try another filter or add someone new.'
            : 'No team members match your search.'}
        </p>
      ) : (
        <div className="team-people-grid">
          {employees.map((employee) => (
            <article key={employee.id} className="team-people-card">
              <div className="team-people-card-top">
                <div className="employee-photo">{getInitials(employee.name)}</div>
                <div className="team-people-card-identity">
                  <h4 className="team-people-card-name">{employee.name}</h4>
                  <p className="team-people-card-role">{getEmployeePositionsLabel(employee)}</p>
                  <p className="team-people-card-department">{employee.department}</p>
                </div>
              </div>

              <dl className="team-people-card-meta">
                <div className="team-people-card-meta-row">
                  <dt>Today</dt>
                  <dd>{formatEmployeeTodayShift(employee, employeeTodayShifts)}</dd>
                </div>
                <div className="team-people-card-meta-row">
                  <dt>Status</dt>
                  <dd>
                    <span className={`status-pill ${employee.status.toLowerCase().replace(/\s+/g, '-')}`}>
                      {employee.status}
                    </span>
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                className="team-people-card-action"
                onClick={() => onSelectEmployee(employee)}
              >
                Open
              </button>
            </article>
          ))}
        </div>
      )}

      {selectedEmployee ? (
        <div className="drawer-backdrop" onClick={() => onSelectEmployee(null)} />
      ) : null}

      {selectedEmployee ? (
        <aside className="employee-drawer">
          <div className="drawer-header">
            <div>
              <p className="eyebrow">Employee details</p>
              <h3>{selectedEmployee.name}</h3>
            </div>
            <button type="button" className="icon-btn" onClick={() => onSelectEmployee(null)}>✕</button>
          </div>

          <div className="drawer-profile">
            <div className="employee-photo large">{getInitials(selectedEmployee.name)}</div>
            <div>
              <strong>{getEmployeePositionsLabel(selectedEmployee)}</strong>
              <p>{selectedEmployee.department}</p>
            </div>
          </div>

          <div className="drawer-grid">
            <div className="drawer-row"><span>Full Name</span><strong>{selectedEmployee.name}</strong></div>
            <div className="drawer-row"><span>Positions</span><strong>{getEmployeePositionsLabel(selectedEmployee)}</strong></div>
            <div className="drawer-row"><span>Phone</span><strong>{selectedEmployee.phone}</strong></div>
            <div className="drawer-row"><span>Email</span><strong>{selectedEmployee.email}</strong></div>
            <div className="drawer-row"><span>Hire Date</span><strong>{selectedEmployee.hireDate}</strong></div>
            <div className="drawer-row"><span>Salary</span><strong>{selectedEmployee.salary}</strong></div>
            <div className="drawer-row"><span>Emergency Contact</span><strong>{selectedEmployee.emergencyContact}</strong></div>
            <div className="drawer-row"><span>Weekly Hours</span><strong>{selectedEmployee.weeklyHours}</strong></div>
            <div className="drawer-row"><span>Today</span><strong>{formatEmployeeTodayShift(selectedEmployee, employeeTodayShifts)}</strong></div>
            <div className="drawer-row"><span>Status</span><strong>{selectedEmployee.status}</strong></div>
          </div>

          <div className="drawer-notes">
            <p className="eyebrow">Notes</p>
            <p>{selectedEmployee.notes}</p>
          </div>

          <EmployeeAccountConnectionSection
            employee={selectedEmployee}
            workspaceId={workspaceId}
            canManageInvites={canManageInvites}
            canAssignManagerRole={canAssignManagerInviteRole}
          />

          <div className="action-group" style={{ marginTop: '16px' }}>
            <button type="button" className="ghost-btn" onClick={() => onOpenEditEmployee(selectedEmployee)}>Edit</button>
            <button type="button" className="ghost-btn" onClick={() => onRequestDeleteEmployee(selectedEmployee)}>Delete</button>
          </div>
        </aside>
      ) : null}
    </section>
  )
}
