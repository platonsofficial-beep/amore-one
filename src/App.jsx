import { Fragment, useEffect, useMemo, useState } from 'react'
import './App.css'
import { createEmployee, deleteEmployee, getEmployees, updateEmployee } from './services/staffService'
import { createShift, deleteShift, getShifts, updateShift } from './services/scheduleService'
import { createShiftTemplate, deleteShiftTemplate, getShiftTemplates, updateShiftTemplate } from './services/shiftTemplateService'
import { createPosition, deletePosition, getPositions, reorderPositions, updatePosition } from './services/positionsService'
import { createWeeklyScheduleTemplate, deleteWeeklyScheduleTemplate, getWeeklyScheduleTemplates, getWeeklyTemplateShifts, renameWeeklyScheduleTemplate } from './services/weeklyScheduleTemplateService'
import { createReservation, deleteReservation, getReservations, updateReservation } from './services/reservationService'
import { createInventoryItem, deleteInventoryItem, getInventoryItems, updateInventoryItem } from './services/inventoryService'
import { createSupplier, deleteSupplier, getSuppliers, updateSupplier } from './services/supplierService'

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'staff', label: 'Staff', icon: '👥' },
  { id: 'schedule', label: 'Schedule', icon: '🕒' },
  { id: 'reservations', label: 'Reservations', icon: '🍽️' },
  { id: 'suppliers', label: 'Suppliers', icon: '🚚' },
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
const inventoryCategories = ['Spirits', 'Wines', 'Beers', 'Soft Drinks', 'Coffee', 'Bar Supplies', 'Kitchen', 'Other']
const inventoryStatuses = ['In Stock', 'Low Stock', 'Out of Stock']
const scheduleAreaOptions = ['Bar', 'Service', 'Terrace', 'VIP', 'Lounge', 'Garden', 'Kitchen', 'Reception', 'Other']

function composeShiftTemplates(remoteTemplates = []) {
  return [
    ...remoteTemplates
      .filter((template) => (template.name || '').trim())
      .map((template) => ({
        ...template,
        id: `supabase-${template.id}`,
        templateId: template.id,
        isBuiltIn: false,
      })),
  ]
}

function buildTemplateForm(template = null) {
  return {
    name: template?.name ?? '',
    startTime: normalizeTimeValue(template?.startTime),
    endTime: normalizeTimeValue(template?.endTime),
    defaultRole: template?.defaultRole ?? '',
    defaultArea: template?.defaultArea ?? '',
    notes: template?.notes ?? '',
  }
}

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

function normalizeTimeValue(value) {
  if (!value) return ''

  const raw = `${value}`.trim()
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return ''

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return ''
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return ''

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatTime24(value, fallback = '—') {
  const normalized = normalizeTimeValue(value)
  return normalized || fallback
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

function formatCurrency(value) {
  const amount = Number(value) || 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

function getInventoryStatus(quantity, minimumQuantity, selectedStatus = 'In Stock') {
  const qty = Number(quantity) || 0
  const minQty = Number(minimumQuantity) || 0

  if (qty <= 0) return 'Out of Stock'
  if (qty <= minQty) return 'Low Stock'

  return selectedStatus === 'Low Stock' || selectedStatus === 'Out of Stock' ? 'In Stock' : selectedStatus
}

function buildEmployeeForm(employee = null) {
  const normalizeProfileShift = (shift) => {
    if (!shift) return 'Flexible / Rotating'

    const normalized = `${shift}`.trim().toLowerCase()
    if (normalized === 'day') return 'Morning'
    if (normalized === 'morning') return 'Morning'
    if (normalized === 'evening') return 'Evening'
    if (normalized === 'night') return 'Night'
    if (normalized.includes('flexible') || normalized.includes('rotating')) return 'Flexible / Rotating'

    return 'Flexible / Rotating'
  }

  return {
    fullName: employee?.name ?? '',
    positions: Array.isArray(employee?.positions)
      ? employee.positions.map((position) => String(position.id ?? position.name)).filter(Boolean)
      : [],
    phone: employee?.phone ?? '',
    email: employee?.email ?? '',
    hireDate: toDateInputValue(employee?.hireDate ?? ''),
    salary: employee?.salary ?? '',
    weeklyHours: employee?.weeklyHours ?? '',
    department: employee?.department ?? 'Service',
    shift: normalizeProfileShift(employee?.shift),
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
  onRequestDeleteEmployee,
  isLoading,
  noticeMessage,
  isSaving,
}) {
  const getEmployeePositionsLabel = (employee) => {
    const names = Array.isArray(employee.positions)
      ? employee.positions.map((position) => position.name).filter(Boolean)
      : []

    if (names.length > 0) return names.join(', ')
    return employee.position || 'Unassigned'
  }

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
                  <td>{getEmployeePositionsLabel(employee)}</td>
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
                      <button type="button" className="ghost-btn small" onClick={(event) => {
                        event.stopPropagation()
                        onRequestDeleteEmployee(employee)
                      }}>
                        Delete
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
          </div>

          <div className="drawer-notes">
            <p className="eyebrow">Notes</p>
            <p>{selectedEmployee.notes}</p>
          </div>

          <div className="action-group" style={{ marginTop: '16px' }}>
            <button type="button" className="ghost-btn" onClick={() => onOpenEditEmployee(selectedEmployee)}>Edit</button>
            <button type="button" className="ghost-btn" onClick={() => onRequestDeleteEmployee(selectedEmployee)}>Delete</button>
          </div>
        </aside>
      ) : null}
    </section>
  )
}

function ScheduleView({ shifts, employees, positions, shiftTemplates, weeklyTemplates, onOpenAddShift, onOpenEditShift, onDeleteShift, onCreateGridShift, onUpdateGridShift, onRemoveGridShift, onCopyShiftToNextDay, onCopyShiftToRestOfWeek, onSaveCurrentWeekTemplate, onLoadWeeklyTemplate, onRenameWeeklyTemplate, onDeleteWeeklyTemplate, isLoading, noticeMessage, isSaving }) {
  const [selectedDay, setSelectedDay] = useState(null)
  const [selectedShift, setSelectedShift] = useState(null)
  const [filters, setFilters] = useState({
    department: 'All',
    shift: 'All',
    status: 'All',
    search: '',
  })
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false)
  const [assignmentError, setAssignmentError] = useState('')
  const [assignmentDraft, setAssignmentDraft] = useState({
    templateId: '',
    shiftDate: '',
    employeeId: '',
    positionName: '',
    notes: '',
    showAllEmployees: false,
  })
  const [editingAssignmentShift, setEditingAssignmentShift] = useState(null)
  const [shiftPendingDelete, setShiftPendingDelete] = useState(null)
  const [isSaveWeekTemplateModalOpen, setIsSaveWeekTemplateModalOpen] = useState(false)
  const [saveWeekTemplateName, setSaveWeekTemplateName] = useState('')
  const [selectedWeeklyTemplateId, setSelectedWeeklyTemplateId] = useState('')
  const [isLoadWeekTemplateModalOpen, setIsLoadWeekTemplateModalOpen] = useState(false)
  const [loadWeekOptions, setLoadWeekOptions] = useState({
    employees: true,
    positions: true,
    areas: true,
    times: true,
    notes: true,
  })
  const [renamingTemplateId, setRenamingTemplateId] = useState(null)
  const [renameTemplateName, setRenameTemplateName] = useState('')

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

  const weekDateKeys = useMemo(() => weekDays.map((day) => day.key), [weekDays])

  const currentWeekShifts = useMemo(
    () => shifts.filter((shift) => weekDateKeys.includes(shift.date)),
    [shifts, weekDateKeys],
  )

  const handleOpenSaveWeekTemplateModal = () => {
    setAssignmentError('')
    setSaveWeekTemplateName('')
    setIsSaveWeekTemplateModalOpen(true)
  }

  const handleSaveWeekTemplate = async (event) => {
    event.preventDefault()
    if (!saveWeekTemplateName.trim()) {
      setAssignmentError('Template name is required.')
      return
    }

    try {
      await onSaveCurrentWeekTemplate({
        name: saveWeekTemplateName.trim(),
        weekDays,
        weekShifts: currentWeekShifts,
      })
      setIsSaveWeekTemplateModalOpen(false)
      setSaveWeekTemplateName('')
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to save weekly template right now.')
    }
  }

  const handleOpenLoadWeekTemplateModal = () => {
    if (!selectedWeeklyTemplateId) {
      setAssignmentError('Select a weekly template first.')
      return
    }

    setAssignmentError('')
    setLoadWeekOptions({
      employees: true,
      positions: true,
      areas: true,
      times: true,
      notes: true,
    })
    setIsLoadWeekTemplateModalOpen(true)
  }

  const handleConfirmLoadWeekTemplate = async () => {
    if (!selectedWeeklyTemplateId) {
      setAssignmentError('Select a weekly template first.')
      return
    }

    try {
      await onLoadWeeklyTemplate({
        templateId: selectedWeeklyTemplateId,
        weekDays,
        options: loadWeekOptions,
      })
      setIsLoadWeekTemplateModalOpen(false)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to load weekly template right now.')
    }
  }

  const handleStartRenameWeeklyTemplate = () => {
    if (!selectedWeeklyTemplateId) {
      setAssignmentError('Select a weekly template first.')
      return
    }

    const selectedTemplate = weeklyTemplates.find((template) => String(template.id) === String(selectedWeeklyTemplateId))
    if (!selectedTemplate) {
      setAssignmentError('Selected template was not found.')
      return
    }

    setRenamingTemplateId(selectedTemplate.id)
    setRenameTemplateName(selectedTemplate.name)
    setAssignmentError('')
  }

  const handleSubmitRenameWeeklyTemplate = async (event) => {
    event.preventDefault()
    if (!renamingTemplateId) return

    if (!renameTemplateName.trim()) {
      setAssignmentError('Template name is required.')
      return
    }

    try {
      await onRenameWeeklyTemplate(renamingTemplateId, renameTemplateName.trim())
      setRenamingTemplateId(null)
      setRenameTemplateName('')
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to rename weekly template right now.')
    }
  }

  const handleDeleteSelectedWeeklyTemplate = async () => {
    if (!selectedWeeklyTemplateId) {
      setAssignmentError('Select a weekly template first.')
      return
    }

    try {
      await onDeleteWeeklyTemplate(selectedWeeklyTemplateId)
      setSelectedWeeklyTemplateId('')
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to delete weekly template right now.')
    }
  }

  const parseTimeToMinutes = (value) => {
    if (!value) return Number.MAX_SAFE_INTEGER

    const [hours, minutes] = `${value}`.split(':').map(Number)
    return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes)
  }

  const getEmployeePositionNames = (employee) => {
    if (Array.isArray(employee?.positions) && employee.positions.length > 0) {
      return employee.positions.map((position) => position.name).filter(Boolean)
    }

    if (employee?.position) {
      return `${employee.position}`.split(',').map((item) => item.trim()).filter(Boolean)
    }

    return []
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

  const getTemplatePresentation = (template) => {
    const templateName = `${template?.name ?? ''}`.trim()
    const normalized = templateName.toLowerCase()
    const startMinutes = parseTimeToMinutes(template?.startTime)

    if (normalized.includes('morning') || startMinutes < 12 * 60) {
      return { icon: '☀', label: 'Morning' }
    }

    if (normalized.includes('evening') || (startMinutes >= 12 * 60 && startMinutes < 20 * 60)) {
      return { icon: '🌙', label: 'Evening' }
    }

    return { icon: '🌃', label: 'Night' }
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

  const blendGridRows = useMemo(() => {
    return shiftTemplates.map((template) => {
      const requiredCount = Number(template.requiredCount) > 0 ? Number(template.requiredCount) : 1

      const dayCells = weekDays.map((day) => {
        const dayShifts = shifts
          .filter((shift) => shift.date === day.key)
          .filter((shift) => {
            const matchesTime = normalizeTimeValue(shift.startTime) === normalizeTimeValue(template.startTime)
              && normalizeTimeValue(shift.endTime) === normalizeTimeValue(template.endTime)
            const templateRole = `${template.defaultRole ?? ''}`.trim().toLowerCase()
            const shiftRole = `${shift.role ?? ''}`.trim().toLowerCase()
            const matchesRole = !templateRole || !shiftRole || templateRole === shiftRole
            return matchesTime && matchesRole
          })
          .map((shift) => ({
            ...shift,
            employeeRecord: employees.find((employee) => employee.id === shift.employeeId) ?? null,
          }))

        return {
          day,
          shifts: dayShifts,
          assignedCount: dayShifts.length,
          requiredCount,
        }
      })

      return {
        template,
        requiredCount,
        dayCells,
      }
    })
  }, [employees, shiftTemplates, shifts, weekDays])

  const coverageSummary = useMemo(() => {
    const shortageByRole = new Map()

    blendGridRows.forEach((row) => {
      const roleName = `${row.template.defaultRole || row.template.name || 'Staff'}`.trim()
      row.dayCells.forEach((cell) => {
        const missing = Math.max(0, cell.requiredCount - cell.assignedCount)
        if (missing > 0) {
          shortageByRole.set(roleName, (shortageByRole.get(roleName) ?? 0) + missing)
        }
      })
    })

    const shortages = Array.from(shortageByRole.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([role, count]) => ({ role, count }))

    const totalMissing = shortages.reduce((sum, item) => sum + item.count, 0)
    if (totalMissing === 0) {
      return {
        label: 'Fully Staffed',
        tone: 'staffed',
        details: ['All scheduled positions are covered'],
      }
    }

    const tone = totalMissing <= 2 ? 'attention' : 'understaffed'
    return {
      label: tone === 'attention' ? 'Needs Attention' : 'Understaffed',
      tone,
      details: shortages.slice(0, 2).map((item) => `Need ${item.count} ${item.role}${item.count === 1 ? '' : 's'}`),
    }
  }, [blendGridRows])

  const assignmentTemplate = useMemo(
    () => shiftTemplates.find((template) => template.id === assignmentDraft.templateId) ?? null,
    [assignmentDraft.templateId, shiftTemplates],
  )

  const compatibleEmployees = useMemo(() => {
    if (!assignmentTemplate?.defaultRole) return employees
    const requiredRole = `${assignmentTemplate.defaultRole}`.trim().toLowerCase()
    if (!requiredRole) return employees

    return employees.filter((employee) => getEmployeePositionNames(employee).some((name) => name.toLowerCase() === requiredRole))
  }, [assignmentTemplate, employees])

  const assignmentEmployeeOptions = assignmentDraft.showAllEmployees ? employees : compatibleEmployees

  const selectedAssignmentEmployee = useMemo(
    () => employees.find((employee) => String(employee.id) === assignmentDraft.employeeId) ?? null,
    [assignmentDraft.employeeId, employees],
  )

  const assignmentPositionOptions = useMemo(() => {
    if (!selectedAssignmentEmployee) return []
    return getEmployeePositionNames(selectedAssignmentEmployee)
  }, [selectedAssignmentEmployee])

  const handleOpenAssignmentModal = (template, day) => {
    setSelectedDay(day.key)
    setAssignmentError('')
    setAssignmentDraft({
      templateId: template.id,
      shiftDate: day.key,
      employeeId: '',
      positionName: template.defaultRole || '',
      notes: '',
      showAllEmployees: false,
    })
    setIsAssignmentModalOpen(true)
  }

  const handleCloseAssignmentModal = () => {
    setIsAssignmentModalOpen(false)
    setAssignmentError('')
    setAssignmentDraft({
      templateId: '',
      shiftDate: '',
      employeeId: '',
      positionName: '',
      notes: '',
      showAllEmployees: false,
    })
  }

  const handleCreateAssignment = async (event) => {
    event.preventDefault()

    if (!assignmentDraft.employeeId || !assignmentDraft.templateId || !assignmentDraft.shiftDate || !assignmentDraft.positionName.trim()) {
      setAssignmentError('Please select an employee and position before saving this assignment.')
      return
    }

    const template = shiftTemplates.find((item) => item.id === assignmentDraft.templateId)
    if (!template) {
      setAssignmentError('The selected template is no longer available.')
      return
    }

    try {
      await onCreateGridShift({
        employeeId: assignmentDraft.employeeId,
        shiftDate: assignmentDraft.shiftDate,
        template,
        positionName: assignmentDraft.positionName,
        notes: assignmentDraft.notes,
      })
      handleCloseAssignmentModal()
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to save assignment right now.')
    }
  }

  const handleOpenAssignmentActions = (shift) => {
    setAssignmentError('')
    setEditingAssignmentShift(shift)
  }

  const handleCloseAssignmentActions = () => {
    setAssignmentError('')
    setEditingAssignmentShift(null)
  }

  const handleQuickEditShift = () => {
    if (!editingAssignmentShift) return
    onOpenEditShift(editingAssignmentShift)
    handleCloseAssignmentActions()
  }

  const handleQuickCopyToNextDay = async () => {
    if (!editingAssignmentShift?.id) return
    try {
      await onCopyShiftToNextDay(editingAssignmentShift)
      handleCloseAssignmentActions()
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to copy this shift to the next day.')
    }
  }

  const handleQuickCopyToRestOfWeek = async () => {
    if (!editingAssignmentShift?.id) return

    try {
      await onCopyShiftToRestOfWeek(editingAssignmentShift)
      handleCloseAssignmentActions()
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to copy this shift to the rest of the week.')
    }
  }

  const handleRequestDeleteShift = () => {
    if (!editingAssignmentShift) return
    setShiftPendingDelete(editingAssignmentShift)
    handleCloseAssignmentActions()
  }

  const handleConfirmDeleteShift = async () => {
    if (!shiftPendingDelete?.id) return

    try {
      await onRemoveGridShift(shiftPendingDelete.id)
      setShiftPendingDelete(null)
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to delete this shift right now.')
    }
  }

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

  const handleOpenAddShiftForDate = (date) => {
    onOpenAddShift(date || selectedDate || '')
  }

  return (
    <section className="staff-page">
      <div className="staff-header-card">
        <div>
          <p className="eyebrow">Schedule management</p>
          <h3>Premium weekly roster</h3>
          <p className="staff-subtitle">Coordinate staffing, assignments, and coverage across the week.</p>
        </div>
        <button type="button" className="primary-btn" onClick={() => handleOpenAddShiftForDate(selectedDate)} disabled={isSaving}>
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
          <h3 className={`coverage-status ${coverageSummary.tone}`}>{coverageSummary.label}</h3>
          <p className="coverage-detail">{coverageSummary.details.join(' • ')}</p>
        </article>
      </div>

      <div className="panel staff-panel weekly-template-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Weekly templates</p>
            <h3>Reusable week presets</h3>
          </div>
        </div>

        <div className="weekly-template-toolbar">
          <label className="form-field weekly-template-selector">
            <span>Load Template</span>
            <select value={selectedWeeklyTemplateId} onChange={(event) => setSelectedWeeklyTemplateId(event.target.value)}>
              <option value="">Select weekly template</option>
              {weeklyTemplates.map((template) => (
                <option key={`weekly-template-${template.id}`} value={String(template.id)}>{template.name}</option>
              ))}
            </select>
          </label>

          <div className="action-group">
            <button type="button" className="ghost-btn" onClick={handleOpenSaveWeekTemplateModal} disabled={isSaving}>Save Current Week</button>
            <button type="button" className="ghost-btn" onClick={handleOpenLoadWeekTemplateModal} disabled={isSaving || !selectedWeeklyTemplateId}>Load Template</button>
            <button type="button" className="ghost-btn" onClick={handleStartRenameWeeklyTemplate} disabled={isSaving || !selectedWeeklyTemplateId}>Rename</button>
            <button type="button" className="ghost-btn" onClick={handleDeleteSelectedWeeklyTemplate} disabled={isSaving || !selectedWeeklyTemplateId}>Delete</button>
          </div>
        </div>
      </div>

      <div className="panel staff-panel blend-grid-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Weekly assignment grid</p>
            <h3>Blend-style roster planner</h3>
          </div>
          <button type="button" className="primary-btn" onClick={() => handleOpenAddShiftForDate(selectedDate)} disabled={isSaving}>
            {isSaving ? 'Saving…' : '+ Add Shift'}
          </button>
        </div>

        {shiftTemplates.length === 0 ? (
          <div className="schedule-empty-state">
            <h4>No shift templates available.</h4>
            <p>Create templates first, then assign employees directly in this grid.</p>
          </div>
        ) : (
          <div className="blend-grid-scroll">
            <div className="blend-grid-table" style={{ gridTemplateColumns: `300px repeat(${weekDays.length}, minmax(190px, 1fr))` }}>
              <div className="blend-grid-header blend-grid-header-template">Shift template</div>
              {weekDays.map((day) => (
                <button
                  key={`head-${day.key}`}
                  type="button"
                  className={`blend-grid-header blend-grid-header-day ${selectedDay === day.key ? 'active' : ''}`}
                  onClick={() => setSelectedDay(day.key)}
                >
                  <strong>{day.label}</strong>
                  <span>{day.shortDate}</span>
                </button>
              ))}

              {blendGridRows.map((row) => (
                <Fragment key={`row-${row.template.id}`}>
                  {(() => {
                    const templatePresentation = getTemplatePresentation(row.template)
                    return (
                  <aside key={`template-${row.template.id}`} className="blend-grid-template-cell">
                    <strong>
                      {templatePresentation.icon} {templatePresentation.label}
                    </strong>
                    <p className="blend-grid-template-department">{(row.template.defaultArea || row.template.defaultRole || 'General').toUpperCase()}</p>
                    {row.template.notes ? <p className="blend-grid-template-break">{row.template.notes}</p> : null}
                    <span>{formatTime24(row.template.startTime)} — {formatTime24(row.template.endTime)}</span>
                  </aside>
                    )
                  })()}

                  {row.dayCells.map((cell) => (
                    <div
                      key={`cell-${row.template.id}-${cell.day.key}`}
                      className={`blend-grid-assignment-cell ${selectedDay === cell.day.key ? 'active' : ''} ${cell.assignedCount === 0 ? 'empty' : ''}`}
                      onClick={() => {
                        setSelectedDay(cell.day.key)
                        if (cell.assignedCount === 0) {
                          handleOpenAssignmentModal(row.template, cell.day)
                        }
                      }}
                    >
                      <div className="blend-grid-cell-top">
                        <span>{cell.assignedCount}/{cell.requiredCount}</span>
                        <button
                          type="button"
                          className="schedule-week-day-add"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleOpenAssignmentModal(row.template, cell.day)
                          }}
                          aria-label={`Assign employee to ${row.template.name} on ${cell.day.label}`}
                        >
                          +
                        </button>
                      </div>

                      <div className="blend-grid-pill-list">
                        {cell.shifts.map((shift) => {
                          const employeeName = shift.employees?.full_name || shift.employeeName || shift.employeeRecord?.name || 'Unassigned'
                          const shiftPosition = (shift.role || getEmployeePositionNames(shift.employeeRecord).join(' • ') || 'Unassigned position').replace(/,\s*/g, ' • ')
                          return (
                            <button
                              key={`shift-pill-${shift.id}`}
                              type="button"
                              className="blend-grid-pill"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleOpenAssignmentActions(shift)
                              }}
                            >
                              <span className="blend-grid-pill-name">{employeeName}</span>
                              <small className="blend-grid-pill-role">{shiftPosition}</small>
                            </button>
                          )
                        })}
                      </div>

                      <div className="blend-grid-cell-bottom">
                        <span>{formatTime24(row.template.startTime)} - {formatTime24(row.template.endTime)}</span>
                      </div>
                    </div>
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
        )}
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
                    const employeePosition = shift.role || shift.employeeRecord?.position || 'Team member'
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
                          <span>{formatTime24(shift.startTime)} – {formatTime24(shift.endTime)}</span>
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

      {isSaveWeekTemplateModalOpen ? (
        <div className="employee-modal-backdrop" onClick={() => setIsSaveWeekTemplateModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Save current week</p>
                <h3>Weekly template</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsSaveWeekTemplateModalOpen(false)}>✕</button>
            </div>

            <form className="employee-form" onSubmit={handleSaveWeekTemplate}>
              <label className="form-field">
                <span>Template Name</span>
                <input
                  value={saveWeekTemplateName}
                  onChange={(event) => setSaveWeekTemplateName(event.target.value)}
                  placeholder="Summer 2026"
                  required
                />
              </label>

              {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={() => setIsSaveWeekTemplateModalOpen(false)}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save Current Week'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isLoadWeekTemplateModalOpen ? (
        <div className="employee-modal-backdrop" onClick={() => setIsLoadWeekTemplateModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Load template</p>
                <h3>This will replace the current week's schedule.</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsLoadWeekTemplateModalOpen(false)}>✕</button>
            </div>

            <div className="template-load-options">
              <label className="inline-check-row">
                <input type="checkbox" checked={loadWeekOptions.employees} onChange={(event) => setLoadWeekOptions((current) => ({ ...current, employees: event.target.checked }))} />
                <span>Employees</span>
              </label>
              <label className="inline-check-row">
                <input type="checkbox" checked={loadWeekOptions.positions} onChange={(event) => setLoadWeekOptions((current) => ({ ...current, positions: event.target.checked }))} />
                <span>Positions</span>
              </label>
              <label className="inline-check-row">
                <input type="checkbox" checked={loadWeekOptions.areas} onChange={(event) => setLoadWeekOptions((current) => ({ ...current, areas: event.target.checked }))} />
                <span>Areas</span>
              </label>
              <label className="inline-check-row">
                <input type="checkbox" checked={loadWeekOptions.times} onChange={(event) => setLoadWeekOptions((current) => ({ ...current, times: event.target.checked }))} />
                <span>Start / End Times</span>
              </label>
              <label className="inline-check-row">
                <input type="checkbox" checked={loadWeekOptions.notes} onChange={(event) => setLoadWeekOptions((current) => ({ ...current, notes: event.target.checked }))} />
                <span>Notes (optional)</span>
              </label>
            </div>

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsLoadWeekTemplateModalOpen(false)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmLoadWeekTemplate} disabled={isSaving}>{isSaving ? 'Loading…' : 'Load'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {renamingTemplateId ? (
        <div className="employee-modal-backdrop" onClick={() => setRenamingTemplateId(null)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Rename template</p>
                <h3>Update weekly template name</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setRenamingTemplateId(null)}>✕</button>
            </div>

            <form className="employee-form" onSubmit={handleSubmitRenameWeeklyTemplate}>
              <label className="form-field">
                <span>Template Name</span>
                <input value={renameTemplateName} onChange={(event) => setRenameTemplateName(event.target.value)} required />
              </label>

              {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={() => setRenamingTemplateId(null)}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isSaving}>{isSaving ? 'Saving…' : 'Rename Template'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isAssignmentModalOpen ? (
        <div className="employee-modal-backdrop" onClick={handleCloseAssignmentModal}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Assign employee</p>
                <h3>New assignment</h3>
              </div>
              <button type="button" className="icon-btn" onClick={handleCloseAssignmentModal}>✕</button>
            </div>

            <form className="employee-form" onSubmit={handleCreateAssignment}>
              <label className="form-field">
                <span>Employee</span>
                <select
                  value={assignmentDraft.employeeId}
                  onChange={(event) => {
                    const nextEmployeeId = event.target.value
                    const nextEmployee = employees.find((employee) => String(employee.id) === nextEmployeeId)
                    const nextPositions = nextEmployee ? getEmployeePositionNames(nextEmployee) : []
                    setAssignmentDraft((current) => ({
                      ...current,
                      employeeId: nextEmployeeId,
                      positionName: nextPositions[0] ?? current.positionName,
                    }))
                  }}
                >
                  <option value="">Select employee</option>
                  {assignmentEmployeeOptions.map((employee) => (
                    <option key={`assign-employee-${employee.id}`} value={String(employee.id)}>
                      {employee.full_name || employee.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field form-field-inline-toggle">
                <span>Compatibility</span>
                <label className="inline-check-row">
                  <input
                    type="checkbox"
                    checked={assignmentDraft.showAllEmployees}
                    onChange={(event) => setAssignmentDraft((current) => ({ ...current, showAllEmployees: event.target.checked }))}
                  />
                  <span>Show all employees</span>
                </label>
              </label>

              <label className="form-field">
                <span>Position for this shift</span>
                <select
                  value={assignmentDraft.positionName}
                  onChange={(event) => setAssignmentDraft((current) => ({ ...current, positionName: event.target.value }))}
                >
                  <option value="">Select position</option>
                  {assignmentPositionOptions.map((name) => (
                    <option key={`assignment-position-${name}`} value={name}>{name}</option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Notes</span>
                <textarea
                  rows="3"
                  value={assignmentDraft.notes}
                  onChange={(event) => setAssignmentDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Optional notes"
                />
              </label>

              {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={handleCloseAssignmentModal}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editingAssignmentShift ? (
        <div className="employee-modal-backdrop" onClick={handleCloseAssignmentActions}>
          <div className="employee-modal blend-quick-actions-popover" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Quick actions</p>
                <h3>Shift actions</h3>
              </div>
              <button type="button" className="icon-btn" onClick={handleCloseAssignmentActions}>✕</button>
            </div>

            <div className="quick-actions-list">
              <button type="button" className="quick-action-item" onClick={handleQuickEditShift}>Edit Shift</button>
              <button type="button" className="quick-action-item" onClick={handleQuickCopyToNextDay} disabled={isSaving}>{isSaving ? 'Saving…' : 'Copy to Next Day'}</button>
              <button type="button" className="quick-action-item" onClick={handleQuickCopyToRestOfWeek} disabled={isSaving}>{isSaving ? 'Saving…' : 'Copy to Rest of Week'}</button>
              <button type="button" className="quick-action-item danger" onClick={handleRequestDeleteShift}>Delete Shift</button>
            </div>

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}
          </div>
        </div>
      ) : null}

      {shiftPendingDelete ? (
        <div className="employee-modal-backdrop" onClick={() => setShiftPendingDelete(null)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Delete this shift?</p>
                <h3>Delete this shift?</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setShiftPendingDelete(null)}>✕</button>
            </div>

            <p className="staff-subtitle">Are you sure you want to delete this shift? This action cannot be undone.</p>
            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setShiftPendingDelete(null)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmDeleteShift} disabled={isSaving}>
                {isSaving ? 'Deleting…' : 'Delete Shift'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                <strong>{selectedShift.role || selectedShift.employeeRecord?.position || 'Team member'}</strong>
                <p>{selectedShift.employeeRecord?.department || 'Service'}</p>
              </div>
            </div>

            <div className="drawer-grid">
              <div className="drawer-row"><span>Time</span><strong>{formatTime24(selectedShift.startTime)} – {formatTime24(selectedShift.endTime)}</strong></div>
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
                  <span>{formatTime24(reservation.time)}</span>
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
                  <span>{formatTime24(reservation.time)}</span>
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

function InventoryView({ inventoryItems, onOpenAddItem, onOpenEditItem, onDeleteItem, isLoading, noticeMessage, isSaving, searchTerm }) {
  const filteredItems = useMemo(() => {
    const needle = `${searchTerm}`.trim().toLowerCase()
    if (!needle) return inventoryItems

    return inventoryItems.filter((item) => (
      `${item.itemName} ${item.category} ${item.supplier} ${item.area ?? ''}`.toLowerCase().includes(needle)
    ))
  }, [inventoryItems, searchTerm])

  const overview = useMemo(() => {
    const totalItems = inventoryItems.length
    const lowStockAlerts = inventoryItems.filter((item) => item.status === 'Low Stock').length
    const outOfStock = inventoryItems.filter((item) => item.status === 'Out of Stock').length
    const totalInventoryValue = inventoryItems.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.cost) || 0)), 0)

    return {
      totalItems,
      lowStockAlerts,
      outOfStock,
      totalInventoryValue,
    }
  }, [inventoryItems])

  return (
    <section className="staff-page">
      <div className="staff-header-card">
        <div>
          <p className="eyebrow">Stock & inventory</p>
          <h3>Inventory command center</h3>
          <p className="staff-subtitle">Track quantity, suppliers, and purchasing risk in real time.</p>
        </div>
        <button type="button" className="primary-btn" onClick={onOpenAddItem} disabled={isSaving}>
          {isSaving ? 'Saving…' : '+ Add Item'}
        </button>
      </div>

      <div className="roster-summary-grid inventory-summary-grid">
        <article className="roster-summary-card">
          <p className="eyebrow">Total items</p>
          <h3>{overview.totalItems}</h3>
        </article>
        <article className="roster-summary-card">
          <p className="eyebrow">Low stock alerts</p>
          <h3>{overview.lowStockAlerts}</h3>
        </article>
        <article className="roster-summary-card">
          <p className="eyebrow">Out of stock</p>
          <h3>{overview.outOfStock}</h3>
        </article>
        <article className="roster-summary-card">
          <p className="eyebrow">Total inventory value</p>
          <h3>{formatCurrency(overview.totalInventoryValue)}</h3>
        </article>
      </div>

      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading inventory…</div> : null}

      <div className="panel staff-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Inventory list</p>
            <h3>Current stock</h3>
          </div>
        </div>

        {filteredItems.length === 0 && !isLoading ? (
          <div className="schedule-empty-state">
            <h4>No inventory items yet.</h4>
            <p>Add your first item to begin inventory tracking.</p>
          </div>
        ) : (
          <div className="roster-shift-list">
            {filteredItems.map((item) => (
              <article key={item.id} className="roster-shift-card inventory-item-card">
                <div className="roster-shift-main">
                  <div className="roster-avatar">{getInitials(item.itemName || 'Item')}</div>
                  <div className="roster-shift-copy">
                    <strong>{item.itemName || 'Unnamed item'}</strong>
                    <p>{item.category} • {item.supplier || 'No supplier'}</p>
                  </div>
                </div>

                <div className="roster-shift-meta">
                  <span>Unit: {item.unit || '—'}</span>
                  <span>Qty: {item.quantity}</span>
                </div>
                <div className="roster-shift-meta">
                  <span>Minimum: {item.minimumQuantity}</span>
                  <span>Cost: {formatCurrency(item.cost)}</span>
                </div>
                <div className="roster-shift-meta">
                  <span>Notes: {item.notes || 'No notes'}</span>
                  <span className={`status-pill ${item.status === 'Out of Stock' ? 'inventory-out' : item.status === 'Low Stock' ? 'inventory-low' : 'inventory-in'}`}>{item.status}</span>
                </div>

                <div className="action-group" style={{ marginTop: '12px' }}>
                  <button type="button" className="ghost-btn" onClick={() => onOpenEditItem(item)}>Edit</button>
                  <button type="button" className="ghost-btn" onClick={() => onDeleteItem(item.id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function SuppliersView({ suppliers, onOpenAddSupplier, onOpenEditSupplier, onDeleteSupplier, isLoading, noticeMessage, isSaving, searchTerm, onSearchTermChange }) {
  const filteredSuppliers = useMemo(() => {
    const needle = `${searchTerm}`.trim().toLowerCase()
    if (!needle) return suppliers

    return suppliers.filter((supplier) => (
      `${supplier.companyName} ${supplier.contactPerson} ${supplier.phone} ${supplier.email} ${supplier.address}`.toLowerCase().includes(needle)
    ))
  }, [suppliers, searchTerm])

  return (
    <section className="staff-page">
      <div className="staff-header-card">
        <div>
          <p className="eyebrow">Suppliers</p>
          <h3>Supplier dashboard</h3>
          <p className="staff-subtitle">Manage partners, delivery commitments, and payment terms for procurement.</p>
        </div>
        <button type="button" className="primary-btn" onClick={onOpenAddSupplier} disabled={isSaving}>
          {isSaving ? 'Saving…' : '+ Add Supplier'}
        </button>
      </div>

      <div className="roster-summary-grid suppliers-summary-grid">
        <article className="roster-summary-card">
          <p className="eyebrow">Total suppliers</p>
          <h3>{suppliers.length}</h3>
        </article>
      </div>

      <div className="suppliers-search-bar">
        <label className="staff-search" aria-label="Search suppliers">
          <span>⌕</span>
          <input
            type="text"
            placeholder="Search suppliers"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
          />
        </label>
      </div>

      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading suppliers…</div> : null}

      <div className="panel staff-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Supplier list</p>
            <h3>Partner directory</h3>
          </div>
        </div>

        {filteredSuppliers.length === 0 && !isLoading ? (
          <div className="schedule-empty-state">
            <h4>No suppliers yet.</h4>
            <p>Add your first supplier to start building a trusted network.</p>
          </div>
        ) : (
          <div className="roster-shift-list">
            {filteredSuppliers.map((supplier) => (
              <article key={supplier.id} className="roster-shift-card supplier-card">
                <div className="roster-shift-main">
                  <div className="roster-avatar">{getInitials(supplier.companyName || 'Supplier')}</div>
                  <div className="roster-shift-copy">
                    <strong>{supplier.companyName || 'Unnamed supplier'}</strong>
                    <p>{supplier.contactPerson || 'No contact person'}</p>
                  </div>
                </div>
                <div className="roster-shift-meta">
                  <span>{supplier.phone || 'No phone'}</span>
                  <span>{supplier.email || 'No email'}</span>
                </div>
                <div className="roster-shift-meta">
                  <span>{supplier.paymentTerms || 'No payment terms'}</span>
                  <span>{supplier.deliveryDays || 'No delivery days'}</span>
                </div>
                <div className="roster-shift-meta">
                  <span>{supplier.address || 'No address'}</span>
                </div>
                <div className="drawer-notes">
                  <p>{supplier.notes || 'No notes.'}</p>
                </div>
                <div className="action-group" style={{ marginTop: '12px' }}>
                  <button type="button" className="ghost-btn" onClick={() => onOpenEditSupplier(supplier)}>Edit</button>
                  <button type="button" className="ghost-btn" onClick={() => onDeleteSupplier(supplier.id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function PositionsSettingsView({
  positions,
  isLoading,
  noticeMessage,
  form,
  isSaving,
  editingPositionId,
  onFormChange,
  onSubmit,
  onStartEdit,
  onCancelEdit,
  onRequestDelete,
  onMovePosition,
  getUsageCount,
}) {
  return (
    <section className="staff-page">
      <div className="staff-header-card">
        <div>
          <p className="eyebrow">Settings</p>
          <h3>Positions</h3>
          <p className="staff-subtitle">Create and organize custom positions for any hospitality business.</p>
        </div>
      </div>

      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading positions…</div> : null}

      <div className="panel staff-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Manage positions</p>
            <h3>{editingPositionId ? 'Edit position' : 'Add position'}</h3>
          </div>
        </div>

        <form className="employee-form" onSubmit={onSubmit}>
          <div className="form-grid">
            <label className="form-field">
              <span>Position Name</span>
              <input value={form.name} onChange={(event) => onFormChange({ ...form, name: event.target.value })} placeholder="e.g. Mixologist" required />
            </label>
            <label className="form-field">
              <span>Department</span>
              <select value={form.department} onChange={(event) => onFormChange({ ...form, department: event.target.value })}>
                <option value="Bar">Bar</option>
                <option value="Service">Service</option>
                <option value="Kitchen">Kitchen</option>
                <option value="Management">Management</option>
                <option value="Other">Other</option>
              </select>
            </label>
          </div>

          <div className="modal-actions">
            {editingPositionId ? <button type="button" className="ghost-btn" onClick={onCancelEdit}>Cancel edit</button> : null}
            <button type="submit" className="primary-btn" disabled={isSaving}>{isSaving ? 'Saving…' : editingPositionId ? 'Update Position' : 'Add Position'}</button>
          </div>
        </form>
      </div>

      <div className="panel staff-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Position list</p>
            <h3>{positions.length} positions</h3>
          </div>
        </div>

        {positions.length === 0 && !isLoading ? (
          <div className="schedule-empty-state">
            <h4>No positions found.</h4>
            <p>Add your first custom position.</p>
          </div>
        ) : (
          <div className="positions-list">
            {positions.map((position, index) => {
              const usage = getUsageCount(position)

              return (
                <article key={position.id} className="position-row">
                  <div>
                    <strong>{position.name}</strong>
                    <p>{position.department}</p>
                    {usage > 0 ? <small>Used by {usage} employee{usage === 1 ? '' : 's'}</small> : null}
                  </div>
                  <div className="action-group">
                    <button type="button" className="ghost-btn small" onClick={() => onMovePosition(position, 'up')} disabled={index === 0}>↑</button>
                    <button type="button" className="ghost-btn small" onClick={() => onMovePosition(position, 'down')} disabled={index === positions.length - 1}>↓</button>
                    <button type="button" className="ghost-btn small" onClick={() => onStartEdit(position)}>Rename</button>
                    <button type="button" className="ghost-btn small" onClick={() => onRequestDelete(position)}>Delete</button>
                  </div>
                </article>
              )
            })}
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
  const [shiftTemplates, setShiftTemplates] = useState([])
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [templateForm, setTemplateForm] = useState(() => buildTemplateForm())
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false)
  const [templateNotice, setTemplateNotice] = useState('')
  const [weeklyTemplates, setWeeklyTemplates] = useState([])
  const [isWeeklyTemplatesLoading, setIsWeeklyTemplatesLoading] = useState(true)
  const [formData, setFormData] = useState({
    employee_id: '',
    shift_date: '',
    shift_template: 'custom',
    start_time: '',
    end_time: '',
    role: '',
    area_option: 'Service',
    area_custom: '',
    status: 'Scheduled',
    notes: '',
  })
  const [isSavingShift, setIsSavingShift] = useState(false)
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [employeeForm, setEmployeeForm] = useState(() => buildEmployeeForm())
  const [positions, setPositions] = useState([])
  const [positionsNotice, setPositionsNotice] = useState('')
  const [isPositionsLoading, setIsPositionsLoading] = useState(true)
  const [positionForm, setPositionForm] = useState({
    name: '',
    department: 'Other',
  })
  const [editingPositionId, setEditingPositionId] = useState(null)
  const [isSavingPosition, setIsSavingPosition] = useState(false)
  const [positionPendingDelete, setPositionPendingDelete] = useState(null)
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
  const [inventoryItems, setInventoryItems] = useState([])
  const [inventoryNotice, setInventoryNotice] = useState('')
  const [isInventoryLoading, setIsInventoryLoading] = useState(true)
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false)
  const [editingInventoryItem, setEditingInventoryItem] = useState(null)
  const [inventoryForm, setInventoryForm] = useState({
    itemName: '',
    category: 'Other',
    supplier: '',
    unit: '',
    quantity: '0',
    minimumQuantity: '0',
    cost: '0',
    status: 'In Stock',
    notes: '',
  })
  const [isSavingInventoryItem, setIsSavingInventoryItem] = useState(false)
  const [suppliers, setSuppliers] = useState([])
  const [suppliersNotice, setSuppliersNotice] = useState('')
  const [isSuppliersLoading, setIsSuppliersLoading] = useState(true)
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [supplierForm, setSupplierForm] = useState({
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    paymentTerms: '',
    deliveryDays: '',
    notes: '',
  })
  const [isSavingSupplier, setIsSavingSupplier] = useState(false)
  const [employeePendingDelete, setEmployeePendingDelete] = useState(null)
  const [isDeletingEmployee, setIsDeletingEmployee] = useState(false)

  const todayLabel = new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date())

  useEffect(() => {
    let isMounted = true

    const loadPositions = async () => {
      setIsPositionsLoading(true)
      setPositionsNotice('')

      try {
        const remotePositions = await getPositions()
        if (!isMounted) return
        setPositions(remotePositions)
      } catch (error) {
        if (!isMounted) return
        setPositions([])
        setPositionsNotice(error.message || 'Unable to load positions right now.')
      } finally {
        if (isMounted) {
          setIsPositionsLoading(false)
        }
      }
    }

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

    loadPositions()
    loadEmployees()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadSuppliers = async () => {
      setIsSuppliersLoading(true)
      setSuppliersNotice('')

      try {
        const remoteSuppliers = await getSuppliers()
        if (!isMounted) return
        setSuppliers(remoteSuppliers)
      } catch (error) {
        if (!isMounted) return
        setSuppliers([])
        setSuppliersNotice(error.message || 'Unable to load suppliers right now.')
      } finally {
        if (isMounted) {
          setIsSuppliersLoading(false)
        }
      }
    }

    loadSuppliers()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadInventory = async () => {
      setIsInventoryLoading(true)
      setInventoryNotice('')

      try {
        const remoteInventory = await getInventoryItems()
        if (!isMounted) return
        setInventoryItems(remoteInventory)
      } catch (error) {
        if (!isMounted) return
        setInventoryItems([])
        setInventoryNotice(error.message || 'Unable to load inventory right now.')
      } finally {
        if (isMounted) {
          setIsInventoryLoading(false)
        }
      }
    }

    loadInventory()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadScheduleData = async () => {
      setIsScheduleLoading(true)
      setIsWeeklyTemplatesLoading(true)
      setScheduleNotice('')

      try {
        const [remoteEmployees, remoteShifts, remoteTemplates, remoteWeeklyTemplates] = await Promise.all([getEmployees(), getShifts(), getShiftTemplates(), getWeeklyScheduleTemplates()])
        if (!isMounted) return

        if (remoteEmployees.length > 0) {
          setEmployees(remoteEmployees)
          setScheduleEmployees(remoteEmployees)
        } else {
          setEmployees(initialStaffEmployees)
          setScheduleEmployees(initialStaffEmployees)
        }

        setShifts(remoteShifts)
        setShiftTemplates(composeShiftTemplates(remoteTemplates))
        setWeeklyTemplates(remoteWeeklyTemplates)
      } catch (error) {
        if (!isMounted) return

        setEmployees(initialStaffEmployees)
        setScheduleEmployees(initialStaffEmployees)
        setShifts([])
        setShiftTemplates([])
        setWeeklyTemplates([])
        setScheduleNotice(error.message || 'Unable to load schedule right now.')
      } finally {
        if (isMounted) {
          setIsScheduleLoading(false)
          setIsWeeklyTemplatesLoading(false)
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
      const positionNames = Array.isArray(employee.positions)
        ? employee.positions.map((position) => position.name).join(' ')
        : employee.position

      const matchesSearch = `${employee.name} ${positionNames} ${employee.department}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
      const matchesFilter = activeFilter === 'All' || employee.department === activeFilter
      return matchesSearch && matchesFilter
    })
  }, [activeFilter, employees, searchTerm])

  const isValidEmail = (value) => {
    if (!value) return true
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  }

  const isNumericOrEmpty = (value) => {
    if (value === null || value === undefined || value === '') return true
    const trimmed = `${value}`.trim()
    if (!trimmed) return true
    const cleaned = trimmed.replace(/[$,\s]/g, '')
    if (!cleaned) return true
    return Number.isFinite(Number(cleaned))
  }

  const refreshStaffEmployees = async () => {
    const remoteEmployees = await getEmployees()
    const nextEmployees = remoteEmployees.length > 0 ? remoteEmployees : initialStaffEmployees
    setEmployees(nextEmployees)
    setScheduleEmployees(nextEmployees)
    return nextEmployees
  }

  const refreshPositions = async () => {
    const remotePositions = await getPositions()
    setPositions(remotePositions)
    return remotePositions
  }

  const getPositionUsageCount = (position) => {
    return employees.filter((employee) => {
      if (!Array.isArray(employee.positions)) return false
      return employee.positions.some((item) => (
        String(item.id ?? '') === String(position.id)
        || `${item.name ?? ''}`.trim().toLowerCase() === `${position.name ?? ''}`.trim().toLowerCase()
      ))
    }).length
  }

  const handlePositionSubmit = async (event) => {
    event.preventDefault()

    if (!positionForm.name.trim()) {
      setPositionsNotice('Position name is required.')
      return
    }

    setIsSavingPosition(true)
    setPositionsNotice('')

    try {
      if (editingPositionId) {
        await updatePosition(editingPositionId, {
          name: positionForm.name.trim(),
          department: positionForm.department,
        })
        setPositionsNotice('Position updated.')
      } else {
        await createPosition({
          name: positionForm.name.trim(),
          department: positionForm.department,
          sortOrder: positions.length + 1,
        })
        setPositionsNotice('Position added.')
      }

      await refreshPositions()
      setEditingPositionId(null)
      setPositionForm({ name: '', department: 'Other' })
    } catch (error) {
      setPositionsNotice(error.message || 'Unable to save position right now.')
    } finally {
      setIsSavingPosition(false)
    }
  }

  const handleStartEditPosition = (position) => {
    setEditingPositionId(position.id)
    setPositionForm({
      name: position.name,
      department: position.department,
    })
    setPositionsNotice('')
  }

  const handleCancelEditPosition = () => {
    setEditingPositionId(null)
    setPositionForm({ name: '', department: 'Other' })
  }

  const handleMovePosition = async (position, direction) => {
    const index = positions.findIndex((item) => item.id === position.id)
    if (index < 0) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= positions.length) return

    const reordered = [...positions]
    const [removed] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, removed)

    setPositions(reordered)

    try {
      await reorderPositions(reordered)
      setPositionsNotice('Position order updated.')
      await refreshPositions()
    } catch (error) {
      setPositionsNotice(error.message || 'Unable to reorder positions right now.')
      await refreshPositions()
    }
  }

  const handleRequestDeletePosition = (position) => {
    setPositionPendingDelete(position)
  }

  const handleConfirmDeletePosition = async () => {
    if (!positionPendingDelete?.id) return

    const usage = getPositionUsageCount(positionPendingDelete)
    setIsSavingPosition(true)

    try {
      await deletePosition(positionPendingDelete.id)
      setPositionsNotice(usage > 0 ? 'Position deleted. Employees will need reassignment.' : 'Position deleted.')
      setPositionPendingDelete(null)
      if (editingPositionId === positionPendingDelete.id) {
        handleCancelEditPosition()
      }
      await refreshPositions()
      await refreshStaffEmployees()
    } catch (error) {
      setPositionsNotice(error.message || 'Unable to delete position right now.')
    } finally {
      setIsSavingPosition(false)
    }
  }

  const refreshShiftTemplates = async () => {
    const remoteTemplates = await getShiftTemplates()
    const mergedTemplates = composeShiftTemplates(remoteTemplates)
    setShiftTemplates(mergedTemplates)
    return mergedTemplates
  }

  const refreshWeeklyTemplates = async () => {
    const remoteTemplates = await getWeeklyScheduleTemplates()
    setWeeklyTemplates(remoteTemplates)
    return remoteTemplates
  }

  const handleSaveCurrentWeekTemplate = async ({ name, weekDays, weekShifts }) => {
    if (!name?.trim()) {
      throw new Error('Template name is required.')
    }

    const weekKeyByDate = new Map((weekDays ?? []).map((day, index) => [day.key, index]))
    const templateShifts = (weekShifts ?? [])
      .filter((shift) => weekKeyByDate.has(shift.date))
      .map((shift) => ({
        dayIndex: weekKeyByDate.get(shift.date),
        employeeId: shift.employeeId ?? null,
        role: shift.role ?? '',
        area: shift.area ?? '',
        startTime: normalizeTimeValue(shift.startTime),
        endTime: normalizeTimeValue(shift.endTime),
        status: shift.status ?? 'Scheduled',
        notes: shift.notes ?? '',
      }))
      .filter((shift) => shift.startTime && shift.endTime)

    const dedupe = new Set()
    const uniqueTemplateShifts = templateShifts.filter((shift) => {
      const key = [
        shift.dayIndex,
        shift.employeeId ?? 'none',
        shift.startTime,
        shift.endTime,
        `${shift.role}`.trim().toLowerCase(),
        `${shift.area}`.trim().toLowerCase(),
      ].join('|')
      if (dedupe.has(key)) return false
      dedupe.add(key)
      return true
    })

    await createWeeklyScheduleTemplate({
      name: name.trim(),
      shifts: uniqueTemplateShifts,
    })

    await refreshWeeklyTemplates()
    setScheduleNotice('Weekly template saved.')
  }

  const handleLoadWeeklyTemplate = async ({ templateId, weekDays, options }) => {
    if (!templateId) {
      throw new Error('Select a weekly template first.')
    }

    if (!Array.isArray(weekDays) || weekDays.length === 0) {
      throw new Error('Current week is not available for loading.')
    }

    const templateShifts = await getWeeklyTemplateShifts(templateId)
    const weekDateByIndex = new Map(weekDays.map((day, index) => [index, day.key]))
    const weekDates = new Set(weekDays.map((day) => day.key))

    const targetTemplateShifts = templateShifts
      .map((shift) => ({
        ...shift,
        date: weekDateByIndex.get(shift.dayIndex),
      }))
      .filter((shift) => Boolean(shift.date))

    setIsSavingShift(true)
    setScheduleNotice('')

    try {
      const existingWeekShifts = shifts.filter((shift) => weekDates.has(shift.date))

      for (const existingShift of existingWeekShifts) {
        await deleteShift(existingShift.id)
      }

      const created = []
      const createdKeySet = new Set()

      for (const templateShift of targetTemplateShifts) {
        const normalizedStart = normalizeTimeValue(templateShift.startTime)
        const normalizedEnd = normalizeTimeValue(templateShift.endTime)
        if (!normalizedStart || !normalizedEnd) continue

        const payload = {
          employee_id: options?.employees ? templateShift.employeeId : null,
          date: templateShift.date,
          startTime: options?.times ? normalizedStart : normalizedStart,
          endTime: options?.times ? normalizedEnd : normalizedEnd,
          role: options?.positions ? templateShift.role : '',
          area: options?.areas ? templateShift.area : '',
          status: templateShift.status || 'Scheduled',
          notes: options?.notes ? (templateShift.notes ?? '') : '',
        }

        const dedupeKey = [
          payload.employee_id ?? 'none',
          payload.date,
          payload.startTime,
          payload.endTime,
          `${payload.role ?? ''}`.trim().toLowerCase(),
          `${payload.area ?? ''}`.trim().toLowerCase(),
        ].join('|')

        if (createdKeySet.has(dedupeKey)) {
          continue
        }
        createdKeySet.add(dedupeKey)

        const savedShift = await createShift(payload)
        created.push(savedShift)
      }

      const remainingShifts = shifts.filter((shift) => !weekDates.has(shift.date))
      setShifts([...created, ...remainingShifts])
      setScheduleNotice(`Weekly template loaded (${created.length} shift${created.length === 1 ? '' : 's'} created).`)
    } catch (error) {
      const message = error?.message || 'Unable to load weekly template right now.'
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleRenameWeeklyTemplate = async (templateId, name) => {
    if (!templateId) {
      throw new Error('Select a weekly template first.')
    }

    await renameWeeklyScheduleTemplate(templateId, name)
    await refreshWeeklyTemplates()
    setScheduleNotice('Weekly template renamed.')
  }

  const handleDeleteWeeklyTemplate = async (templateId) => {
    if (!templateId) {
      throw new Error('Select a weekly template first.')
    }

    await deleteWeeklyScheduleTemplate(templateId)
    await refreshWeeklyTemplates()
    setScheduleNotice('Weekly template deleted.')
  }

  const handleOpenAddEmployee = () => {
    setEditingEmployee(null)
    setSaveError('')
    setEmployeeForm(buildEmployeeForm())
    setIsEmployeeModalOpen(true)
  }

  const handleOpenEditEmployee = (employee) => {
    const selectedPositionIds = (employee.positions ?? [])
      .map((position) => {
        if (position.id !== null && position.id !== undefined) {
          return String(position.id)
        }
        const match = positions.find((option) => option.name.toLowerCase() === `${position.name ?? ''}`.toLowerCase())
        return match ? String(match.id) : null
      })
      .filter(Boolean)

    setEditingEmployee(employee)
    setSaveError('')
    setEmployeeForm({
      ...buildEmployeeForm(employee),
      positions: selectedPositionIds,
    })
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
      const message = 'Full Name is required.'
      setSaveError(message)
      setStaffNotice(message)
      return
    }

    if (!Array.isArray(employeeForm.positions) || employeeForm.positions.length === 0) {
      const message = 'Select at least one position.'
      setSaveError(message)
      setStaffNotice(message)
      return
    }

    if (!isValidEmail(employeeForm.email.trim())) {
      const message = 'Please enter a valid email address.'
      setSaveError(message)
      setStaffNotice(message)
      return
    }

    if (!isNumericOrEmpty(employeeForm.salary)) {
      const message = 'Salary must be numeric or empty.'
      setSaveError(message)
      setStaffNotice(message)
      return
    }

    if (!isNumericOrEmpty(employeeForm.weeklyHours)) {
      const message = 'Weekly hours must be numeric or empty.'
      setSaveError(message)
      setStaffNotice(message)
      return
    }

    setIsSavingEmployee(true)
    setSaveError('')

    const selectedPositions = positions.filter((position) => employeeForm.positions.includes(String(position.id)))

    const payload = {
      name: employeeForm.fullName.trim(),
      position: selectedPositions.map((position) => position.name).join(', '),
      positions: selectedPositions,
      phone: employeeForm.phone.trim(),
      email: employeeForm.email.trim(),
      hireDate: employeeForm.hireDate,
      salary: normalizeNumericValue(employeeForm.salary),
      emergencyContact: employeeForm.emergencyContact.trim() || 'Not provided',
      weeklyHours: normalizeNumericValue(employeeForm.weeklyHours),
      notes: employeeForm.notes.trim() || 'No notes yet.',
      shift: employeeForm.shift,
      status: employeeForm.status,
      department: employeeForm.department,
    }

    try {
      const savedEmployee = editingEmployee
        ? await updateEmployee(editingEmployee.id, payload)
        : await createEmployee(payload)

      const refreshedEmployees = await refreshStaffEmployees()
      const nextEmployee = refreshedEmployees.find((employee) => employee.id === savedEmployee.id) ?? {
        ...savedEmployee,
        hireDate: formatHireDate(savedEmployee.hireDate),
      }

      setSelectedEmployee(nextEmployee)
      setStaffNotice(editingEmployee ? 'Employee updated successfully.' : 'Employee added successfully.')
      handleCloseEmployeeModal()
    } catch (error) {
      const message = error.message || 'Unable to save employee right now. Please try again.'
      setStaffNotice(message)
      setSaveError(message)
    } finally {
      setIsSavingEmployee(false)
    }
  }

  const handleRequestDeleteEmployee = (employee) => {
    setEmployeePendingDelete(employee)
  }

  const handleCloseDeleteEmployeeModal = () => {
    setEmployeePendingDelete(null)
  }

  const handleDeleteEmployee = async () => {
    if (!employeePendingDelete?.id) return

    setSaveError('')
    setIsDeletingEmployee(true)

    try {
      await deleteEmployee(employeePendingDelete.id)
      const refreshedEmployees = await refreshStaffEmployees()

      if (selectedEmployee?.id === employeePendingDelete.id) {
        setSelectedEmployee(null)
      } else if (selectedEmployee?.id) {
        const nextSelected = refreshedEmployees.find((employee) => employee.id === selectedEmployee.id) ?? null
        setSelectedEmployee(nextSelected)
      }

      setStaffNotice('Employee removed successfully.')
      handleCloseDeleteEmployeeModal()
    } catch (error) {
      const message = error.message || 'Unable to delete employee right now. Please try again.'
      setStaffNotice(message)
      setSaveError(message)
    } finally {
      setIsDeletingEmployee(false)
    }
  }

  const parseShiftTimeToMinutes = (value) => {
    if (!value) return null

    const [hours, minutes] = `${value}`.split(':').map(Number)
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
    return hours * 60 + minutes
  }

  const getSupabaseErrorMessage = (error) => {
    if (!error) return 'Unknown Supabase error.'
    if (typeof error === 'string' && error.trim()) return error.trim()

    const parts = [
      typeof error.message === 'string' ? error.message : '',
      typeof error.details === 'string' ? error.details : '',
      typeof error.hint === 'string' ? error.hint : '',
    ].map((part) => part.trim()).filter(Boolean)

    if (parts.length > 0) {
      return parts.join(' | ')
    }

    return 'Unknown Supabase error.'
  }

  const getShiftSegments = (startMinutes, endMinutes) => {
    if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
      return []
    }

    if (endMinutes > startMinutes) {
      return [[startMinutes, endMinutes]]
    }

    return [
      [startMinutes, 1440],
      [0, endMinutes],
    ]
  }

  const shiftsOverlap = (startA, endA, startB, endB) => {
    const segmentsA = getShiftSegments(startA, endA)
    const segmentsB = getShiftSegments(startB, endB)

    if (segmentsA.length === 0 || segmentsB.length === 0) {
      return false
    }

    return segmentsA.some(([segmentStartA, segmentEndA]) => (
      segmentsB.some(([segmentStartB, segmentEndB]) => segmentStartA < segmentEndB && segmentEndA > segmentStartB)
    ))
  }

  const getShiftConflict = ({ employeeId, date, startTime, endTime, excludeShiftId = null }) => {
    const normalizedStart = normalizeTimeValue(startTime)
    const normalizedEnd = normalizeTimeValue(endTime)
    const startMinutes = parseShiftTimeToMinutes(normalizedStart)
    const endMinutes = parseShiftTimeToMinutes(normalizedEnd)

    if (!employeeId || !date || startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
      return { type: null }
    }

    const sameDayShifts = shifts.filter((shift) => {
      if (excludeShiftId && String(shift.id) === String(excludeShiftId)) return false
      return Number(shift.employeeId) === Number(employeeId) && shift.date === date
    })

    const duplicate = sameDayShifts.find((shift) => (
      normalizeTimeValue(shift.startTime) === normalizedStart
      && normalizeTimeValue(shift.endTime) === normalizedEnd
    ))

    if (duplicate) {
      return { type: 'duplicate', shift: duplicate }
    }

    const overlap = sameDayShifts.find((shift) => {
      const existingStartMinutes = parseShiftTimeToMinutes(normalizeTimeValue(shift.startTime))
      const existingEndMinutes = parseShiftTimeToMinutes(normalizeTimeValue(shift.endTime))
      if (existingStartMinutes === null || existingEndMinutes === null) return false
      return shiftsOverlap(startMinutes, endMinutes, existingStartMinutes, existingEndMinutes)
    })

    if (overlap) {
      return { type: 'overlap', shift: overlap }
    }

    return { type: null }
  }

  const validateShiftRequiredFields = ({ employeeId, date, startTime, endTime, role, area }) => {
    return Boolean(
      employeeId
      && date
      && normalizeTimeValue(startTime)
      && normalizeTimeValue(endTime)
      && `${role ?? ''}`.trim()
      && `${area ?? ''}`.trim(),
    )
  }

  const refreshScheduleShifts = async () => {
    const remoteShifts = await getShifts()
    setShifts(remoteShifts)
    return remoteShifts
  }

  const getShiftAreaFormState = (areaValue) => {
    const normalized = `${areaValue ?? ''}`.trim()
    if (!normalized) {
      return { area_option: 'Service', area_custom: '' }
    }

    const preset = scheduleAreaOptions.find((option) => option !== 'Other' && option.toLowerCase() === normalized.toLowerCase())
    if (preset) {
      return { area_option: preset, area_custom: '' }
    }

    return { area_option: 'Other', area_custom: normalized }
  }

  const isUnavailableEmployee = (employee) => {
    if (!employee?.status) return false
    const normalized = `${employee.status}`.toLowerCase()
    return normalized.includes('day off') || normalized.includes('vacation') || normalized.includes('sick') || normalized.includes('leave')
  }

  const handleOpenAddShift = (defaultDate = '') => {
    setEditingShift(null)
    setFormData({
      employee_id: '',
      shift_date: defaultDate,
      shift_template: 'custom',
      start_time: '',
      end_time: '',
      role: '',
      area_option: 'Service',
      area_custom: '',
      status: 'Scheduled',
      notes: '',
    })
    setIsShiftModalOpen(true)
  }

  const handleOpenEditShift = (shift) => {
    const areaFormState = getShiftAreaFormState(shift.area)
    const matchedTemplate = shiftTemplates.find((template) => (
      normalizeTimeValue(template.startTime) === normalizeTimeValue(shift.startTime) && normalizeTimeValue(template.endTime) === normalizeTimeValue(shift.endTime)
    ))

    setEditingShift(shift)
    setFormData({
      employee_id: shift.employeeId ? String(shift.employeeId) : '',
      shift_date: shift.date ?? '',
      shift_template: matchedTemplate?.id ?? 'custom',
      start_time: normalizeTimeValue(shift.startTime),
      end_time: normalizeTimeValue(shift.endTime),
      role: shift.role ?? '',
      area_option: areaFormState.area_option,
      area_custom: areaFormState.area_custom,
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
      shift_template: 'custom',
      start_time: '',
      end_time: '',
      role: '',
      area_option: 'Service',
      area_custom: '',
      status: 'Scheduled',
      notes: '',
    })
  }

  const handleDeleteShift = async (id) => {
    try {
      await deleteShift(id)
      await refreshScheduleShifts()
      setScheduleNotice('Shift removed.')
    } catch (error) {
      setScheduleNotice(getSupabaseErrorMessage(error))
    }
  }

  const handleCreateGridShift = async ({ employeeId, shiftDate, template, positionName, notes }) => {
    if (!employeeId || !shiftDate) {
      throw new Error('Please complete all required fields before saving.')
    }

    const startTime = normalizeTimeValue(template?.startTime)
    const endTime = normalizeTimeValue(template?.endTime)
    const area = template?.defaultArea ?? ''
    const role = positionName?.trim() || template?.defaultRole || ''

    if (!validateShiftRequiredFields({ employeeId, date: shiftDate, startTime, endTime, role, area })) {
      throw new Error('Please complete all required fields before saving.')
    }

    const conflict = getShiftConflict({
      employeeId,
      date: shiftDate,
      startTime,
      endTime,
    })

    if (conflict.type === 'duplicate') {
      throw new Error('This employee is already scheduled for this shift.')
    }

    if (conflict.type === 'overlap') {
      throw new Error('This shift overlaps with another shift for this employee.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    const payload = {
      employee_id: employeeId,
      date: shiftDate,
      startTime,
      endTime,
      role,
      area,
      status: 'Scheduled',
      notes: (notes ?? '').trim(),
    }

    try {
      const savedShift = await createShift(payload)
      await refreshScheduleShifts()
      setScheduleNotice('Shift assignment created.')
      return savedShift
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleUpdateGridShift = async (shiftId, updates) => {
    const targetShift = shifts.find((shift) => shift.id === shiftId)
    if (!targetShift) {
      throw new Error('Shift assignment could not be found.')
    }

    if (!updates?.employeeId || !updates?.positionName?.trim()) {
      throw new Error('Please complete all required fields before saving.')
    }

    const targetStart = normalizeTimeValue(targetShift.startTime)
    const targetEnd = normalizeTimeValue(targetShift.endTime)
    const targetArea = targetShift.area ?? ''

    if (!validateShiftRequiredFields({
      employeeId: updates.employeeId,
      date: targetShift.date,
      startTime: targetStart,
      endTime: targetEnd,
      role: updates.positionName.trim(),
      area: targetArea,
    })) {
      throw new Error('Please complete all required fields before saving.')
    }

    const conflict = getShiftConflict({
      employeeId: updates.employeeId,
      date: targetShift.date,
      startTime: targetStart,
      endTime: targetEnd,
      excludeShiftId: shiftId,
    })

    if (conflict.type === 'duplicate') {
      throw new Error('This employee is already scheduled for this shift.')
    }

    if (conflict.type === 'overlap') {
      throw new Error('This shift overlaps with another shift for this employee.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    const payload = {
      employee_id: updates.employeeId,
      date: targetShift.date,
      startTime: targetStart,
      endTime: targetEnd,
      role: updates.positionName.trim(),
      area: targetArea,
      status: updates.status || targetShift.status || 'Scheduled',
      notes: updates.notes ?? targetShift.notes ?? '',
    }

    try {
      const savedShift = await updateShift(shiftId, payload)
      await refreshScheduleShifts()
      setScheduleNotice('Shift assignment updated.')
      return savedShift
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleRemoveGridShift = async (shiftId) => {
    setIsSavingShift(true)
    setScheduleNotice('')

    try {
      await deleteShift(shiftId)
      await refreshScheduleShifts()
      setScheduleNotice('Shift assignment removed.')
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleCopyShiftToNextDay = async (shift) => {
    if (!shift?.id) {
      throw new Error('Shift could not be found for copying.')
    }

    const baseDate = new Date(`${shift.date}T00:00:00`)
    if (Number.isNaN(baseDate.getTime())) {
      throw new Error('Shift date is invalid and cannot be copied.')
    }

    const nextDay = new Date(baseDate)
    nextDay.setDate(baseDate.getDate() + 1)
    const targetDate = nextDay.toISOString().split('T')[0]

    const startTime = normalizeTimeValue(shift.startTime)
    const endTime = normalizeTimeValue(shift.endTime)
    const role = shift.role ?? ''
    const area = shift.area ?? ''

    if (!validateShiftRequiredFields({
      employeeId: shift.employeeId,
      date: targetDate,
      startTime,
      endTime,
      role,
      area,
    })) {
      setScheduleNotice('Please complete all required fields before saving.')
      return
    }

    const conflict = getShiftConflict({
      employeeId: shift.employeeId,
      date: targetDate,
      startTime,
      endTime,
    })

    if (conflict.type === 'duplicate') {
      setScheduleNotice('This employee is already scheduled for this shift.')
      return
    }

    if (conflict.type === 'overlap') {
      setScheduleNotice('This shift overlaps with another shift for this employee.')
      return
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    try {
      const savedShift = await createShift({
        employee_id: shift.employeeId,
        date: targetDate,
        startTime,
        endTime,
        role,
        area,
        status: shift.status ?? 'Scheduled',
        notes: shift.notes ?? '',
      })

      await refreshScheduleShifts()
      setScheduleNotice('Shift copied to next day.')
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleCopyShiftToRestOfWeek = async (shift) => {
    if (!shift?.id) {
      throw new Error('Shift could not be found for copying.')
    }

    const baseDate = new Date(`${shift.date}T00:00:00`)
    if (Number.isNaN(baseDate.getTime())) {
      throw new Error('Shift date is invalid and cannot be copied.')
    }

    const dayOfWeek = baseDate.getDay()
    const daysUntilSunday = (7 - dayOfWeek) % 7
    const endOfWeek = new Date(baseDate)
    endOfWeek.setDate(baseDate.getDate() + daysUntilSunday)

    const targetDates = []
    const cursor = new Date(baseDate)
    cursor.setDate(baseDate.getDate() + 1)
    while (cursor <= endOfWeek) {
      targetDates.push(cursor.toISOString().split('T')[0])
      cursor.setDate(cursor.getDate() + 1)
    }

    if (targetDates.length === 0) {
      setScheduleNotice('No remaining days in this week to copy.')
      return
    }

    const startTime = normalizeTimeValue(shift.startTime)
    const endTime = normalizeTimeValue(shift.endTime)
    const role = shift.role ?? ''
    const area = shift.area ?? ''

    if (!validateShiftRequiredFields({
      employeeId: shift.employeeId,
      date: shift.date,
      startTime,
      endTime,
      role,
      area,
    })) {
      setScheduleNotice('Please complete all required fields before saving.')
      return
    }

    const candidateDates = targetDates.filter((date) => {
      const conflict = getShiftConflict({
        employeeId: shift.employeeId,
        date,
        startTime,
        endTime,
      })
      return !conflict.type
    })

    if (candidateDates.length === 0) {
      setScheduleNotice('No new shifts were created because each target day already has a duplicate or overlapping shift for this employee.')
      return
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    try {
      const created = []
      for (const date of candidateDates) {
        const savedShift = await createShift({
          employee_id: shift.employeeId,
          date,
          startTime,
          endTime,
          role,
          area,
          status: shift.status ?? 'Scheduled',
          notes: shift.notes ?? '',
        })
        created.push(savedShift)
      }

      await refreshScheduleShifts()
      setScheduleNotice(`Copied shift to ${created.length} day${created.length === 1 ? '' : 's'} in the rest of the week.`)
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleShiftSubmit = async (event) => {
    event.preventDefault()

    const normalizedStartTime = normalizeTimeValue(formData.start_time)
    const normalizedEndTime = normalizeTimeValue(formData.end_time)
    const resolvedArea = formData.area_option === 'Other' ? formData.area_custom.trim() : formData.area_option

    if (!validateShiftRequiredFields({
      employeeId: formData.employee_id,
      date: formData.shift_date,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      role: formData.role,
      area: resolvedArea,
    })) {
      setScheduleNotice('Please complete all required fields before saving.')
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

    const startMinutes = parseShiftTimeToMinutes(normalizedStartTime)
    const endMinutes = parseShiftTimeToMinutes(normalizedEndTime)

    if (startMinutes === null || endMinutes === null) {
      setScheduleNotice('Please add a valid start and end time.')
      return
    }

    if (startMinutes === endMinutes) {
      setScheduleNotice('Please add a valid start and end time.')
      return
    }

    const conflict = getShiftConflict({
      employeeId,
      date: formData.shift_date,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      excludeShiftId: editingShift?.id ?? null,
    })

    if (conflict.type === 'duplicate') {
      setScheduleNotice('This employee is already scheduled for this shift.')
      return
    }

    if (conflict.type === 'overlap') {
      setScheduleNotice('This shift overlaps with another shift for this employee.')
      return
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    const payload = {
      employee_id: formData.employee_id,
      role: formData.role,
      area: resolvedArea,
      date: formData.shift_date,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      status: formData.status,
      notes: formData.notes,
    }

    try {
      const savedShift = editingShift
        ? await updateShift(editingShift.id, payload)
        : await createShift(payload)

      await refreshScheduleShifts()
      setScheduleNotice(editingShift ? 'Shift updated successfully.' : 'Shift created successfully.')
      handleCloseShiftModal()
    } catch (error) {
      setScheduleNotice(getSupabaseErrorMessage(error))
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleSelectShiftTemplate = (templateId) => {
    if (templateId === 'custom') {
      setFormData((current) => ({
        ...current,
        shift_template: 'custom',
      }))
      return
    }

    const selectedTemplate = shiftTemplates.find((template) => template.id === templateId)
    if (!selectedTemplate) {
      setFormData((current) => ({
        ...current,
        shift_template: 'custom',
      }))
      return
    }

    setFormData((current) => {
      const nextArea = selectedTemplate.defaultArea?.trim() ? getShiftAreaFormState(selectedTemplate.defaultArea.trim()) : { area_option: current.area_option, area_custom: current.area_custom }

      return {
        ...current,
        shift_template: templateId,
        start_time: normalizeTimeValue(selectedTemplate.startTime) || current.start_time,
        end_time: normalizeTimeValue(selectedTemplate.endTime) || current.end_time,
        role: selectedTemplate.defaultRole?.trim() ? selectedTemplate.defaultRole.trim() : current.role,
        area_option: nextArea.area_option,
        area_custom: nextArea.area_custom,
      }
    })
  }

  const customShiftTemplates = useMemo(
    () => shiftTemplates.filter((template) => !template.isBuiltIn),
    [shiftTemplates],
  )

  const handleOpenTemplateModal = () => {
    setTemplateNotice('')
    setEditingTemplate(null)
    setTemplateForm(buildTemplateForm())
    setIsTemplateModalOpen(true)
  }

  const handleCloseTemplateModal = () => {
    setTemplateNotice('')
    setEditingTemplate(null)
    setTemplateForm(buildTemplateForm())
    setIsTemplateModalOpen(false)
  }

  const handleEditTemplate = (template) => {
    setTemplateNotice('')
    setEditingTemplate(template)
    setTemplateForm(buildTemplateForm(template))
  }

  const handleDeleteTemplate = async (template) => {
    if (!template?.templateId) return

    setIsDeletingTemplate(true)
    setTemplateNotice('')

    try {
      await deleteShiftTemplate(template.templateId)
      await refreshShiftTemplates()

      if (formData.shift_template === template.id) {
        setFormData((current) => ({ ...current, shift_template: 'custom' }))
      }

      if (editingTemplate?.id === template.id) {
        setEditingTemplate(null)
        setTemplateForm(buildTemplateForm())
      }

      setTemplateNotice('Template removed.')
    } catch (error) {
      setTemplateNotice(error.message || 'Unable to delete template right now.')
    } finally {
      setIsDeletingTemplate(false)
    }
  }

  const handleTemplateSubmit = async (event) => {
    event.preventDefault()

    if (!templateForm.name.trim()) {
      setTemplateNotice('Template Name is required.')
      return
    }

    if (!templateForm.startTime || !templateForm.endTime) {
      setTemplateNotice('Start Time and End Time are required.')
      return
    }

    setIsSavingTemplate(true)
    setTemplateNotice('')

    const payload = {
      name: templateForm.name.trim(),
      startTime: templateForm.startTime,
      endTime: templateForm.endTime,
      defaultRole: templateForm.defaultRole.trim(),
      defaultArea: templateForm.defaultArea.trim(),
      notes: templateForm.notes.trim(),
    }

    try {
      const savedTemplate = editingTemplate?.templateId
        ? await updateShiftTemplate(editingTemplate.templateId, payload)
        : await createShiftTemplate(payload)

      const mergedTemplates = await refreshShiftTemplates()
      const selectedTemplate = mergedTemplates.find((template) => template.templateId === savedTemplate.id)

      if (selectedTemplate) {
        setFormData((current) => {
          const nextArea = selectedTemplate.defaultArea?.trim()
            ? getShiftAreaFormState(selectedTemplate.defaultArea.trim())
            : { area_option: current.area_option, area_custom: current.area_custom }

          return {
            ...current,
            shift_template: selectedTemplate.id,
            start_time: normalizeTimeValue(selectedTemplate.startTime) || current.start_time,
            end_time: normalizeTimeValue(selectedTemplate.endTime) || current.end_time,
            role: selectedTemplate.defaultRole?.trim() ? selectedTemplate.defaultRole.trim() : current.role,
            area_option: nextArea.area_option,
            area_custom: nextArea.area_custom,
          }
        })
      }

      setTemplateNotice(editingTemplate ? 'Template updated.' : 'Template created.')
      setEditingTemplate(null)
      setTemplateForm(buildTemplateForm())
    } catch (error) {
      setTemplateNotice(error.message || 'Unable to save template right now.')
    } finally {
      setIsSavingTemplate(false)
    }
  }

  const employeeOptions = useMemo(() => {
    return scheduleEmployees.filter((employee) => !isUnavailableEmployee(employee) || String(employee.id) === formData.employee_id)
  }, [formData.employee_id, scheduleEmployees])

  const selectedShiftEmployee = useMemo(
    () => scheduleEmployees.find((employee) => String(employee.id) === formData.employee_id) ?? null,
    [formData.employee_id, scheduleEmployees],
  )

  const selectedShiftEmployeePositionOptions = useMemo(() => {
    if (!selectedShiftEmployee) return []

    if (Array.isArray(selectedShiftEmployee.positions) && selectedShiftEmployee.positions.length > 0) {
      return selectedShiftEmployee.positions.map((position) => position.name).filter(Boolean)
    }

    return `${selectedShiftEmployee.position ?? ''}`
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
  }, [selectedShiftEmployee])

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
      time: normalizeTimeValue(reservation.time),
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

  const refreshInventory = async () => {
    const remoteInventory = await getInventoryItems()
    setInventoryItems(remoteInventory)
  }

  const handleOpenAddInventoryItem = () => {
    setEditingInventoryItem(null)
    setInventoryForm({
      itemName: '',
      category: 'Other',
      supplier: '',
      unit: '',
      quantity: '0',
      minimumQuantity: '0',
      cost: '0',
      status: 'In Stock',
      notes: '',
    })
    setIsInventoryModalOpen(true)
  }

  const handleOpenEditInventoryItem = (item) => {
    setEditingInventoryItem(item)
    setInventoryForm({
      itemName: item.itemName ?? '',
      category: item.category ?? 'Other',
      supplier: item.supplier ?? '',
      unit: item.unit ?? '',
      quantity: `${item.quantity ?? 0}`,
      minimumQuantity: `${item.minimumQuantity ?? 0}`,
      cost: `${item.cost ?? 0}`,
      status: item.status ?? 'In Stock',
      notes: item.notes ?? '',
    })
    setIsInventoryModalOpen(true)
  }

  const handleCloseInventoryModal = () => {
    setIsInventoryModalOpen(false)
    setEditingInventoryItem(null)
    setInventoryForm({
      itemName: '',
      category: 'Other',
      supplier: '',
      unit: '',
      quantity: '0',
      minimumQuantity: '0',
      cost: '0',
      status: 'In Stock',
      notes: '',
    })
  }

  const handleDeleteInventoryItem = async (id) => {
    try {
      await deleteInventoryItem(id)
      await refreshInventory()
      setInventoryNotice('Inventory item removed.')
    } catch (error) {
      setInventoryNotice(error.message || 'Unable to delete inventory item right now.')
    }
  }

  const handleInventorySubmit = async (event) => {
    event.preventDefault()

    if (!inventoryForm.itemName.trim()) {
      setInventoryNotice('Please provide an item name.')
      return
    }

    setIsSavingInventoryItem(true)
    setInventoryNotice('')

    const quantity = Number(inventoryForm.quantity) || 0
    const minimumQuantity = Number(inventoryForm.minimumQuantity) || 0
    const resolvedStatus = getInventoryStatus(quantity, minimumQuantity, inventoryForm.status)

    const payload = {
      itemName: inventoryForm.itemName.trim(),
      category: inventoryForm.category,
      supplier: inventoryForm.supplier.trim(),
      unit: inventoryForm.unit.trim(),
      quantity,
      minimumQuantity,
      cost: Number(inventoryForm.cost) || 0,
      status: resolvedStatus,
      notes: inventoryForm.notes.trim(),
    }

    try {
      if (editingInventoryItem) {
        await updateInventoryItem(editingInventoryItem.id, payload)
      } else {
        await createInventoryItem(payload)
      }

      await refreshInventory()
      setInventoryNotice(editingInventoryItem ? 'Inventory item updated.' : 'Inventory item created.')
      handleCloseInventoryModal()
    } catch (error) {
      setInventoryNotice(error.message || 'Unable to save inventory item right now.')
    } finally {
      setIsSavingInventoryItem(false)
    }
  }

  const refreshSuppliers = async () => {
    const remoteSuppliers = await getSuppliers()
    setSuppliers(remoteSuppliers)
  }

  const handleOpenAddSupplier = () => {
    setEditingSupplier(null)
    setSupplierForm({
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      paymentTerms: '',
      deliveryDays: '',
      notes: '',
    })
    setIsSupplierModalOpen(true)
  }

  const handleOpenEditSupplier = (supplier) => {
    setEditingSupplier(supplier)
    setSupplierForm({
      companyName: supplier.companyName ?? '',
      contactPerson: supplier.contactPerson ?? '',
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
      address: supplier.address ?? '',
      paymentTerms: supplier.paymentTerms ?? '',
      deliveryDays: supplier.deliveryDays ?? '',
      notes: supplier.notes ?? '',
    })
    setIsSupplierModalOpen(true)
  }

  const handleCloseSupplierModal = () => {
    setIsSupplierModalOpen(false)
    setEditingSupplier(null)
    setSupplierForm({
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      paymentTerms: '',
      deliveryDays: '',
      notes: '',
    })
  }

  const handleDeleteSupplier = async (id) => {
    try {
      await deleteSupplier(id)
      await refreshSuppliers()
      setSuppliersNotice('Supplier removed.')
    } catch (error) {
      setSuppliersNotice(error.message || 'Unable to delete supplier right now.')
    }
  }

  const handleSupplierSubmit = async (event) => {
    event.preventDefault()

    if (!supplierForm.companyName.trim()) {
      setSuppliersNotice('Please provide the company name.')
      return
    }

    setIsSavingSupplier(true)
    setSuppliersNotice('')

    const payload = {
      companyName: supplierForm.companyName.trim(),
      contactPerson: supplierForm.contactPerson.trim(),
      phone: supplierForm.phone.trim(),
      email: supplierForm.email.trim(),
      address: supplierForm.address.trim(),
      paymentTerms: supplierForm.paymentTerms.trim(),
      deliveryDays: supplierForm.deliveryDays.trim(),
      notes: supplierForm.notes.trim(),
    }

    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, payload)
      } else {
        await createSupplier(payload)
      }

      await refreshSuppliers()
      setSuppliersNotice(editingSupplier ? 'Supplier updated.' : 'Supplier created.')
      handleCloseSupplierModal()
    } catch (error) {
      setSuppliersNotice(error.message || 'Unable to save supplier right now.')
    } finally {
      setIsSavingSupplier(false)
    }
  }

  const heroTitle = activeView === 'dashboard'
    ? 'Good morning, Platon 👋'
    : activeView === 'staff'
      ? 'Staff management'
      : activeView === 'schedule'
        ? 'Schedule management'
        : activeView === 'reservations'
          ? 'Reservations management'
          : activeView === 'suppliers'
            ? 'Suppliers management'
          : activeView === 'stock'
            ? 'Inventory management'
            : 'Operations management'
  const heroSubtitle = activeView === 'dashboard'
    ? 'Monday, June 29 · Everything is running smoothly.'
    : activeView === 'reservations'
      ? 'Review service flow, seating, and guest arrivals.'
      : activeView === 'suppliers'
        ? 'Review supplier contacts, terms, and delivery cadence.'
      : activeView === 'stock'
        ? 'Monitor supply health, costs, and replenishment risk.'
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
                placeholder={activeView === 'staff' ? 'Search employee' : activeView === 'stock' ? 'Search inventory item' : activeView === 'suppliers' ? 'Search supplier' : 'Search'}
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
            onRequestDeleteEmployee={handleRequestDeleteEmployee}
            isLoading={isLoadingStaff}
            noticeMessage={staffNotice}
            isSaving={isSavingEmployee}
          />
        ) : null}

        {activeView === 'schedule' ? (
          <ScheduleView
            shifts={shifts}
            employees={scheduleEmployees}
            positions={positions}
            shiftTemplates={shiftTemplates}
            weeklyTemplates={weeklyTemplates}
            onOpenAddShift={handleOpenAddShift}
            onOpenEditShift={handleOpenEditShift}
            onDeleteShift={handleDeleteShift}
            onCreateGridShift={handleCreateGridShift}
            onUpdateGridShift={handleUpdateGridShift}
            onRemoveGridShift={handleRemoveGridShift}
            onCopyShiftToNextDay={handleCopyShiftToNextDay}
            onCopyShiftToRestOfWeek={handleCopyShiftToRestOfWeek}
            onSaveCurrentWeekTemplate={handleSaveCurrentWeekTemplate}
            onLoadWeeklyTemplate={handleLoadWeeklyTemplate}
            onRenameWeeklyTemplate={handleRenameWeeklyTemplate}
            onDeleteWeeklyTemplate={handleDeleteWeeklyTemplate}
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

        {activeView === 'suppliers' ? (
          <SuppliersView
            suppliers={suppliers}
            onOpenAddSupplier={handleOpenAddSupplier}
            onOpenEditSupplier={handleOpenEditSupplier}
            onDeleteSupplier={handleDeleteSupplier}
            isLoading={isSuppliersLoading}
            noticeMessage={suppliersNotice}
            isSaving={isSavingSupplier}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
          />
        ) : null}

        {activeView === 'stock' ? (
          <InventoryView
            inventoryItems={inventoryItems}
            onOpenAddItem={handleOpenAddInventoryItem}
            onOpenEditItem={handleOpenEditInventoryItem}
            onDeleteItem={handleDeleteInventoryItem}
            isLoading={isInventoryLoading}
            noticeMessage={inventoryNotice}
            isSaving={isSavingInventoryItem}
            searchTerm={searchTerm}
          />
        ) : null}

        {activeView === 'settings' ? (
          <PositionsSettingsView
            positions={positions}
            isLoading={isPositionsLoading}
            noticeMessage={positionsNotice}
            form={positionForm}
            isSaving={isSavingPosition}
            editingPositionId={editingPositionId}
            onFormChange={setPositionForm}
            onSubmit={handlePositionSubmit}
            onStartEdit={handleStartEditPosition}
            onCancelEdit={handleCancelEditPosition}
            onRequestDelete={handleRequestDeletePosition}
            onMovePosition={handleMovePosition}
            getUsageCount={getPositionUsageCount}
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
                  <div className="form-field full-width">
                    <span>Positions</span>
                    <div className="positions-checkbox-grid">
                      {positions.map((position) => {
                        const checked = employeeForm.positions.includes(String(position.id))
                        return (
                          <label key={`employee-position-${position.id}`} className="position-check-item">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                setEmployeeForm((current) => {
                                  const next = new Set(current.positions)
                                  if (event.target.checked) {
                                    next.add(String(position.id))
                                  } else {
                                    next.delete(String(position.id))
                                  }

                                  return {
                                    ...current,
                                    positions: Array.from(next),
                                    department: event.target.checked ? position.department : current.department,
                                  }
                                })
                              }}
                            />
                            <span>{position.name}</span>
                            <small>{position.department}</small>
                          </label>
                        )
                      })}
                    </div>
                  </div>
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
                    <span>Weekly Hours</span>
                    <input value={employeeForm.weeklyHours} onChange={(event) => setEmployeeForm((current) => ({ ...current, weeklyHours: event.target.value }))} placeholder="Weekly Hours" />
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
                      <option value="Flexible / Rotating">Flexible / Rotating</option>
                      <option value="Morning">Morning</option>
                      <option value="Evening">Evening</option>
                      <option value="Night">Night</option>
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
                      onChange={(event) => {
                        const nextEmployeeId = event.target.value
                        const nextEmployee = scheduleEmployees.find((employee) => String(employee.id) === nextEmployeeId)
                        const nextRoles = Array.isArray(nextEmployee?.positions) && nextEmployee.positions.length > 0
                          ? nextEmployee.positions.map((position) => position.name).filter(Boolean)
                          : `${nextEmployee?.position ?? ''}`
                            .split(',')
                            .map((name) => name.trim())
                            .filter(Boolean)

                        setFormData((prev) => ({
                          ...prev,
                          employee_id: nextEmployeeId,
                          role: nextRoles[0] ?? prev.role,
                        }))
                      }}
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
                    <input type="date" value={formData.shift_date} onChange={(event) => setFormData((current) => ({ ...current, shift_date: event.target.value }))} />
                  </label>
                  <div className="form-field template-field-row">
                    <label className="form-field">
                      <span>Shift Template</span>
                      <select value={formData.shift_template} onChange={(event) => handleSelectShiftTemplate(event.target.value)}>
                        <option value="custom">Custom</option>
                        {shiftTemplates.length === 0 ? (
                          <option value="" disabled>No custom templates yet</option>
                        ) : null}
                        {shiftTemplates.map((template) => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className="ghost-btn" onClick={handleOpenTemplateModal}>Manage Templates</button>
                  </div>
                  <label className="form-field">
                    <span>Start Time</span>
                    <input
                      type="time"
                      lang="en-GB"
                      step={60}
                      value={formData.start_time}
                      onChange={(event) => setFormData((current) => ({ ...current, shift_template: 'custom', start_time: event.target.value }))}
                    />
                  </label>
                  <label className="form-field">
                    <span>End Time</span>
                    <input
                      type="time"
                      lang="en-GB"
                      step={60}
                      value={formData.end_time}
                      onChange={(event) => setFormData((current) => ({ ...current, shift_template: 'custom', end_time: event.target.value }))}
                    />
                  </label>
                  <label className="form-field">
                    <span>Position</span>
                    <select value={formData.role} onChange={(event) => setFormData((current) => ({ ...current, role: event.target.value }))}>
                      <option value="">Select position</option>
                      {selectedShiftEmployeePositionOptions.map((name) => (
                        <option key={`shift-role-${name}`} value={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Area</span>
                    <select value={formData.area_option} onChange={(event) => setFormData((current) => ({ ...current, area_option: event.target.value }))}>
                      {scheduleAreaOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  {formData.area_option === 'Other' ? (
                    <label className="form-field">
                      <span>Custom Area</span>
                      <input
                        value={formData.area_custom}
                        onChange={(event) => setFormData((current) => ({ ...current, area_custom: event.target.value }))}
                        placeholder="Enter custom area"
                      />
                    </label>
                  ) : null}
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

        {isTemplateModalOpen ? (
          <div className="employee-modal-backdrop" onClick={handleCloseTemplateModal}>
            <div className="employee-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Shift templates</p>
                  <h3>Manage templates</h3>
                </div>
                <button type="button" className="icon-btn" onClick={handleCloseTemplateModal}>✕</button>
              </div>

              <div className="template-list">
                {customShiftTemplates.length === 0 ? (
                  <p className="roster-empty-department">No custom templates yet.</p>
                ) : (
                  customShiftTemplates.map((template) => (
                    <article key={template.id} className="template-item">
                      <div>
                        <strong>{template.name}</strong>
                        <p>{formatTime24(template.startTime)} - {formatTime24(template.endTime)}</p>
                      </div>
                      <div className="action-group">
                        <button type="button" className="ghost-btn small" onClick={() => handleEditTemplate(template)}>Edit</button>
                        <button type="button" className="ghost-btn small" onClick={() => handleDeleteTemplate(template)} disabled={isDeletingTemplate}>
                          {isDeletingTemplate ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>

              <form className="employee-form" onSubmit={handleTemplateSubmit}>
                <div className="form-grid">
                  <label className="form-field">
                    <span>Template Name</span>
                    <input value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} placeholder="Template Name" required />
                  </label>
                  <label className="form-field">
                    <span>Start Time</span>
                    <input type="time" lang="en-GB" step={60} value={templateForm.startTime} onChange={(event) => setTemplateForm((current) => ({ ...current, startTime: event.target.value }))} required />
                  </label>
                  <label className="form-field">
                    <span>End Time</span>
                    <input type="time" lang="en-GB" step={60} value={templateForm.endTime} onChange={(event) => setTemplateForm((current) => ({ ...current, endTime: event.target.value }))} required />
                  </label>
                  <label className="form-field">
                    <span>Default Role</span>
                    <input value={templateForm.defaultRole} onChange={(event) => setTemplateForm((current) => ({ ...current, defaultRole: event.target.value }))} placeholder="Default Role" />
                  </label>
                  <label className="form-field">
                    <span>Default Area</span>
                    <input value={templateForm.defaultArea} onChange={(event) => setTemplateForm((current) => ({ ...current, defaultArea: event.target.value }))} placeholder="Default Area" />
                  </label>
                </div>

                <label className="form-field full-width">
                  <span>Notes</span>
                  <textarea rows="3" value={templateForm.notes} onChange={(event) => setTemplateForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
                </label>

                {templateNotice ? <div className="staff-status-banner">{templateNotice}</div> : null}

                <div className="modal-actions">
                  <button type="button" className="ghost-btn" onClick={() => { setEditingTemplate(null); setTemplateForm(buildTemplateForm()) }}>
                    + New Template
                  </button>
                  <button type="submit" className="primary-btn" disabled={isSavingTemplate}>
                    {isSavingTemplate ? 'Saving…' : editingTemplate ? 'Update Template' : 'Save Template'}
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
                    <input type="time" lang="en-GB" step={60} value={reservationForm.time} onChange={(event) => setReservationForm((current) => ({ ...current, time: event.target.value }))} required />
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

        {isInventoryModalOpen ? (
          <div className="employee-modal-backdrop" onClick={handleCloseInventoryModal}>
            <div className="employee-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Inventory form</p>
                  <h3>{editingInventoryItem ? 'Edit item' : 'Add item'}</h3>
                </div>
                <button type="button" className="icon-btn" onClick={handleCloseInventoryModal}>✕</button>
              </div>

              <form className="employee-form" onSubmit={handleInventorySubmit}>
                <div className="form-grid">
                  <label className="form-field">
                    <span>Item Name</span>
                    <input value={inventoryForm.itemName} onChange={(event) => setInventoryForm((current) => ({ ...current, itemName: event.target.value }))} placeholder="Item Name" required />
                  </label>
                  <label className="form-field">
                    <span>Category</span>
                    <select value={inventoryForm.category} onChange={(event) => setInventoryForm((current) => ({ ...current, category: event.target.value }))}>
                      {inventoryCategories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Supplier</span>
                    <input value={inventoryForm.supplier} onChange={(event) => setInventoryForm((current) => ({ ...current, supplier: event.target.value }))} placeholder="Supplier" />
                  </label>
                  <label className="form-field">
                    <span>Unit</span>
                    <input value={inventoryForm.unit} onChange={(event) => setInventoryForm((current) => ({ ...current, unit: event.target.value }))} placeholder="Unit" />
                  </label>
                  <label className="form-field">
                    <span>Quantity</span>
                    <input type="number" min="0" value={inventoryForm.quantity} onChange={(event) => setInventoryForm((current) => ({ ...current, quantity: event.target.value }))} required />
                  </label>
                  <label className="form-field">
                    <span>Minimum Quantity</span>
                    <input type="number" min="0" value={inventoryForm.minimumQuantity} onChange={(event) => setInventoryForm((current) => ({ ...current, minimumQuantity: event.target.value }))} required />
                  </label>
                  <label className="form-field">
                    <span>Cost</span>
                    <input type="number" min="0" step="0.01" value={inventoryForm.cost} onChange={(event) => setInventoryForm((current) => ({ ...current, cost: event.target.value }))} required />
                  </label>
                  <label className="form-field">
                    <span>Status</span>
                    <select value={inventoryForm.status} onChange={(event) => setInventoryForm((current) => ({ ...current, status: event.target.value }))}>
                      {inventoryStatuses.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="form-field full-width">
                  <span>Notes</span>
                  <textarea rows="4" value={inventoryForm.notes} onChange={(event) => setInventoryForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
                </label>

                <div className="modal-actions">
                  <button type="button" className="ghost-btn" onClick={handleCloseInventoryModal}>Cancel</button>
                  <button type="submit" className="primary-btn" disabled={isSavingInventoryItem}>
                    {isSavingInventoryItem ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {isSupplierModalOpen ? (
          <div className="employee-modal-backdrop" onClick={handleCloseSupplierModal}>
            <div className="employee-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Supplier form</p>
                  <h3>{editingSupplier ? 'Edit supplier' : 'Add supplier'}</h3>
                </div>
                <button type="button" className="icon-btn" onClick={handleCloseSupplierModal}>✕</button>
              </div>

              <form className="employee-form" onSubmit={handleSupplierSubmit}>
                <div className="form-grid">
                  <label className="form-field">
                    <span>Company Name</span>
                    <input value={supplierForm.companyName} onChange={(event) => setSupplierForm((current) => ({ ...current, companyName: event.target.value }))} placeholder="Company Name" required />
                  </label>
                  <label className="form-field">
                    <span>Contact Person</span>
                    <input value={supplierForm.contactPerson} onChange={(event) => setSupplierForm((current) => ({ ...current, contactPerson: event.target.value }))} placeholder="Contact Person" />
                  </label>
                  <label className="form-field">
                    <span>Phone</span>
                    <input value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" />
                  </label>
                  <label className="form-field">
                    <span>Email</span>
                    <input type="email" value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
                  </label>
                  <label className="form-field">
                    <span>Address</span>
                    <input value={supplierForm.address} onChange={(event) => setSupplierForm((current) => ({ ...current, address: event.target.value }))} placeholder="Address" />
                  </label>
                  <label className="form-field">
                    <span>Payment Terms</span>
                    <input value={supplierForm.paymentTerms} onChange={(event) => setSupplierForm((current) => ({ ...current, paymentTerms: event.target.value }))} placeholder="Payment Terms" />
                  </label>
                  <label className="form-field">
                    <span>Delivery Days</span>
                    <input value={supplierForm.deliveryDays} onChange={(event) => setSupplierForm((current) => ({ ...current, deliveryDays: event.target.value }))} placeholder="Delivery Days" />
                  </label>
                </div>

                <label className="form-field full-width">
                  <span>Notes</span>
                  <textarea rows="4" value={supplierForm.notes} onChange={(event) => setSupplierForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
                </label>

                <div className="modal-actions">
                  <button type="button" className="ghost-btn" onClick={handleCloseSupplierModal}>Cancel</button>
                  <button type="submit" className="primary-btn" disabled={isSavingSupplier}>
                    {isSavingSupplier ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {employeePendingDelete ? (
          <div className="employee-modal-backdrop" onClick={handleCloseDeleteEmployeeModal}>
            <div className="employee-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Delete confirmation</p>
                  <h3>Delete employee?</h3>
                </div>
                <button type="button" className="icon-btn" onClick={handleCloseDeleteEmployeeModal}>✕</button>
              </div>

              <p className="welcome-subtitle" style={{ marginTop: 0 }}>
                Are you sure you want to delete this employee? This action cannot be undone.
              </p>

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={handleCloseDeleteEmployeeModal} disabled={isDeletingEmployee}>
                  Cancel
                </button>
                <button type="button" className="primary-btn" onClick={handleDeleteEmployee} disabled={isDeletingEmployee}>
                  {isDeletingEmployee ? 'Deleting…' : 'Delete Employee'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {positionPendingDelete ? (
          <div className="employee-modal-backdrop" onClick={() => setPositionPendingDelete(null)}>
            <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Delete position</p>
                  <h3>Confirm delete</h3>
                </div>
                <button type="button" className="icon-btn" onClick={() => setPositionPendingDelete(null)}>✕</button>
              </div>

              <p className="staff-subtitle">Delete {positionPendingDelete.name}? This action cannot be undone.</p>
              {getPositionUsageCount(positionPendingDelete) > 0 ? (
                <div className="staff-status-banner">
                  Warning: {getPositionUsageCount(positionPendingDelete)} employee{getPositionUsageCount(positionPendingDelete) === 1 ? '' : 's'} currently use this position.
                </div>
              ) : null}

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={() => setPositionPendingDelete(null)}>Cancel</button>
                <button type="button" className="primary-btn" onClick={handleConfirmDeletePosition} disabled={isSavingPosition}>
                  {isSavingPosition ? 'Deleting…' : 'Delete Position'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}

export default App
