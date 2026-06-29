import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { createEmployee, getEmployees, updateEmployee } from './services/staffService'

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'staff', label: 'Staff', icon: '👥' },
  { id: 'schedule', label: 'Schedule', icon: '🕒' },
  { id: 'reservations', label: 'Reservations', icon: '🍽️' },
  { id: 'tasks', label: 'Tasks', icon: '✓' },
  { id: 'stock', label: 'Stock', icon: '📦' },
  { id: 'reports', label: 'Reports', icon: '📈' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

const stats = [
  { title: 'Staff on Shift', value: '18', detail: '3 arriving in 30 min', accent: 'gold', icon: '👥' },
  { title: "Today's Reservations", value: '27', detail: '8 VIP tables tonight', accent: 'rose', icon: '🍽️' },
  { title: 'Open Tasks', value: '6', detail: '2 high priority', accent: 'blue', icon: '✓' },
  { title: 'Low Stock Alerts', value: '4', detail: 'Truffle oil running low', accent: 'amber', icon: '⚠️' },
  { title: "Today's Revenue", value: '$12.4k', detail: '+14% vs yesterday', accent: 'emerald', icon: '💰' },
]

const activityItems = [
  { title: 'VIP suite confirmed', time: '12 min ago', note: 'Mr. Laurent requested a corner table in the garden room.' },
  { title: 'Kitchen prep completed', time: '31 min ago', note: 'Signature tasting set is ready for service.' },
  { title: 'Stock request approved', time: '1 hr ago', note: 'Champagne replenishment was authorized.' },
]

const scheduleItems = [
  { time: '17:00', title: 'Opening briefing', note: 'Service leads and floor team' },
  { time: '19:30', title: 'Sommelier tasting', note: 'Reserve wine pairings with chef' },
  { time: '21:00', title: 'Late-night seating', note: 'Bar team on premium service' },
]

const reservations = [
  { name: 'Adrian & Elise', time: '19:30', guests: '4 Guests', note: 'Private dining room' },
  { name: 'Mina Rossi', time: '20:15', guests: '2 Guests', note: 'Anniversary dinner' },
  { name: 'The Laurent Group', time: '21:00', guests: '8 Guests', note: 'Chef’s tasting menu' },
]

const quickActions = [
  { label: 'Add Reservation', icon: '+' },
  { label: 'Add Task', icon: '✦' },
  { label: 'Add Staff', icon: '◌' },
  { label: 'Create Order', icon: '↗' },
]

const initialStaffEmployees = [
  { id: 1, name: 'Luca Romano', position: 'Head Sommelier', phone: '+1 212 555 0148', email: 'luca@amoreone.com', hireDate: 'Mar 12, 2021', salary: '$84,000', emergencyContact: 'Marta Romano • +1 212 555 0162', weeklyHours: '42 hrs', notes: 'Excellent with VIP guests and wine pairings.', shift: 'Evening', status: 'Working', department: 'Service' },
  { id: 2, name: 'Sofia Alvarez', position: 'Floor Manager', phone: '+1 212 555 0187', email: 'sofia@amoreone.com', hireDate: 'Jun 08, 2019', salary: '$91,000', emergencyContact: 'Diego Alvarez • +1 212 555 0159', weeklyHours: '40 hrs', notes: 'Leads floor operations and team handoffs.', shift: 'Evening', status: 'Working', department: 'Management' },
  { id: 3, name: 'Nadia Chen', position: 'Pastry Chef', phone: '+1 212 555 0134', email: 'nadia@amoreone.com', hireDate: 'Nov 22, 2022', salary: '$76,000', emergencyContact: 'Rina Chen • +1 212 555 0170', weeklyHours: '38 hrs', notes: 'Specializes in tasting desserts and custom plated items.', shift: 'Day', status: 'Break', department: 'Kitchen' },
  { id: 4, name: 'Marco Bellini', position: 'Bartender', phone: '+1 212 555 0113', email: 'marco@amoreone.com', hireDate: 'Feb 03, 2020', salary: '$68,000', emergencyContact: 'Elena Bellini • +1 212 555 0143', weeklyHours: '36 hrs', notes: 'Strong knowledge of Italian aperitifs and premium service.', shift: 'Evening', status: 'Working', department: 'Bar' },
  { id: 5, name: 'Priya Shah', position: 'Hostess', phone: '+1 212 555 0198', email: 'priya@amoreone.com', hireDate: 'Jul 15, 2023', salary: '$58,000', emergencyContact: 'Arun Shah • +1 212 555 0183', weeklyHours: '32 hrs', notes: 'Fluent in guest greeting and reservation coordination.', shift: 'Day', status: 'Day Off', department: 'Service' },
  { id: 6, name: 'Elias Foster', position: 'Chef de Partie', phone: '+1 212 555 0174', email: 'elias@amoreone.com', hireDate: 'Aug 18, 2021', salary: '$72,000', emergencyContact: 'Mina Foster • +1 212 555 0126', weeklyHours: '41 hrs', notes: 'Supports the main kitchen station with precise prep.', shift: 'Evening', status: 'Working', department: 'Kitchen' },
  { id: 7, name: 'Mila Petrov', position: 'Server', phone: '+1 212 555 0157', email: 'mila@amoreone.com', hireDate: 'Sep 06, 2022', salary: '$62,000', emergencyContact: 'Viktor Petrov • +1 212 555 0117', weeklyHours: '34 hrs', notes: 'Known for calm service and polished guest communication.', shift: 'Evening', status: 'Working', department: 'Service' },
  { id: 8, name: 'Daniel Ortiz', position: 'Supply Coordinator', phone: '+1 212 555 0129', email: 'daniel@amoreone.com', hireDate: 'Jan 19, 2020', salary: '$66,000', emergencyContact: 'Clara Ortiz • +1 212 555 0105', weeklyHours: '39 hrs', notes: 'Manages inventory flow and prep requests efficiently.', shift: 'Day', status: 'Leave', department: 'Management' },
  { id: 9, name: 'Isabella Cruz', position: 'Restaurant Manager', phone: '+1 212 555 0141', email: 'isabella@amoreone.com', hireDate: 'Apr 30, 2018', salary: '$97,000', emergencyContact: 'Mateo Cruz • +1 212 555 0131', weeklyHours: '45 hrs', notes: 'Oversees premium service standards and guest satisfaction.', shift: 'Evening', status: 'Working', department: 'Management' },
  { id: 10, name: 'Theo Martin', position: 'Commis Chef', phone: '+1 212 555 0168', email: 'theo@amoreone.com', hireDate: 'May 03, 2024', salary: '$54,000', emergencyContact: 'Leah Martin • +1 212 555 0108', weeklyHours: '30 hrs', notes: 'Fast learner and dependable during high-volume service.', shift: 'Day', status: 'Break', department: 'Kitchen' },
  { id: 11, name: 'Ava Laurent', position: 'Hostess', phone: '+1 212 555 0189', email: 'ava@amoreone.com', hireDate: 'Dec 11, 2023', salary: '$56,000', emergencyContact: 'Julien Laurent • +1 212 555 0145', weeklyHours: '33 hrs', notes: 'Excellent with reservations and VIP arrivals.', shift: 'Evening', status: 'Working', department: 'Service' },
  { id: 12, name: 'Jonas Weber', position: 'Barback', phone: '+1 212 555 0150', email: 'jonas@amoreone.com', hireDate: 'Oct 02, 2022', salary: '$59,000', emergencyContact: 'Karin Weber • +1 212 555 0178', weeklyHours: '35 hrs', notes: 'Keeps the bar stocked and service flowing smoothly.', shift: 'Evening', status: 'Working', department: 'Bar' },
]

const filters = ['All', 'Bar', 'Service', 'Kitchen', 'Management']

function getInitials(name) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
}

function DashboardView() {
  return (
    <>
      <section className="stats-grid" aria-label="Key metrics">
        {stats.map((stat) => (
          <article key={stat.title} className={`stat-card ${stat.accent}`}>
            <div className="stat-header">
              <p>{stat.title}</p>
              <span className="stat-icon">{stat.icon}</span>
            </div>
            <h3>{stat.value}</h3>
            <p className="stat-detail">{stat.detail}</p>
          </article>
        ))}
      </section>

      <section className="content-grid">
        <article className="panel panel-large">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Recent activity</p>
              <h3>Tonight's momentum</h3>
            </div>
            <button type="button" className="ghost-btn">View all</button>
          </div>
          <ul className="activity-list timeline-list">
            {activityItems.map((item) => (
              <li key={item.title}>
                <span className="timeline-dot" />
                <div className="timeline-content">
                  <div className="timeline-top">
                    <strong>{item.title}</strong>
                    <span>{item.time}</span>
                  </div>
                  <p>{item.note}</p>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Today's schedule</p>
              <h3>Service plan</h3>
            </div>
          </div>
          <ul className="schedule-list">
            {scheduleItems.map((item) => (
              <li key={item.time}>
                <div className="schedule-time">{item.time}</div>
                <div className="schedule-body">
                  <strong>{item.title}</strong>
                  <p>{item.note}</p>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="content-grid secondary-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Upcoming reservations</p>
              <h3>Arrival flow</h3>
            </div>
          </div>
          <ul className="reservation-list">
            {reservations.map((item) => (
              <li key={item.name}>
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.note}</p>
                </div>
                <div className="reservation-meta">
                  <span>{item.time}</span>
                  <small>{item.guests}</small>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Quick actions</p>
              <h3>Streamline service</h3>
            </div>
          </div>
          <div className="quick-actions-grid">
            {quickActions.map((action) => (
              <button key={action.label} type="button" className="quick-action">
                <span>{action.icon}</span>
                {action.label}
              </button>
            ))}
          </div>
        </article>
      </section>
    </>
  )
}

function toDateInputValue(value) {
  if (!value) return ''

  const trimmed = `${value}`.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return parsed.toISOString().split('T')[0]
}

function formatHireDate(value) {
  if (!value) return 'TBD'

  const trimmed = `${value}`.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-')
    const parsed = new Date(`${year}-${month}-${day}`)
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return trimmed
  }

  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function normalizeNumericValue(value) {
  if (value === null || value === undefined || value === '') return null

  const trimmed = `${value}`.trim()
  if (!trimmed) return null
  if (trimmed.toLowerCase() === 'tbd' || trimmed.toLowerCase() === 'n/a') return null

  const cleaned = trimmed.replace(/[$,\s]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function buildEmployeeForm(employee = null) {
  return {
    fullName: employee?.name ?? '',
    position: employee?.position ?? '',
    phone: employee?.phone ?? '',
    email: employee?.email ?? '',
    hireDate: toDateInputValue(employee?.hireDate ?? ''),
    salary: employee?.salary ?? '',
    department: employee?.department ?? 'Service',
    shift: employee?.shift ?? 'Evening',
    status: employee?.status ?? 'Working',
    emergencyContact: employee?.emergencyContact ?? '',
    notes: employee?.notes ?? '',
  }
}

function StaffView({
  employees,
  selectedEmployee,
  onSelectEmployee,
  searchTerm,
  onSearchChange,
  activeFilter,
  onFilterChange,
  onOpenAddEmployee,
  onOpenEditEmployee,
  isLoading,
  noticeMessage,
  isSaving,
}) {
  const overviewCards = [
    { label: 'Total Employees', value: employees.length, detail: 'Across all departments' },
    { label: 'On Shift', value: employees.filter((employee) => employee.status === 'Working').length, detail: 'Active service team' },
    { label: 'Off Today', value: employees.filter((employee) => employee.status === 'Day Off').length, detail: 'Scheduled breaks' },
    { label: 'On Leave', value: employees.filter((employee) => employee.status === 'Leave').length, detail: 'Out of service' },
  ]

  return (
    <section className="staff-page">
      <div className="staff-header-card">
        <div>
          <p className="eyebrow">Staff management</p>
          <h3>Team overview</h3>
          <p className="staff-subtitle">Monitor service coverage, shifts, and employee details from one place.</p>
        </div>
        <button type="button" className="primary-btn" onClick={onOpenAddEmployee} disabled={isSaving}>
          {isSaving ? 'Saving…' : '+ Add Employee'}
        </button>
      </div>

      <div className="staff-overview-grid">
        {overviewCards.map((card) => (
          <article key={card.label} className="staff-overview-card">
            <p>{card.label}</p>
            <h4>{card.value}</h4>
            <span>{card.detail}</span>
          </article>
        ))}
      </div>

      <div className="staff-toolbar">
        <label className="staff-search" aria-label="Search employee">
          <span>⌕</span>
          <input type="text" value={searchTerm} onChange={onSearchChange} placeholder="Search employee" />
        </label>

        <div className="filter-group">
          {filters.map((filter) => (
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

      <div className="panel staff-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Employee roster</p>
            <h3>Active team members</h3>
          </div>
        </div>

        <div className="table-shell">
          <table className="staff-table">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Name</th>
                <th>Position</th>
                <th>Phone</th>
                <th>Shift</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} onClick={() => onSelectEmployee(employee)}>
                  <td>
                    <div className="employee-photo">{getInitials(employee.name)}</div>
                  </td>
                  <td>
                    <div className="employee-name-block">
                      <strong>{employee.name}</strong>
                      <p>{employee.department}</p>
                    </div>
                  </td>
                  <td>{employee.position}</td>
                  <td>{employee.phone}</td>
                  <td>{employee.shift}</td>
                  <td>
                    <span className={`status-pill ${employee.status.toLowerCase().replace(/\s+/g, '-')}`}>
                      {employee.status}
                    </span>
                  </td>
                  <td>
                    <div className="action-group">
                      <button type="button" className="ghost-btn small" onClick={(event) => {
                        event.stopPropagation()
                        onSelectEmployee(employee)
                      }}>
                        View
                      </button>
                      <button type="button" className="ghost-btn small" onClick={(event) => {
                        event.stopPropagation()
                        onOpenEditEmployee(employee)
                      }}>
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
              <strong>{selectedEmployee.position}</strong>
              <p>{selectedEmployee.department}</p>
            </div>
          </div>

          <div className="drawer-grid">
            <div className="drawer-row"><span>Full Name</span><strong>{selectedEmployee.name}</strong></div>
            <div className="drawer-row"><span>Position</span><strong>{selectedEmployee.position}</strong></div>
            <div className="drawer-row"><span>Phone</span><strong>{selectedEmployee.phone}</strong></div>
            <div className="drawer-row"><span>Email</span><strong>{selectedEmployee.email}</strong></div>
            <div className="drawer-row"><span>Hire Date</span><strong>{selectedEmployee.hireDate}</strong></div>
            <div className="drawer-row"><span>Salary</span><strong>{selectedEmployee.salary}</strong></div>
            <div className="drawer-row"><span>Emergency Contact</span><strong>{selectedEmployee.emergencyContact}</strong></div>
            <div className="drawer-row"><span>Weekly Hours</span><strong>{selectedEmployee.weeklyHours}</strong></div>
          </div>

          <div className="drawer-notes">
            <p className="eyebrow">Notes</p>
            <p>{selectedEmployee.notes}</p>
          </div>
        </aside>
      ) : null}
    </section>
  )
}

function App() {
  const [activeView, setActiveView] = useState('dashboard')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState('All')
  const [employees, setEmployees] = useState(initialStaffEmployees)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [employeeForm, setEmployeeForm] = useState(() => buildEmployeeForm())
  const [isLoadingStaff, setIsLoadingStaff] = useState(true)
  const [staffNotice, setStaffNotice] = useState('')
  const [isSavingEmployee, setIsSavingEmployee] = useState(false)
  const [saveError, setSaveError] = useState('')

  const todayLabel = new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date())

  useEffect(() => {
    let isMounted = true

    const loadEmployees = async () => {
      setIsLoadingStaff(true)
      setStaffNotice('')

      try {
        const remoteEmployees = await getEmployees()
        if (!isMounted) return

        if (remoteEmployees.length > 0) {
          setEmployees(remoteEmployees)
        } else {
          setEmployees(initialStaffEmployees)
        }
      } catch (error) {
        if (!isMounted) return

        setEmployees(initialStaffEmployees)
        setStaffNotice(error.message || 'Unable to load employees right now.')
      } finally {
        if (isMounted) {
          setIsLoadingStaff(false)
        }
      }
    }

    loadEmployees()

    return () => {
      isMounted = false
    }
  }, [])

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const matchesSearch = `${employee.name} ${employee.position} ${employee.department}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
      const matchesFilter = activeFilter === 'All' || employee.department === activeFilter
      return matchesSearch && matchesFilter
    })
  }, [activeFilter, employees, searchTerm])

  const handleOpenAddEmployee = () => {
    setEditingEmployee(null)
    setSaveError('')
    setEmployeeForm(buildEmployeeForm())
    setIsEmployeeModalOpen(true)
  }

  const handleOpenEditEmployee = (employee) => {
    setEditingEmployee(employee)
    setSaveError('')
    setEmployeeForm(buildEmployeeForm(employee))
    setIsEmployeeModalOpen(true)
  }

  const handleCloseEmployeeModal = () => {
    setIsEmployeeModalOpen(false)
    setEditingEmployee(null)
    setSaveError('')
    setEmployeeForm(buildEmployeeForm())
  }

  const handleEmployeeSubmit = async (event) => {
    event.preventDefault()

    if (!employeeForm.fullName.trim()) {
      return
    }

    setIsSavingEmployee(true)
    setSaveError('')

    const payload = {
      name: employeeForm.fullName.trim(),
      position: employeeForm.position.trim(),
      phone: employeeForm.phone.trim(),
      email: employeeForm.email.trim(),
      hireDate: employeeForm.hireDate,
      salary: normalizeNumericValue(employeeForm.salary),
      emergencyContact: employeeForm.emergencyContact.trim() || 'Not provided',
      weeklyHours: normalizeNumericValue(editingEmployee?.weeklyHours),
      notes: employeeForm.notes.trim() || 'No notes yet.',
      shift: employeeForm.shift,
      status: employeeForm.status,
      department: employeeForm.department,
    }

    try {
      const savedEmployee = editingEmployee
        ? await updateEmployee(editingEmployee.id, payload)
        : await createEmployee(payload)

      const nextEmployee = {
        ...savedEmployee,
        hireDate: formatHireDate(savedEmployee.hireDate),
      }

      if (editingEmployee) {
        setEmployees((current) => current.map((employee) => (
          employee.id === editingEmployee.id ? nextEmployee : employee
        )))
      } else {
        setEmployees((current) => [nextEmployee, ...current])
      }

      setSelectedEmployee(nextEmployee)
      setStaffNotice('')
      handleCloseEmployeeModal()
    } catch (error) {
      const nextEmployee = {
        id: editingEmployee ? editingEmployee.id : Math.max(...employees.map((employee) => employee.id), 0) + 1,
        name: payload.name,
        position: payload.position,
        phone: payload.phone,
        email: payload.email,
        hireDate: formatHireDate(payload.hireDate),
        salary: payload.salary ?? '',
        emergencyContact: payload.emergencyContact,
        weeklyHours: payload.weeklyHours,
        notes: payload.notes,
        shift: payload.shift,
        status: payload.status,
        department: payload.department,
      }

      if (editingEmployee) {
        setEmployees((current) => current.map((employee) => (
          employee.id === editingEmployee.id ? nextEmployee : employee
        )))
      } else {
        setEmployees((current) => [nextEmployee, ...current])
      }

      setSelectedEmployee(nextEmployee)
      setStaffNotice(error.message || 'Unable to save employee right now.')
      setSaveError(error.message || 'Unable to save employee right now.')
    } finally {
      setIsSavingEmployee(false)
    }
  }

  const heroTitle = activeView === 'dashboard' ? 'Good morning, Platon 👋' : 'Staff management'
  const heroSubtitle = activeView === 'dashboard'
    ? 'Monday, June 29 · Everything is running smoothly.'
    : 'Search, filter, and review the full team roster.'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">A</div>
          <div>
            <p className="eyebrow">Private Dining</p>
            <h1>Amore One</h1>
          </div>
        </div>

        <nav className="nav-links" aria-label="Sidebar navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-link ${activeView === item.id ? 'active' : ''}`}
              onClick={() => {
                setActiveView(item.id)
                if (item.id !== 'staff') {
                  setSelectedEmployee(null)
                }
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <p className="eyebrow">Tonight</p>
          <h2>92% service readiness</h2>
          <p>Every detail is aligned for a seamless luxury evening.</p>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-title-block">
            <p className="eyebrow">Operations dashboard</p>
            <h2>{heroTitle}</h2>
            <p className="welcome-subtitle">{heroSubtitle}</p>
          </div>
          <div className="topbar-meta">
            <label className="search-bar" aria-label="Search dashboard">
              <span>⌕</span>
              <input
                type="text"
                placeholder={activeView === 'staff' ? 'Search employee' : 'Search'}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>
            <button type="button" className="icon-btn">🔔</button>
            <div className="date-pill">{todayLabel}</div>
            <div className="profile-chip">
              <div className="profile-avatar">H</div>
              <div>
                <strong>Helena Cruz</strong>
                <p>General Manager</p>
              </div>
            </div>
          </div>
        </header>

        {activeView === 'dashboard' ? <DashboardView /> : null}

        {activeView === 'staff' ? (
          <StaffView
            employees={filteredEmployees}
            selectedEmployee={selectedEmployee}
            onSelectEmployee={setSelectedEmployee}
            searchTerm={searchTerm}
            onSearchChange={(event) => setSearchTerm(event.target.value)}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            onOpenAddEmployee={handleOpenAddEmployee}
            onOpenEditEmployee={handleOpenEditEmployee}
            isLoading={isLoadingStaff}
            noticeMessage={staffNotice}
            isSaving={isSavingEmployee}
          />
        ) : null}

        {isEmployeeModalOpen ? (
          <div className="employee-modal-backdrop" onClick={handleCloseEmployeeModal}>
            <div className="employee-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Employee form</p>
                  <h3>{editingEmployee ? 'Edit employee' : 'Add employee'}</h3>
                </div>
                <button type="button" className="icon-btn" onClick={handleCloseEmployeeModal}>✕</button>
              </div>

              <form className="employee-form" onSubmit={handleEmployeeSubmit}>
                <div className="form-grid">
                  <label className="form-field">
                    <span>Full Name</span>
                    <input value={employeeForm.fullName} onChange={(event) => setEmployeeForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Full Name" required />
                  </label>
                  <label className="form-field">
                    <span>Position</span>
                    <input value={employeeForm.position} onChange={(event) => setEmployeeForm((current) => ({ ...current, position: event.target.value }))} placeholder="Position" required />
                  </label>
                  <label className="form-field">
                    <span>Phone</span>
                    <input value={employeeForm.phone} onChange={(event) => setEmployeeForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" />
                  </label>
                  <label className="form-field">
                    <span>Email</span>
                    <input type="email" value={employeeForm.email} onChange={(event) => setEmployeeForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
                  </label>
                  <label className="form-field">
                    <span>Hire Date</span>
                    <input type="date" value={employeeForm.hireDate ? new Date(employeeForm.hireDate).toISOString().split('T')[0] : ''} onChange={(event) => setEmployeeForm((current) => ({ ...current, hireDate: event.target.value }))} />
                  </label>
                  <label className="form-field">
                    <span>Salary</span>
                    <input value={employeeForm.salary} onChange={(event) => setEmployeeForm((current) => ({ ...current, salary: event.target.value }))} placeholder="Salary" />
                  </label>
                  <label className="form-field">
                    <span>Department</span>
                    <select value={employeeForm.department} onChange={(event) => setEmployeeForm((current) => ({ ...current, department: event.target.value }))}>
                      <option value="Service">Service</option>
                      <option value="Bar">Bar</option>
                      <option value="Kitchen">Kitchen</option>
                      <option value="Management">Management</option>
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Shift</span>
                    <select value={employeeForm.shift} onChange={(event) => setEmployeeForm((current) => ({ ...current, shift: event.target.value }))}>
                      <option value="Day">Day</option>
                      <option value="Evening">Evening</option>
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Status</span>
                    <select value={employeeForm.status} onChange={(event) => setEmployeeForm((current) => ({ ...current, status: event.target.value }))}>
                      <option value="Working">Working</option>
                      <option value="Break">Break</option>
                      <option value="Day Off">Day Off</option>
                      <option value="Leave">Leave</option>
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Emergency Contact</span>
                    <input value={employeeForm.emergencyContact} onChange={(event) => setEmployeeForm((current) => ({ ...current, emergencyContact: event.target.value }))} placeholder="Emergency Contact" />
                  </label>
                </div>

                <label className="form-field full-width">
                  <span>Notes</span>
                  <textarea rows="4" value={employeeForm.notes} onChange={(event) => setEmployeeForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
                </label>

                {saveError ? <div className="staff-status-banner">{saveError}</div> : null}

                <div className="modal-actions">
                  <button type="button" className="ghost-btn" onClick={handleCloseEmployeeModal}>Cancel</button>
                  <button type="submit" className="primary-btn" disabled={isSavingEmployee}>
                    {isSavingEmployee ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}

export default App
