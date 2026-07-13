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

function handleEmployeeCardKeyDown(event, employee, onSelectEmployee) {
  if (event.key !== 'Enter' && event.key !== ' ') return

  event.preventDefault()
  onSelectEmployee(employee)
}

function isEmployeeWorkingNow(employee) {
  const status = `${employee?.status ?? ''}`.trim().toLowerCase()
  if (!status) return true
  return status === 'working' || status === 'active'
}

function countUniqueDepartments(employeeList = []) {
  const departments = new Set()

  employeeList.forEach((employee) => {
    const department = `${employee?.department ?? ''}`.trim()
    if (department) departments.add(department)
  })

  return departments.size
}

function formatTeamPeopleMetrics(employeeCount, workingCount, departmentCount) {
  const employeeLabel = employeeCount === 1 ? 'Employee' : 'Employees'
  const departmentLabel = departmentCount === 1 ? 'Department' : 'Departments'

  return `${employeeCount} ${employeeLabel} • ${workingCount} Working now • ${departmentCount} ${departmentLabel}`
}

function formatDrawerFieldValue(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) return '—'

  const normalized = raw.toLowerCase()
  if (
    normalized === 'not provided'
    || normalized === 'no notes yet'
    || normalized === 'n/a'
    || normalized === 'tbd'
  ) {
    return '—'
  }

  return raw
}

function getPrimaryPositionLabel(employee) {
  const primary = `${employee?.primaryPosition ?? ''}`.trim()
  if (primary) return primary

  const positions = Array.isArray(employee?.positions)
    ? employee.positions.map((position) => `${position?.name ?? ''}`.trim()).filter(Boolean)
    : []

  if (positions.length > 0) return positions[0]

  const legacyPosition = `${employee?.position ?? ''}`.trim()
  if (!legacyPosition) return ''

  return legacyPosition.split(',')[0].trim()
}

function getAdditionalPositionsLabel(employee) {
  const additional = Array.isArray(employee?.additionalPositions)
    ? employee.additionalPositions.map((name) => `${name ?? ''}`.trim()).filter(Boolean)
    : []

  if (additional.length > 0) {
    return additional.join(' · ')
  }

  const positions = Array.isArray(employee?.positions)
    ? employee.positions.map((position) => `${position?.name ?? ''}`.trim()).filter(Boolean)
    : []

  const primary = getPrimaryPositionLabel(employee).toLowerCase()
  const rest = positions.filter((name) => name.toLowerCase() !== primary)

  if (rest.length > 0) return rest.join(' · ')

  const legacyPosition = `${employee?.position ?? ''}`.trim()
  if (!legacyPosition.includes(',')) return ''

  return legacyPosition
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name && name.toLowerCase() !== primary)
    .join(' · ')
}

function getStatusClassName(status) {
  return `status-pill ${`${status ?? ''}`.trim().toLowerCase().replace(/\s+/g, '-')}`
}

function EmployeeProfileDrawerField({ label, children }) {
  return (
    <div className="employee-profile-drawer-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function EmployeeProfileDrawerSection({ title, children }) {
  return (
    <section className="employee-profile-drawer-section">
      <h4 className="employee-profile-drawer-section-title">{title}</h4>
      <dl className="employee-profile-drawer-fields">
        {children}
      </dl>
    </section>
  )
}

export function TeamPeopleView({
  employees,
  rosterEmployees = [],
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
  searchTerm = '',
  onSearchTermChange,
  searchPlaceholder = 'Search employee',
}) {
  const hasActiveFilter = activeFilter !== 'All'
  const isRosterEmpty = !isLoading && totalEmployeeCount === 0
  const isFilteredEmpty = !isLoading && totalEmployeeCount > 0 && employees.length === 0
  const metricsSource = rosterEmployees.length > 0 ? rosterEmployees : employees
  const employeeCount = totalEmployeeCount
  const workingCount = metricsSource.filter(isEmployeeWorkingNow).length
  const departmentCount = countUniqueDepartments(metricsSource)
  const metricsLine = formatTeamPeopleMetrics(employeeCount, workingCount, departmentCount)
  const showSearch = typeof onSearchTermChange === 'function'

  return (
    <section className="team-people-page" aria-label="Team people">
      <div className="team-people-header">
        <div className="team-people-header-copy">
          <p className="eyebrow">People</p>
          <h3>Your team</h3>
          <p className="team-people-metrics">{metricsLine}</p>
        </div>
        <div className="team-people-header-actions">
          <button type="button" className="primary-btn team-people-add-btn" onClick={onOpenAddEmployee} disabled={isSaving}>
            {isSaving ? 'Saving…' : '+ Add Employee'}
          </button>
        </div>
      </div>

      <div className="team-people-controls">
        {showSearch ? (
          <label className="team-people-search search-bar" aria-label="Search employees">
            <span className="team-people-search-icon" aria-hidden="true">⌕</span>
            <input
              type="search"
              className="team-people-search-input"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
            />
          </label>
        ) : null}

        <div className="staff-toolbar team-people-toolbar">
          <div className="filter-group team-people-filter-group">
            {DEPARTMENT_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                className={`filter-chip team-people-filter-chip ${activeFilter === filter ? 'active' : ''}`}
                onClick={() => onFilterChange(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
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
            <article
              key={employee.id}
              className="team-people-card"
              role="button"
              tabIndex={0}
              aria-label={`View ${employee.name}`}
              onClick={() => onSelectEmployee(employee)}
              onKeyDown={(event) => handleEmployeeCardKeyDown(event, employee, onSelectEmployee)}
            >
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

              <span className="team-people-card-action" aria-hidden="true">
                Open
              </span>
            </article>
          ))}
        </div>
      )}

      {selectedEmployee ? (
        <div className="drawer-backdrop" onClick={() => onSelectEmployee(null)} />
      ) : null}

      {selectedEmployee ? (
        <aside className="employee-drawer employee-profile-drawer" aria-label={`${selectedEmployee.name} profile`}>
          <div className="employee-profile-drawer-top">
            <p className="eyebrow">Employee profile</p>
            <button
              type="button"
              className="icon-btn employee-profile-drawer-close"
              onClick={() => onSelectEmployee(null)}
              aria-label="Close employee profile"
            >
              ✕
            </button>
          </div>

          <header className="employee-profile-drawer-identity">
            <div className="employee-photo large">{getInitials(selectedEmployee.name)}</div>
            <div className="employee-profile-drawer-identity-copy">
              <h3 className="employee-profile-drawer-name">{selectedEmployee.name}</h3>
              <p className="employee-profile-drawer-role">{formatDrawerFieldValue(getPrimaryPositionLabel(selectedEmployee))}</p>
              <p className="employee-profile-drawer-department">{formatDrawerFieldValue(selectedEmployee.department)}</p>
              <div className="employee-profile-drawer-identity-meta">
                <span className={getStatusClassName(selectedEmployee.status)}>
                  {formatDrawerFieldValue(selectedEmployee.status)}
                </span>
                <span className="employee-profile-drawer-today">
                  Today · {formatEmployeeTodayShift(selectedEmployee, employeeTodayShifts)}
                </span>
              </div>
            </div>
          </header>

          <div className="employee-profile-drawer-body">
            <EmployeeProfileDrawerSection title="Profile">
              <EmployeeProfileDrawerField label="Primary position">
                {formatDrawerFieldValue(getPrimaryPositionLabel(selectedEmployee))}
              </EmployeeProfileDrawerField>
              <EmployeeProfileDrawerField label="Additional positions">
                {formatDrawerFieldValue(getAdditionalPositionsLabel(selectedEmployee))}
              </EmployeeProfileDrawerField>
              <EmployeeProfileDrawerField label="Department">
                {formatDrawerFieldValue(selectedEmployee.department)}
              </EmployeeProfileDrawerField>
              <EmployeeProfileDrawerField label="Status">
                <span className={getStatusClassName(selectedEmployee.status)}>
                  {formatDrawerFieldValue(selectedEmployee.status)}
                </span>
              </EmployeeProfileDrawerField>
            </EmployeeProfileDrawerSection>

            <EmployeeProfileDrawerSection title="Employment">
              <EmployeeProfileDrawerField label="Start date">
                {formatDrawerFieldValue(selectedEmployee.hireDate)}
              </EmployeeProfileDrawerField>
              <EmployeeProfileDrawerField label="Salary">
                {formatDrawerFieldValue(selectedEmployee.salary)}
              </EmployeeProfileDrawerField>
              <EmployeeProfileDrawerField label="Weekly hours">
                {formatDrawerFieldValue(selectedEmployee.weeklyHours)}
              </EmployeeProfileDrawerField>
            </EmployeeProfileDrawerSection>

            <EmployeeProfileDrawerSection title="Contact">
              <EmployeeProfileDrawerField label="Phone">
                {formatDrawerFieldValue(selectedEmployee.phone)}
              </EmployeeProfileDrawerField>
              <EmployeeProfileDrawerField label="Email">
                {formatDrawerFieldValue(selectedEmployee.email)}
              </EmployeeProfileDrawerField>
              <EmployeeProfileDrawerField label="Emergency contact">
                {formatDrawerFieldValue(selectedEmployee.emergencyContact)}
              </EmployeeProfileDrawerField>
            </EmployeeProfileDrawerSection>

            <section className="employee-profile-drawer-section employee-profile-drawer-notes-section">
              <h4 className="employee-profile-drawer-section-title">Notes</h4>
              <p className="employee-profile-drawer-notes">
                {formatDrawerFieldValue(selectedEmployee.notes)}
              </p>
            </section>

            <section className="employee-profile-drawer-section employee-profile-drawer-account-section">
              <EmployeeAccountConnectionSection
                employee={selectedEmployee}
                workspaceId={workspaceId}
                canManageInvites={canManageInvites}
                canAssignManagerRole={canAssignManagerInviteRole}
              />
            </section>
          </div>

          <div className="employee-profile-drawer-actions">
            <button
              type="button"
              className="primary-btn employee-profile-drawer-edit-btn"
              onClick={() => onOpenEditEmployee(selectedEmployee)}
            >
              Edit
            </button>
            <button
              type="button"
              className="ghost-btn employee-profile-drawer-delete-btn"
              onClick={() => onRequestDeleteEmployee(selectedEmployee)}
            >
              Delete
            </button>
          </div>
        </aside>
      ) : null}
    </section>
  )
}
