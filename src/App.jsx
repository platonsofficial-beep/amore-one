import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { createEmployee, getEmployees, updateEmployee } from './services/staffService'
import { createShift, deleteShift, getShifts, updateShift } from './services/scheduleService'
import { createReservation, deleteReservation, getReservations, updateReservation } from './services/reservationService'

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

function ScheduleView({ shifts, employees, onOpenAddShift, onOpenEditShift, onDeleteShift, isLoading, noticeMessage, isSaving }) {
  const [selectedDay, setSelectedDay] = useState(null)
  const [selectedShift, setSelectedShift] = useState(null)
  const [filters, setFilters] = useState({
    department: 'All',
    shift: 'All',
    status: 'All',
    search: '',
  })

  const weekDays = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const day = start.getDay()
    const diff = start.getDate() - day + (day === 0 ? -6 : 1)
    start.setDate(diff)

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return {
        key: date.toISOString().split('T')[0],
        label: date.toLocaleDateString('en-US', { weekday: 'short' }),
        shortDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: shifts.filter((shift) => shift.date === date.toISOString().split('T')[0]).length,
      }
    })
  }, [shifts])

  useEffect(() => {
    if (!selectedDay && weekDays.length > 0) {
      setSelectedDay(weekDays[0].key)
      return
    }

    if (selectedDay && !weekDays.some((day) => day.key === selectedDay)) {
      setSelectedDay(weekDays[0]?.key ?? null)
    }
  }, [selectedDay, weekDays])

  const parseTimeToMinutes = (value) => {
    if (!value) return Number.MAX_SAFE_INTEGER

    const [hours, minutes] = `${value}`.split(':').map(Number)
    return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes)
  }

  const getShiftDepartment = (shift) => {
    const employeeRecord = shift.employeeRecord ?? null
    if (employeeRecord?.department) {
      return employeeRecord.department
    }

    const normalized = `${shift.area || ''} ${shift.role || ''}`.toLowerCase()
    if (normalized.includes('bar')) return 'Bar'
    if (normalized.includes('host')) return 'Host'
    if (normalized.includes('kitchen')) return 'Kitchen'
    if (normalized.includes('management')) return 'Management'
    return 'Service'
  }

  const getShiftPeriod = (shift) => {
    const minutes = parseTimeToMinutes(shift.startTime)
    if (minutes < 12 * 60) return 'Morning'
    if (minutes < 20 * 60) return 'Evening'
    return 'Night'
  }

  const getShiftIndicator = (shift) => {
    const period = getShiftPeriod(shift)
    if (period === 'Morning') return { label: 'Morning', className: 'shift-indicator morning' }
    if (period === 'Evening') return { label: 'Evening', className: 'shift-indicator evening' }
    return { label: 'Night', className: 'shift-indicator night' }
  }

  const getShiftStatusClass = (status) => {
    if (!status) return 'scheduled'
    const normalized = `${status}`.toLowerCase()
    if (normalized.includes('confirm')) return 'confirmed'
    if (normalized.includes('complete')) return 'completed'
    return 'scheduled'
  }

  const isEmployeeUnavailable = (employee) => {
    if (!employee?.status) return false
    const normalized = `${employee.status}`.toLowerCase()
    return normalized.includes('day off') || normalized.includes('vacation') || normalized.includes('sick') || normalized.includes('leave')
  }

  const getCoverageState = (dayShifts) => {
    if (!dayShifts.length) {
      return { icon: '🔴', label: 'Understaffed', className: 'coverage-pill understaffed' }
    }

    const totalDepartments = new Set(dayShifts.map((shift) => getShiftDepartment(shift))).size
    const hasEnoughCoverage = dayShifts.length >= 4 && totalDepartments >= 3
    if (hasEnoughCoverage) {
      return { icon: '🟢', label: 'Fully Staffed', className: 'coverage-pill staffed' }
    }

    if (dayShifts.length >= 2 || totalDepartments >= 2) {
      return { icon: '🟡', label: 'Needs Attention', className: 'coverage-pill attention' }
    }

    return { icon: '🔴', label: 'Understaffed', className: 'coverage-pill understaffed' }
  }

  const selectedDate = weekDays.find((day) => day.key === selectedDay)?.key ?? null
  const selectedDayShifts = useMemo(() => {
    if (!selectedDate) return []

    return shifts
      .filter((shift) => shift.date === selectedDate)
      .map((shift) => ({
        ...shift,
        employeeRecord: employees.find((employee) => employee.id === shift.employeeId) ?? null,
      }))
      .sort((left, right) => parseTimeToMinutes(left.startTime) - parseTimeToMinutes(right.startTime))
  }, [employees, selectedDate, shifts])

  const filteredDayShifts = useMemo(() => {
    const searchTerm = filters.search.trim().toLowerCase()

    return selectedDayShifts.filter((shift) => {
      const employeeName = `${shift.employees?.full_name || shift.employeeName || shift.employeeRecord?.name || ''}`.toLowerCase()
      const matchesSearch = !searchTerm || employeeName.includes(searchTerm)
      const matchesDepartment = filters.department === 'All' || getShiftDepartment(shift) === filters.department
      const matchesShift = filters.shift === 'All' || getShiftPeriod(shift) === filters.shift
      const matchesStatus = filters.status === 'All' || `${shift.status || 'Scheduled'}`.toLowerCase() === filters.status.toLowerCase()
      return matchesSearch && matchesDepartment && matchesShift && matchesStatus
    })
  }, [filters.department, filters.search, filters.shift, filters.status, selectedDayShifts])

  const departmentGroups = useMemo(() => {
    const groups = ['Bar', 'Service', 'Host', 'Kitchen', 'Management'].map((department) => ({
      department,
      shifts: [],
    }))

    filteredDayShifts.forEach((shift) => {
      const department = getShiftDepartment(shift)
      const target = groups.find((group) => group.department === department)
      if (target) {
        target.shifts.push(shift)
      }
    })

    return groups
  }, [filteredDayShifts])

  const weekSummary = useMemo(() => {
    const weekShifts = shifts.filter((shift) => weekDays.some((day) => day.key === shift.date))
    const workingEmployees = new Set(weekShifts.map((shift) => shift.employeeId).filter(Boolean))
    const totalHours = weekShifts.reduce((sum, shift) => {
      if (!shift.startTime || !shift.endTime) return sum
      const startMinutes = parseTimeToMinutes(shift.startTime)
      const endMinutes = parseTimeToMinutes(shift.endTime)
      if (Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && endMinutes > startMinutes) {
        return sum + (endMinutes - startMinutes) / 60
      }
      return sum
    }, 0)

    const employeesOff = employees.filter((employee) => isEmployeeUnavailable(employee)).length
    const coverage = weekShifts.length ? Math.min(100, Math.round((weekShifts.length / Math.max(1, weekDays.length * 4)) * 100)) : 0

    return {
      employeesScheduled: workingEmployees.size,
      totalShifts: weekShifts.length,
      totalHours: totalHours.toFixed(1),
      employeesOff,
      coverage,
    }
  }, [employees, shifts, weekDays])

  const daySummaries = useMemo(() => {
    return weekDays.map((day) => {
      const dayShifts = shifts
        .filter((shift) => shift.date === day.key)
        .map((shift) => ({
          ...shift,
          employeeRecord: employees.find((employee) => employee.id === shift.employeeId) ?? null,
        }))
        .sort((left, right) => parseTimeToMinutes(left.startTime) - parseTimeToMinutes(right.startTime))

      const timelineSegments = dayShifts.map((shift) => {
        const start = parseTimeToMinutes(shift.startTime)
        const end = parseTimeToMinutes(shift.endTime)
        const left = Math.max(0, ((start - 8 * 60) / (18 * 60)) * 100)
        const width = Math.max(8, (((end - start) / (18 * 60)) * 100))
        return { left, width, className: shift.status === 'Completed' ? 'timeline-segment completed' : 'timeline-segment' }
      })

      return {
        ...day,
        shifts: dayShifts,
        coverage: getCoverageState(dayShifts),
        timelineSegments,
      }
    })
  }, [employees, shifts, weekDays])

  const handleOpenShiftDetails = (shift) => {
    setSelectedShift(shift)
  }

  const handleCloseShiftDetails = () => {
    setSelectedShift(null)
  }

  const handleEditSelectedShift = () => {
    if (!selectedShift) return
    onOpenEditShift(selectedShift)
    handleCloseShiftDetails()
  }

  const handleDeleteSelectedShift = () => {
    if (!selectedShift) return
    onDeleteShift(selectedShift.id)
    handleCloseShiftDetails()
  }

  return (
    <section className="staff-page">
      <div className="staff-header-card">
        <div>
          <p className="eyebrow">Schedule management</p>
          <h3>Premium weekly roster</h3>
          <p className="staff-subtitle">Coordinate staffing, assignments, and coverage across the week.</p>
        </div>
        <button type="button" className="primary-btn" onClick={onOpenAddShift} disabled={isSaving}>
          {isSaving ? 'Saving…' : '+ Add Shift'}
        </button>
      </div>

      <div className="roster-summary-grid roster-summary-bar">
        <article className="roster-summary-card">
          <p className="eyebrow">Employees scheduled</p>
          <h3>{weekSummary.employeesScheduled}</h3>
        </article>
        <article className="roster-summary-card">
          <p className="eyebrow">Total shifts</p>
          <h3>{weekSummary.totalShifts}</h3>
        </article>
        <article className="roster-summary-card">
          <p className="eyebrow">Total working hours</p>
          <h3>{weekSummary.totalHours}h</h3>
        </article>
        <article className="roster-summary-card">
          <p className="eyebrow">Employees off</p>
          <h3>{weekSummary.employeesOff}</h3>
        </article>
        <article className="roster-summary-card">
          <p className="eyebrow">Coverage</p>
          <h3>{weekSummary.coverage}%</h3>
        </article>
      </div>

      <div className="schedule-week-grid">
        {daySummaries.map((day) => (
          <button
            key={day.key}
            type="button"
            className={`schedule-week-day ${selectedDay === day.key ? 'active' : ''}`}
            onClick={() => setSelectedDay(day.key)}
          >
            <div className="schedule-week-day-top">
              <div>
                <strong>{day.label}</strong>
                <span>{day.shortDate}</span>
              </div>
              <span className={`day-coverage-pill ${day.coverage.className}`}>{day.coverage.icon} {day.coverage.label}</span>
            </div>
            <p>{day.shifts.length} shift{day.shifts.length === 1 ? '' : 's'}</p>
            <div className="roster-day-timeline">
              <div className="roster-day-timeline-track">
                <span className="timeline-label">08:00</span>
                {day.timelineSegments.map((segment, index) => (
                  <span key={`${day.key}-${index}`} className={segment.className} style={{ left: `${segment.left}%`, width: `${segment.width}%` }} />
                ))}
                <span className="timeline-label">01:00</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading schedule…</div> : null}

      <div className="panel staff-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Weekly roster</p>
            <h3>{selectedDay ? weekDays.find((day) => day.key === selectedDay)?.label : 'Planning'} coverage</h3>
          </div>
        </div>

        <div className="roster-filters">
          <label className="roster-filter">
            <span>Department</span>
            <select value={filters.department} onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))}>
              <option value="All">All</option>
              <option value="Bar">Bar</option>
              <option value="Service">Service</option>
              <option value="Host">Host</option>
              <option value="Kitchen">Kitchen</option>
              <option value="Management">Management</option>
            </select>
          </label>
          <label className="roster-filter">
            <span>Shift</span>
            <select value={filters.shift} onChange={(event) => setFilters((current) => ({ ...current, shift: event.target.value }))}>
              <option value="All">All</option>
              <option value="Morning">Morning</option>
              <option value="Evening">Evening</option>
              <option value="Night">Night</option>
            </select>
          </label>
          <label className="roster-filter">
            <span>Status</span>
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="All">All</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Completed">Completed</option>
            </select>
          </label>
          <label className="roster-filter roster-filter-search">
            <span>Employee</span>
            <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search" />
          </label>
        </div>

        {filteredDayShifts.length === 0 && !isLoading ? (
          <div className="schedule-empty-state">
            <h4>No employees match this view.</h4>
            <p>Adjust the filters or create a new shift for this day.</p>
          </div>
        ) : null}

        <div className="roster-department-groups">
          {departmentGroups.map((group) => (
            <section key={group.department} className="roster-department-card">
              <div className="roster-department-heading">
                <h4>{group.department}</h4>
                <span>{group.shifts.length} shift{group.shifts.length === 1 ? '' : 's'}</span>
              </div>

              {group.shifts.length === 0 ? (
                <p className="roster-empty-department">No employees scheduled</p>
              ) : (
                <div className="roster-shift-list">
                  {group.shifts.map((shift) => {
                    const indicator = getShiftIndicator(shift)
                    const employeeName = shift.employees?.full_name || shift.employeeName || shift.employeeRecord?.name || 'Unassigned'
                    const employeePosition = shift.employeeRecord?.position || shift.role || 'Team member'
                    const employeeAvatar = getInitials(employeeName)

                    return (
                      <button key={shift.id} type="button" className="roster-shift-card" onClick={() => handleOpenShiftDetails(shift)}>
                        <div className="roster-shift-main">
                          <div className="roster-avatar">{employeeAvatar}</div>
                          <div className="roster-shift-copy">
                            <strong>{employeeName}</strong>
                            <p>{employeePosition}</p>
                          </div>
                        </div>
                        <div className="roster-shift-meta">
                          <span>{shift.startTime || '—'} – {shift.endTime || '—'}</span>
                          <span>{shift.area || 'Guest floor'}</span>
                        </div>
                        <div className="roster-shift-footer">
                          <span className={`status-pill ${getShiftStatusClass(shift.status)}`}>{shift.status || 'Scheduled'}</span>
                          <span className={indicator.className}>{indicator.label}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>

      {selectedShift ? (
        <>
          <div className="drawer-backdrop" onClick={handleCloseShiftDetails} />
          <aside className="employee-drawer">
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Shift details</p>
                <h3>{selectedShift.employees?.full_name || selectedShift.employeeName || selectedShift.employeeRecord?.name || 'Unassigned'}</h3>
              </div>
              <button type="button" className="icon-btn" onClick={handleCloseShiftDetails}>✕</button>
            </div>

            <div className="drawer-profile">
              <div className="employee-photo large">{getInitials(selectedShift.employees?.full_name || selectedShift.employeeName || selectedShift.employeeRecord?.name || 'Unassigned')}</div>
              <div>
                <strong>{selectedShift.employeeRecord?.position || selectedShift.role || 'Team member'}</strong>
                <p>{selectedShift.employeeRecord?.department || 'Service'}</p>
              </div>
            </div>

            <div className="drawer-grid">
              <div className="drawer-row"><span>Time</span><strong>{selectedShift.startTime || '—'} – {selectedShift.endTime || '—'}</strong></div>
              <div className="drawer-row"><span>Area</span><strong>{selectedShift.area || '—'}</strong></div>
              <div className="drawer-row"><span>Status</span><strong>{selectedShift.status || 'Scheduled'}</strong></div>
              <div className="drawer-row"><span>Date</span><strong>{selectedShift.date || '—'}</strong></div>
            </div>

            <div className="drawer-notes">
              <p className="eyebrow">Notes</p>
              <p>{selectedShift.notes || 'No notes for this shift.'}</p>
            </div>

            <div className="action-group" style={{ marginTop: '16px' }}>
              <button type="button" className="ghost-btn" onClick={handleEditSelectedShift}>Edit</button>
              <button type="button" className="ghost-btn" onClick={handleDeleteSelectedShift}>Delete</button>
            </div>
          </aside>
        </>
      ) : null}
    </section>
  )
}

function ReservationsView({ reservations, onOpenAddReservation, onOpenEditReservation, onDeleteReservation, isLoading, noticeMessage, isSaving }) {
  const today = new Date().toISOString().split('T')[0]
  const todayReservations = reservations.filter((reservation) => reservation.date === today)
  const upcomingReservations = reservations.filter((reservation) => reservation.date !== today)

  return (
    <section className="staff-page">
      <div className="staff-header-card">
        <div>
          <p className="eyebrow">Reservations</p>
          <h3>Luxury booking flow</h3>
          <p className="staff-subtitle">Track arrivals, seating, and guest notes across the evening.</p>
        </div>
        <button type="button" className="primary-btn" onClick={onOpenAddReservation} disabled={isSaving}>
          {isSaving ? 'Saving…' : '+ Add Reservation'}
        </button>
      </div>

      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading reservations…</div> : null}

      <div className="roster-summary-grid">
        <article className="roster-summary-card">
          <p className="eyebrow">Today</p>
          <h3>{todayReservations.length}</h3>
        </article>
        <article className="roster-summary-card">
          <p className="eyebrow">Upcoming</p>
          <h3>{upcomingReservations.length}</h3>
        </article>
        <article className="roster-summary-card">
          <p className="eyebrow">Booked</p>
          <h3>{reservations.filter((reservation) => reservation.status === 'Booked').length}</h3>
        </article>
      </div>

      <div className="panel staff-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Today’s reservations</p>
            <h3>Arrival board</h3>
          </div>
        </div>

        {todayReservations.length === 0 && !isLoading ? (
          <div className="schedule-empty-state">
            <h4>No reservations yet.</h4>
            <p>Your guest arrival board is clear for today.</p>
          </div>
        ) : (
          <div className="roster-shift-list">
            {todayReservations.map((reservation) => (
              <article key={reservation.id} className="roster-shift-card reservation-card">
                <div className="roster-shift-main">
                  <div className="roster-avatar">{getInitials(reservation.guestName || 'Guest')}</div>
                  <div className="roster-shift-copy">
                    <strong>{reservation.guestName || 'Guest'}</strong>
                    <p>{reservation.phone || 'Phone not provided'}</p>
                  </div>
                </div>
                <div className="roster-shift-meta">
                  <span>{reservation.date || '—'}</span>
                  <span>{reservation.time || '—'}</span>
                </div>
                <div className="roster-shift-meta">
                  <span>{reservation.guests || 0} guests</span>
                  <span>Table {reservation.tableNumber || '—'}</span>
                </div>
                <div className="roster-shift-meta">
                  <span>{reservation.area || '—'}</span>
                  <span className={`status-pill ${reservation.status === 'Completed' ? 'completed' : reservation.status === 'Cancelled' ? 'scheduled' : 'confirmed'}`}>{reservation.status || 'Booked'}</span>
                </div>
                <div className="drawer-notes">
                  <p>{reservation.notes || 'No notes.'}</p>
                </div>
                <div className="action-group" style={{ marginTop: '12px' }}>
                  <button type="button" className="ghost-btn" onClick={() => onOpenEditReservation(reservation)}>Edit</button>
                  <button type="button" className="ghost-btn" onClick={() => onDeleteReservation(reservation.id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="panel staff-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Upcoming reservations</p>
            <h3>Future bookings</h3>
          </div>
        </div>

        {upcomingReservations.length === 0 && !isLoading ? (
          <div className="schedule-empty-state">
            <h4>No reservations yet.</h4>
            <p>New reservations will appear here as they are added.</p>
          </div>
        ) : (
          <div className="roster-shift-list">
            {upcomingReservations.map((reservation) => (
              <article key={reservation.id} className="roster-shift-card reservation-card">
                <div className="roster-shift-main">
                  <div className="roster-avatar">{getInitials(reservation.guestName || 'Guest')}</div>
                  <div className="roster-shift-copy">
                    <strong>{reservation.guestName || 'Guest'}</strong>
                    <p>{reservation.phone || 'Phone not provided'}</p>
                  </div>
                </div>
                <div className="roster-shift-meta">
                  <span>{reservation.date || '—'}</span>
                  <span>{reservation.time || '—'}</span>
                </div>
                <div className="roster-shift-meta">
                  <span>{reservation.guests || 0} guests</span>
                  <span>Table {reservation.tableNumber || '—'}</span>
                </div>
                <div className="roster-shift-meta">
                  <span>{reservation.area || '—'}</span>
                  <span className={`status-pill ${reservation.status === 'Completed' ? 'completed' : reservation.status === 'Cancelled' ? 'scheduled' : 'confirmed'}`}>{reservation.status || 'Booked'}</span>
                </div>
                <div className="drawer-notes">
                  <p>{reservation.notes || 'No notes.'}</p>
                </div>
                <div className="action-group" style={{ marginTop: '12px' }}>
                  <button type="button" className="ghost-btn" onClick={() => onOpenEditReservation(reservation)}>Edit</button>
                  <button type="button" className="ghost-btn" onClick={() => onDeleteReservation(reservation.id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function App() {
  const [activeView, setActiveView] = useState('dashboard')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState('All')
  const [employees, setEmployees] = useState(initialStaffEmployees)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [shifts, setShifts] = useState([])
  const [scheduleEmployees, setScheduleEmployees] = useState(initialStaffEmployees)
  const [isScheduleLoading, setIsScheduleLoading] = useState(true)
  const [scheduleNotice, setScheduleNotice] = useState('')
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false)
  const [editingShift, setEditingShift] = useState(null)
  const [formData, setFormData] = useState({
    employee_id: '',
    shift_date: '',
    start_time: '',
    end_time: '',
    role: '',
    area: '',
    status: 'Scheduled',
    notes: '',
  })
  const [isSavingShift, setIsSavingShift] = useState(false)
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [employeeForm, setEmployeeForm] = useState(() => buildEmployeeForm())
  const [isLoadingStaff, setIsLoadingStaff] = useState(true)
  const [staffNotice, setStaffNotice] = useState('')
  const [isSavingEmployee, setIsSavingEmployee] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [reservations, setReservations] = useState([])
  const [reservationNotice, setReservationNotice] = useState('')
  const [isReservationsLoading, setIsReservationsLoading] = useState(true)
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false)
  const [editingReservation, setEditingReservation] = useState(null)
  const [reservationForm, setReservationForm] = useState({
    guestName: '',
    phone: '',
    date: '',
    time: '',
    guests: '2',
    tableNumber: '',
    area: 'Main Dining',
    status: 'Booked',
    notes: '',
  })
  const [isSavingReservation, setIsSavingReservation] = useState(false)

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

  useEffect(() => {
    let isMounted = true

    const loadScheduleData = async () => {
      setIsScheduleLoading(true)
      setScheduleNotice('')

      try {
        const [remoteEmployees, remoteShifts] = await Promise.all([getEmployees(), getShifts()])
        if (!isMounted) return

        if (remoteEmployees.length > 0) {
          setEmployees(remoteEmployees)
          setScheduleEmployees(remoteEmployees)
        } else {
          setEmployees(initialStaffEmployees)
          setScheduleEmployees(initialStaffEmployees)
        }

        setShifts(remoteShifts)
      } catch (error) {
        if (!isMounted) return

        setEmployees(initialStaffEmployees)
        setScheduleEmployees(initialStaffEmployees)
        setShifts([])
        setScheduleNotice(error.message || 'Unable to load schedule right now.')
      } finally {
        if (isMounted) {
          setIsScheduleLoading(false)
        }
      }
    }

    loadScheduleData()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadReservations = async () => {
      setIsReservationsLoading(true)
      setReservationNotice('')

      try {
        const remoteReservations = await getReservations()
        if (!isMounted) return
        setReservations(remoteReservations)
      } catch (error) {
        if (!isMounted) return
        setReservations([])
        setReservationNotice(error.message || 'Unable to load reservations right now.')
      } finally {
        if (isMounted) {
          setIsReservationsLoading(false)
        }
      }
    }

    loadReservations()

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

  const parseShiftTimeToMinutes = (value) => {
    if (!value) return null

    const [hours, minutes] = `${value}`.split(':').map(Number)
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
    return hours * 60 + minutes
  }

  const isUnavailableEmployee = (employee) => {
    if (!employee?.status) return false
    const normalized = `${employee.status}`.toLowerCase()
    return normalized.includes('day off') || normalized.includes('vacation') || normalized.includes('sick') || normalized.includes('leave')
  }

  const handleOpenAddShift = () => {
    setEditingShift(null)
    setFormData({
      employee_id: '',
      shift_date: '',
      start_time: '',
      end_time: '',
      role: '',
      area: '',
      status: 'Scheduled',
      notes: '',
    })
    setIsShiftModalOpen(true)
  }

  const handleOpenEditShift = (shift) => {
    setEditingShift(shift)
    setFormData({
      employee_id: shift.employeeId ? String(shift.employeeId) : '',
      shift_date: shift.date ?? '',
      start_time: shift.startTime ?? '',
      end_time: shift.endTime ?? '',
      role: shift.role ?? '',
      area: shift.area ?? '',
      status: shift.status ?? 'Scheduled',
      notes: shift.notes ?? '',
    })
    setIsShiftModalOpen(true)
  }

  const handleCloseShiftModal = () => {
    setIsShiftModalOpen(false)
    setEditingShift(null)
    setFormData({
      employee_id: '',
      shift_date: '',
      start_time: '',
      end_time: '',
      role: '',
      area: '',
      status: 'Scheduled',
      notes: '',
    })
  }

  const handleDeleteShift = async (id) => {
    try {
      await deleteShift(id)
      setShifts((current) => current.filter((shift) => shift.id !== id))
      setScheduleNotice('Shift removed.')
    } catch (error) {
      setScheduleNotice(error.message || 'Unable to delete shift right now.')
    }
  }

  const handleShiftSubmit = async (event) => {
    event.preventDefault()

    console.log('shift formData', formData)

    if (!formData.employee_id) {
      setScheduleNotice('Please select an employee before saving the shift.')
      return
    }

    const employeeId = Number(formData.employee_id)
    const selectedEmployee = scheduleEmployees.find((employee) => employee.id === employeeId)

    if (!selectedEmployee) {
      setScheduleNotice('That employee could not be found in the roster.')
      return
    }

    if (isUnavailableEmployee(selectedEmployee)) {
      setScheduleNotice('That employee is currently unavailable and cannot be assigned to a shift.')
      return
    }

    const startMinutes = parseShiftTimeToMinutes(formData.start_time)
    const endMinutes = parseShiftTimeToMinutes(formData.end_time)

    if (startMinutes === null || endMinutes === null) {
      setScheduleNotice('Please add a valid start and end time.')
      return
    }

    if (endMinutes <= startMinutes) {
      setScheduleNotice('End time cannot be earlier than the start time.')
      return
    }

    const sameDayShifts = shifts.filter((shift) => {
      if (shift.id === editingShift?.id) return false
      return Number(shift.employeeId) === employeeId && shift.date === formData.shift_date
    })

    if (sameDayShifts.length > 0) {
      const overlap = sameDayShifts.some((shift) => {
        const existingStart = parseShiftTimeToMinutes(shift.startTime)
        const existingEnd = parseShiftTimeToMinutes(shift.endTime)
        if (existingStart === null || existingEnd === null) return false
        return startMinutes < existingEnd && endMinutes > existingStart
      })

      if (overlap) {
        setScheduleNotice('This employee already has an overlapping shift on that day.')
        return
      }

      setScheduleNotice('This employee already has a shift scheduled for that day.')
      return
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    const payload = {
      employee_id: formData.employee_id,
      role: formData.role,
      area: formData.area,
      date: formData.shift_date,
      startTime: formData.start_time,
      endTime: formData.end_time,
      status: formData.status,
      notes: formData.notes,
    }

    console.log('[App] saving shift payload', payload)

    try {
      const savedShift = editingShift
        ? await updateShift(editingShift.id, payload)
        : await createShift(payload)

      const resolvedShift = {
        ...savedShift,
        employeeName: savedShift?.employeeName || savedShift?.employees?.full_name || '',
        employees: savedShift?.employees ?? null,
      }

      setShifts((current) => {
        if (editingShift) {
          return current.map((shift) => (shift.id === editingShift.id ? resolvedShift : shift))
        }

        return [resolvedShift, ...current]
      })
      handleCloseShiftModal()
    } catch (error) {
      setScheduleNotice(error.message || 'Unable to save shift right now.')
    } finally {
      setIsSavingShift(false)
    }
  }

  const employeeOptions = useMemo(() => {
    return scheduleEmployees.filter((employee) => !isUnavailableEmployee(employee) || String(employee.id) === formData.employee_id)
  }, [formData.employee_id, scheduleEmployees])

  const handleOpenAddReservation = () => {
    setEditingReservation(null)
    setReservationForm({
      guestName: '',
      phone: '',
      date: '',
      time: '',
      guests: '2',
      tableNumber: '',
      area: 'Main Dining',
      status: 'Booked',
      notes: '',
    })
    setIsReservationModalOpen(true)
  }

  const handleOpenEditReservation = (reservation) => {
    setEditingReservation(reservation)
    setReservationForm({
      guestName: reservation.guestName ?? '',
      phone: reservation.phone ?? '',
      date: reservation.date ?? '',
      time: reservation.time ?? '',
      guests: `${reservation.guests ?? 2}`,
      tableNumber: reservation.tableNumber ?? '',
      area: reservation.area ?? 'Main Dining',
      status: reservation.status ?? 'Booked',
      notes: reservation.notes ?? '',
    })
    setIsReservationModalOpen(true)
  }

  const handleCloseReservationModal = () => {
    setIsReservationModalOpen(false)
    setEditingReservation(null)
    setReservationForm({
      guestName: '',
      phone: '',
      date: '',
      time: '',
      guests: '2',
      tableNumber: '',
      area: 'Main Dining',
      status: 'Booked',
      notes: '',
    })
  }

  const handleDeleteReservation = async (id) => {
    try {
      await deleteReservation(id)
      setReservations((current) => current.filter((reservation) => reservation.id !== id))
      setReservationNotice('Reservation removed.')
    } catch (error) {
      setReservationNotice(error.message || 'Unable to delete reservation right now.')
    }
  }

  const handleReservationSubmit = async (event) => {
    event.preventDefault()

    if (!reservationForm.guestName.trim()) {
      setReservationNotice('Please provide the guest name.')
      return
    }

    setIsSavingReservation(true)
    setReservationNotice('')

    const payload = {
      guestName: reservationForm.guestName.trim(),
      phone: reservationForm.phone.trim(),
      date: reservationForm.date,
      time: reservationForm.time,
      guests: Number(reservationForm.guests) || 2,
      tableNumber: reservationForm.tableNumber.trim(),
      area: reservationForm.area,
      status: reservationForm.status,
      notes: reservationForm.notes.trim(),
    }

    try {
      const savedReservation = editingReservation
        ? await updateReservation(editingReservation.id, payload)
        : await createReservation(payload)

      setReservations((current) => {
        if (editingReservation) {
          return current.map((reservation) => (reservation.id === editingReservation.id ? savedReservation : reservation))
        }

        return [savedReservation, ...current]
      })

      setReservationNotice(editingReservation ? 'Reservation updated.' : 'Reservation created.')
      handleCloseReservationModal()
    } catch (error) {
      setReservationNotice(error.message || 'Unable to save reservation right now.')
    } finally {
      setIsSavingReservation(false)
    }
  }

  const heroTitle = activeView === 'dashboard' ? 'Good morning, Platon 👋' : activeView === 'staff' ? 'Staff management' : activeView === 'schedule' ? 'Schedule management' : 'Reservations management'
  const heroSubtitle = activeView === 'dashboard'
    ? 'Monday, June 29 · Everything is running smoothly.'
    : activeView === 'reservations'
      ? 'Review service flow, seating, and guest arrivals.'
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

        {activeView === 'schedule' ? (
          <ScheduleView
            shifts={shifts}
            employees={scheduleEmployees}
            onOpenAddShift={handleOpenAddShift}
            onOpenEditShift={handleOpenEditShift}
            onDeleteShift={handleDeleteShift}
            isLoading={isScheduleLoading}
            noticeMessage={scheduleNotice}
            isSaving={isSavingShift}
          />
        ) : null}

        {activeView === 'reservations' ? (
          <ReservationsView
            reservations={reservations}
            onOpenAddReservation={handleOpenAddReservation}
            onOpenEditReservation={handleOpenEditReservation}
            onDeleteReservation={handleDeleteReservation}
            isLoading={isReservationsLoading}
            noticeMessage={reservationNotice}
            isSaving={isSavingReservation}
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

        {isShiftModalOpen ? (
          <div className="employee-modal-backdrop" onClick={handleCloseShiftModal}>
            <div className="employee-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Shift form</p>
                  <h3>{editingShift ? 'Edit shift' : 'Add shift'}</h3>
                </div>
                <button type="button" className="icon-btn" onClick={handleCloseShiftModal}>✕</button>
              </div>

              <form className="employee-form" onSubmit={handleShiftSubmit}>
                <div className="form-grid">
                  <label className="form-field">
                    <span>Employee</span>
                    <select
                      value={formData.employee_id}
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          employee_id: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select employee</option>
                      {employeeOptions.map((employee) => (
                        <option key={employee.id} value={String(employee.id)}>
                          {employee.full_name || employee.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Date</span>
                    <input type="date" value={formData.shift_date} onChange={(event) => setFormData((current) => ({ ...current, shift_date: event.target.value }))} required />
                  </label>
                  <label className="form-field">
                    <span>Start Time</span>
                    <input type="time" value={formData.start_time} onChange={(event) => setFormData((current) => ({ ...current, start_time: event.target.value }))} required />
                  </label>
                  <label className="form-field">
                    <span>End Time</span>
                    <input type="time" value={formData.end_time} onChange={(event) => setFormData((current) => ({ ...current, end_time: event.target.value }))} required />
                  </label>
                  <label className="form-field">
                    <span>Role</span>
                    <input value={formData.role} onChange={(event) => setFormData((current) => ({ ...current, role: event.target.value }))} placeholder="Role" />
                  </label>
                  <label className="form-field">
                    <span>Area</span>
                    <input value={formData.area} onChange={(event) => setFormData((current) => ({ ...current, area: event.target.value }))} placeholder="Area" />
                  </label>
                  <label className="form-field">
                    <span>Status</span>
                    <select value={formData.status} onChange={(event) => setFormData((current) => ({ ...current, status: event.target.value }))}>
                      <option value="Scheduled">Scheduled</option>
                      <option value="Confirmed">Confirmed</option>
                      <option value="Pending">Pending</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </label>
                </div>

                <label className="form-field full-width">
                  <span>Notes</span>
                  <textarea rows="4" value={formData.notes} onChange={(event) => setFormData((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
                </label>

                <div className="modal-actions">
                  <button type="button" className="ghost-btn" onClick={handleCloseShiftModal}>Cancel</button>
                  <button type="submit" className="primary-btn" disabled={isSavingShift}>
                    {isSavingShift ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {isReservationModalOpen ? (
          <div className="employee-modal-backdrop" onClick={handleCloseReservationModal}>
            <div className="employee-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Reservation form</p>
                  <h3>{editingReservation ? 'Edit reservation' : 'Add reservation'}</h3>
                </div>
                <button type="button" className="icon-btn" onClick={handleCloseReservationModal}>✕</button>
              </div>

              <form className="employee-form" onSubmit={handleReservationSubmit}>
                <div className="form-grid">
                  <label className="form-field">
                    <span>Guest Name</span>
                    <input value={reservationForm.guestName} onChange={(event) => setReservationForm((current) => ({ ...current, guestName: event.target.value }))} placeholder="Guest Name" required />
                  </label>
                  <label className="form-field">
                    <span>Phone</span>
                    <input value={reservationForm.phone} onChange={(event) => setReservationForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" />
                  </label>
                  <label className="form-field">
                    <span>Date</span>
                    <input type="date" value={reservationForm.date} onChange={(event) => setReservationForm((current) => ({ ...current, date: event.target.value }))} required />
                  </label>
                  <label className="form-field">
                    <span>Time</span>
                    <input type="time" value={reservationForm.time} onChange={(event) => setReservationForm((current) => ({ ...current, time: event.target.value }))} required />
                  </label>
                  <label className="form-field">
                    <span>Guests</span>
                    <input type="number" min="1" value={reservationForm.guests} onChange={(event) => setReservationForm((current) => ({ ...current, guests: event.target.value }))} required />
                  </label>
                  <label className="form-field">
                    <span>Table Number</span>
                    <input value={reservationForm.tableNumber} onChange={(event) => setReservationForm((current) => ({ ...current, tableNumber: event.target.value }))} placeholder="Table Number" />
                  </label>
                  <label className="form-field">
                    <span>Area</span>
                    <input value={reservationForm.area} onChange={(event) => setReservationForm((current) => ({ ...current, area: event.target.value }))} placeholder="Area" />
                  </label>
                  <label className="form-field">
                    <span>Status</span>
                    <select value={reservationForm.status} onChange={(event) => setReservationForm((current) => ({ ...current, status: event.target.value }))}>
                      <option value="Booked">Booked</option>
                      <option value="Confirmed">Confirmed</option>
                      <option value="Seated">Seated</option>
                      <option value="Completed">Completed</option>
                      <option value="Cancelled">Cancelled</option>
                      <option value="No Show">No Show</option>
                    </select>
                  </label>
                </div>

                <label className="form-field full-width">
                  <span>Notes</span>
                  <textarea rows="4" value={reservationForm.notes} onChange={(event) => setReservationForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
                </label>

                <div className="modal-actions">
                  <button type="button" className="ghost-btn" onClick={handleCloseReservationModal}>Cancel</button>
                  <button type="submit" className="primary-btn" disabled={isSavingReservation}>
                    {isSavingReservation ? 'Saving…' : 'Save'}
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
