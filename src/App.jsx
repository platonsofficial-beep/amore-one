import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { createEmployee, deleteEmployee, getEmployees, updateEmployee } from './services/staffService'
import { createShift, deleteShift, getShifts, updateShift } from './services/scheduleService'
import { createShiftTemplate, deleteShiftTemplate, getShiftTemplates, updateShiftTemplate } from './services/shiftTemplateService'
import { getScheduleCapacities, upsertScheduleCapacity } from './services/scheduleCapacityService'
import { draftMatchesPublishedSnapshot } from './services/publishedShiftService'
import { getWeekSchedulePublicationState, publishWeekSchedule, unpublishWeekSchedule } from './services/schedulePublicationService'
import { createPosition, deletePosition, getPositions, reorderPositions, updatePosition } from './services/positionsService'
import { createWeeklyScheduleTemplate, deleteWeeklyScheduleTemplate, getWeeklyScheduleTemplates, getWeeklyTemplateShifts, renameWeeklyScheduleTemplate } from './services/weeklyScheduleTemplateService'
import { createReservation, deleteReservation, getReservations, updateReservation } from './services/reservationService'
import { createInventoryItem, deleteInventoryItem, getInventoryItems, updateInventoryItem } from './services/inventoryService'
import { createSupplier, deleteSupplier, getSuppliers, updateSupplier } from './services/supplierService'
import {
  addWeeks,
  formatWeekRange,
  getCurrentWeekStartDate,
  getWeekDateKeys,
  getWeekDays,
  getWeekStartDate,
  isCurrentWeek,
  parseLocalDate,
} from './lib/weekUtils'
import {
  buildKnownShiftTemplateIdSet,
  prepareShiftForSave,
  resolveShiftTemplateId,
} from './lib/shiftIntegrity'
import {
  getEmployeeFirstName,
  getEmployeePositionNames,
  getEmployeePrimaryPosition,
  inferAreaFromTemplate,
  isEmployeeAssignedInCell,
  isEmployeeUnavailable,
  resolvePositionForDrop,
} from './lib/scheduleDropUtils'
import {
  buildCloneRawPayload,
  buildShiftCellKeyFromParts,
  buildShiftDedupeKey,
} from './lib/scheduleBulkUtils'
import {
  formatTime24,
  formatTimeRange24,
  normalizeTimeValue,
  TIME_INPUT_PROPS,
} from './lib/timeFormatUtils'
import {
  buildEmployeeWeeklyHoursMap,
  calculateShiftDurationHours,
  formatHoursLabel,
  getAssignmentOvertimeHours,
  getEmployeeHoursTrackerState,
  isAssignmentUsingCustomTime,
  parseWeeklyHoursTarget,
} from './lib/shiftHoursUtils'
import { buildOperationalSnapshot } from './lib/operationalSnapshotUtils'
import {
  buildBrandDisplay,
  buildDashboardGreeting,
  buildProfileChipDisplay,
} from './lib/workspaceProfileUtils'
import {
  MAX_WORKSPACE_LOGO_BYTES,
  WORKSPACE_PROFILE_CURRENCIES,
  WORKSPACE_PROFILE_TIMEZONES,
} from './lib/workspaceProfileOptions'
import {
  EMPTY_WORKSPACE_PROFILE,
  getWorkspaceProfile,
  saveWorkspaceProfile,
} from './services/workspaceProfileService'
import {
  buildDashboardStats,
  buildLiveFloorState,
  buildTodayReservationsSummary,
  buildTodayTimeline,
  countLowStockAlerts,
  isModuleUnavailableMessage,
  resolveLiveDraftShiftsForWeek,
  resolveLiveDraftCapacitiesForWeek,
} from './lib/dashboardUtils'
import {
  formatCurrentDateLabel,
  getCurrentDateKey,
  getLocalNow,
  getTimeGreeting,
} from './lib/currentDateUtils'

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'staff', label: 'Staff', icon: '👥' },
  { id: 'schedule', label: 'Schedule', icon: '🕒' },
  { id: 'reservations', label: 'Reservations', icon: '🍽️' },
  { id: 'suppliers', label: 'Suppliers', icon: '🚚' },
  { id: 'tasks', label: 'Tasks', icon: '✓' },
  { id: 'stock', label: 'Stock', icon: '📦' },
  { id: 'reports', label: 'Reports', icon: '📈' },
  { id: 'settings', label: 'Workspace', icon: '⚙️' },
]

const workspaceSettingsSections = [
  { id: 'profile', label: 'Workspace Profile' },
  { id: 'positions', label: 'Positions' },
]

const quickActions = [
  { label: 'Add Reservation', icon: '+' },
  { label: 'Add Task', icon: '✦' },
  { label: 'Add Staff', icon: '◌' },
  { label: 'Create Order', icon: '↗' },
]

const filters = ['All', 'Bar', 'Service', 'Kitchen', 'Management']
const defaultStaffPositionOptions = [
  'Bar',
  'Service',
  'Food Runner',
  'Drink Runner',
  'Host',
  'Kitchen',
  'Cashier',
  'Manager',
]
const inventoryCategories = ['Spirits', 'Wines', 'Beers', 'Soft Drinks', 'Coffee', 'Bar Supplies', 'Kitchen', 'Other']
const inventoryStatuses = ['In Stock', 'Low Stock', 'Out of Stock']
const scheduleAreaOptions = ['Bar', 'Service', 'Terrace', 'VIP', 'Lounge', 'Garden', 'Kitchen', 'Reception', 'Host', 'Management', 'Other']
const areaPositionCatalog = {
  Bar: ['Bartender', 'Bar Service / PDA', 'Barback', 'Coffee', 'Bar Manager'],
  Service: ['Waiter', 'Food Runner', 'Drink Runner', 'Head Waiter', 'Host / Hostess'],
  Terrace: ['Waiter', 'Food Runner', 'Drink Runner'],
  VIP: ['Head Waiter', 'Host / Hostess', 'Waiter'],
  Garden: ['Waiter', 'Food Runner', 'Drink Runner'],
  Kitchen: ['Head Chef', 'Sous Chef', 'Line Cook', 'Pastry Chef', 'Kitchen Porter'],
}

function inferPositionDepartment(name) {
  const normalized = `${name ?? ''}`.trim().toLowerCase()
  if (!normalized) return 'Other'

  if (normalized.includes('bar')) return 'Bar'
  if (normalized.includes('kitchen') || normalized.includes('chef') || normalized.includes('cook')) return 'Kitchen'
  if (normalized.includes('manager')) return 'Management'
  if (normalized.includes('host') || normalized.includes('service') || normalized.includes('runner') || normalized.includes('waiter')) return 'Service'
  return 'Other'
}

function buildEmployeePositionOptions(positions = []) {
  const merged = []
  const seen = new Set()

  const addPosition = (position) => {
    const name = `${position?.name ?? ''}`.trim()
    if (!name) return
    const key = name.toLowerCase()
    if (seen.has(key)) return

    seen.add(key)
    merged.push({
      id: position?.id ?? null,
      name,
      department: position?.department ?? inferPositionDepartment(name),
      sortOrder: position?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    })
  }

  defaultStaffPositionOptions.forEach((name, index) => {
    const existing = (positions ?? []).find((position) => `${position.name ?? ''}`.trim().toLowerCase() === name.toLowerCase())
    addPosition(existing ?? {
      id: null,
      name,
      department: inferPositionDepartment(name),
      sortOrder: index + 1,
    })
  })

  ;(positions ?? []).forEach((position) => addPosition(position))

  return merged.sort((a, b) => {
    const sortA = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER
    const sortB = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER
    if (sortA !== sortB) return sortA - sortB
    return a.name.localeCompare(b.name)
  })
}

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

function buildScheduleGridTemplates(shiftTemplates = [], visibleWeekShifts = []) {
  if (shiftTemplates.length > 0) {
    return shiftTemplates
  }

  const derived = new Map()

  visibleWeekShifts.forEach((shift) => {
    const templateId = resolveShiftTemplateId(shift)
    const key = templateId
      ? `id:${templateId}`
      : `legacy:${normalizeTimeValue(shift.startTime)}:${normalizeTimeValue(shift.endTime)}:${`${shift.area ?? ''}`.trim().toLowerCase()}:${`${shift.role ?? ''}`.trim().toLowerCase()}`

    if (derived.has(key)) return

    const name = `${shift.role ?? shift.area ?? ''}`.trim() || 'Scheduled shift'
    derived.set(key, {
      id: templateId ? `supabase-${templateId}` : `derived-${derived.size + 1}`,
      templateId: templateId ?? null,
      name,
      startTime: shift.startTime ?? '',
      endTime: shift.endTime ?? '',
      defaultRole: shift.role ?? '',
      defaultArea: shift.area ?? '',
      notes: '',
      isBuiltIn: false,
    })
  })

  return Array.from(derived.values())
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

function getGridShiftIntegrityOptions(shiftTemplates) {
  return {
    knownTemplateIds: buildKnownShiftTemplateIdSet(shiftTemplates),
    requireTemplateId: true,
    shiftTemplatesForInference: shiftTemplates,
  }
}

function getLegacyShiftIntegrityOptions(shiftTemplates, { requireTemplateId = false } = {}) {
  return {
    knownTemplateIds: buildKnownShiftTemplateIdSet(shiftTemplates),
    requireTemplateId,
    shiftTemplatesForInference: shiftTemplates,
  }
}

function getInitials(name) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
}

function OperationalSnapshot({ snapshot, isLoading }) {
  if (isLoading) {
    return (
      <section className="operational-snapshot operational-snapshot-loading" aria-label="Operational snapshot" aria-busy="true">
        <p className="operational-snapshot-loading-text">Loading operational snapshot…</p>
      </section>
    )
  }

  return (
    <section className="operational-snapshot" aria-label="Operational snapshot">
      <div className="operational-snapshot-header">
        <div className="operational-snapshot-intro">
          <p className="operational-snapshot-greeting">{snapshot.greeting}</p>
          {snapshot.businessName ? (
            <p className="operational-snapshot-business">{snapshot.businessName}</p>
          ) : null}
        </div>
        <p className="operational-snapshot-today-label">{snapshot.todayLabel}</p>
      </div>

      <p className="operational-snapshot-section-label">Today&apos;s Schedule</p>

      <div className="operational-snapshot-metrics" aria-label="Today's schedule metrics">
        <article className="operational-snapshot-metric">
          <span className="operational-snapshot-metric-icon" aria-hidden="true">👥</span>
          <div className="operational-snapshot-metric-copy">
            <p className="operational-snapshot-metric-label">Scheduled Staff</p>
            <p className="operational-snapshot-metric-value">{snapshot.scheduledStaff}</p>
          </div>
        </article>
        <article className="operational-snapshot-metric">
          <span className="operational-snapshot-metric-icon" aria-hidden="true">⏱</span>
          <div className="operational-snapshot-metric-copy">
            <p className="operational-snapshot-metric-label">Labour Hours</p>
            <p className="operational-snapshot-metric-value">{snapshot.labourHoursLabel}h</p>
          </div>
        </article>
        <article className={`operational-snapshot-metric ${snapshot.issues > 0 ? 'has-issues' : ''}`}>
          <span className="operational-snapshot-metric-icon" aria-hidden="true">⚠</span>
          <div className="operational-snapshot-metric-copy">
            <p className="operational-snapshot-metric-label">Issues</p>
            <p className="operational-snapshot-metric-value">{snapshot.issues}</p>
          </div>
        </article>
      </div>

      <div className={`operational-snapshot-footer ${snapshot.issues > 0 ? 'needs-attention' : 'ready'}`}>
        <p className="operational-snapshot-status">{snapshot.statusMessage}</p>
        {snapshot.closingMessage ? <p className="operational-snapshot-closing">{snapshot.closingMessage}</p> : null}
      </div>
    </section>
  )
}

function DashboardView({
  stats,
  liveFloor,
  timelineEvents,
  isLoading,
  isLiveFloorLoading,
}) {
  return (
    <>
      <section className="stats-grid" aria-label="Key metrics">
        {stats.map((stat) => (
          <article
            key={stat.id}
            className={`stat-card ${stat.accent}${stat.connected ? '' : ' disconnected'}`}
          >
            <div className="stat-header">
              <p>{stat.title}</p>
              <span className="stat-icon">{stat.icon}</span>
            </div>
            {stat.connected && Array.isArray(stat.metrics) ? (
              <ul className="stat-metrics-list" aria-label={`${stat.title} breakdown`}>
                {stat.metrics.map((metric) => (
                  <li key={metric.label}>
                    <span className="stat-metric-label">{metric.label}:</span>
                    <span className="stat-metric-value">{metric.value}</span>
                  </li>
                ))}
              </ul>
            ) : stat.connected ? (
              <h3>{stat.value}</h3>
            ) : (
              <h3 className="stat-disconnected-value">Not connected yet</h3>
            )}
            {stat.detail ? <p className="stat-detail">{stat.detail}</p> : null}
          </article>
        ))}
      </section>

      <section className="content-grid">
        <article className="panel panel-large">
          <div className="panel-heading">
            <div>
              <p className={`eyebrow${liveFloor.state === 'live' ? ' live-floor-eyebrow-active' : ''}`}>
                {liveFloor.eyebrow}
              </p>
              <h3>{liveFloor.heading}</h3>
            </div>
          </div>
          {isLiveFloorLoading ? (
            <p className="dashboard-empty-state">Loading live floor…</p>
          ) : liveFloor.state === 'unpublished' ? (
            <div className="live-floor-state live-floor-unpublished">
              <p className="live-floor-status-icon" aria-hidden="true">🟡</p>
              <p className="live-floor-status-title">{liveFloor.title}</p>
              <p className="live-floor-status-message">{liveFloor.message}</p>
            </div>
          ) : liveFloor.state === 'idle' ? (
            <div className="live-floor-state live-floor-idle">
              <p className="live-floor-status-title">{liveFloor.title}</p>
              <p className="live-floor-status-message">{liveFloor.message}</p>
            </div>
          ) : (
            <ul className="activity-list timeline-list dashboard-staff-list">
              {liveFloor.onShift.map((member) => (
                <li key={member.shiftId}>
                  <span className="timeline-dot on-shift" />
                  <div className="timeline-content">
                    <div className="timeline-top">
                      <strong>{member.name}</strong>
                      <span>{member.startTimeLabel} – {member.endTimeLabel}</span>
                    </div>
                    <p>{member.position || 'On shift now'}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Today&apos;s timeline</p>
              <h3>Service milestones</h3>
            </div>
          </div>
          {isLoading ? (
            <p className="dashboard-empty-state">Loading today&apos;s timeline…</p>
          ) : timelineEvents.length === 0 ? (
            <p className="dashboard-empty-state">No shifts scheduled for today.</p>
          ) : (
            <ul className="schedule-list">
              {timelineEvents.map((item) => (
                <li key={item.key}>
                  <div className="schedule-time">{item.timeLabel}</div>
                  <div className="schedule-body">
                    <strong>{item.title}</strong>
                    {item.note ? <p>{item.note}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="content-grid secondary-grid">
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

const APP_NAME = typeof __APP_NAME__ !== 'undefined' ? __APP_NAME__ : 'ONE'
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v0.0.0'

function BuildInfoBadge({ compact = false }) {
  const [copyMessage, setCopyMessage] = useState('')

  const handleCopyBuildInfo = async () => {
    const copyText = [
      APP_NAME,
      `Version ${APP_VERSION}`,
    ].join('\n')

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText)
      } else {
        const fallbackTextArea = document.createElement('textarea')
        fallbackTextArea.value = copyText
        document.body.appendChild(fallbackTextArea)
        fallbackTextArea.select()
        document.execCommand('copy')
        document.body.removeChild(fallbackTextArea)
      }

      setCopyMessage('Copied')
      setTimeout(() => setCopyMessage(''), 1800)
    } catch (_error) {
      setCopyMessage('Copy failed')
      setTimeout(() => setCopyMessage(''), 1800)
    }
  }

  return (
    <div className={`build-info-badge ${compact ? 'compact' : ''}`}>
      <div>
        <p className="build-info-name">{APP_NAME}</p>
        <p className="build-info-version">Version {APP_VERSION}</p>
      </div>
      <button type="button" className="ghost-btn small build-copy-btn" onClick={handleCopyBuildInfo}>Copy Build Info</button>
      {copyMessage ? <small className="build-copy-note">{copyMessage}</small> : null}
    </div>
  )
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

  const availablePositionNames = Array.isArray(employee?.positions)
    ? employee.positions.map((position) => `${position?.name ?? ''}`.trim()).filter(Boolean)
    : `${employee?.position ?? ''}`
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)

  const primaryPosition = `${employee?.primaryPosition ?? availablePositionNames[0] ?? ''}`.trim()
  const additionalPositions = Array.from(new Set(
    (Array.isArray(employee?.additionalPositions) ? employee.additionalPositions : availablePositionNames.slice(1))
      .map((name) => `${name ?? ''}`.trim())
      .filter((name) => name && name.toLowerCase() !== primaryPosition.toLowerCase()),
  ))

  return {
    fullName: employee?.name ?? '',
    primaryPosition,
    additionalPositions,
    customPositionName: '',
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
    return 'No positions assigned'
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

function ScheduleView({
  shifts,
  scheduleCapacities,
  employees,
  positions,
  shiftTemplates,
  weeklyTemplates,
  onOpenAddShift,
  onOpenEditShift,
  onDeleteShift,
  onCreateGridShift,
  onUpdateGridShift,
  onUpdateAssignmentTime,
  onMoveGridShift,
  onCopyGridShift,
  onRemoveGridShift,
  onCopyShiftToNextDay,
  onCopyShiftToRestOfWeek,
  onSaveCurrentWeekTemplate,
  onLoadWeeklyTemplate,
  onRenameWeeklyTemplate,
  onDeleteWeeklyTemplate,
  onUpdateCellCapacity,
  onApplyAreaToTemplate,
  onRenameShiftTemplate,
  onEditShiftTemplate,
  onDuplicateShiftTemplate,
  onDeleteShiftTemplate,
  onCopyHistoricalWeek,
  onCopyDay,
  onCopyWeek,
  onClearDay,
  onClearWeek,
  onClearGridCell,
  onAutoFillWeekFromTemplate,
  schedulePublication,
  publishedShifts,
  weekStartDate,
  onWeekStartDateChange,
  onPublishWeekSchedule,
  onUnpublishWeekSchedule,
  isLoading,
  noticeMessage,
  isSaving,
}) {
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
  const [assignmentFieldErrors, setAssignmentFieldErrors] = useState({})
  const [assignmentMissingFields, setAssignmentMissingFields] = useState([])
  const [assignmentDraft, setAssignmentDraft] = useState({
    templateId: '',
    templateName: '',
    shiftDate: '',
    employeeIds: [],
    area: '',
    defaultRole: '',
    startTime: '',
    endTime: '',
    positionName: '',
    templateAreaMissing: false,
    notes: '',
  })
  const [assignmentEmployeeSearch, setAssignmentEmployeeSearch] = useState('')
  const [assignmentEmployeeRoleMap, setAssignmentEmployeeRoleMap] = useState({})
  const [assignmentAreaApplyMode, setAssignmentAreaApplyMode] = useState('once')
  const [capacityPickerKey, setCapacityPickerKey] = useState('')
  const [capacitySavingKey, setCapacitySavingKey] = useState('')
  const [capacityDraftMap, setCapacityDraftMap] = useState({})
  const [capacityCustomValue, setCapacityCustomValue] = useState('')
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
  const [templateActionMenuId, setTemplateActionMenuId] = useState(null)
  const [isDeleteShiftTemplateModalOpen, setIsDeleteShiftTemplateModalOpen] = useState(false)
  const [shiftTemplatePendingDelete, setShiftTemplatePendingDelete] = useState(null)
  const [shiftTemplatePendingRename, setShiftTemplatePendingRename] = useState(null)
  const [shiftTemplateRenameName, setShiftTemplateRenameName] = useState('')
  const [browseWeekAnchorDate, setBrowseWeekAnchorDate] = useState('')
  const [isCopyThisWeekModalOpen, setIsCopyThisWeekModalOpen] = useState(false)
  const [dayActionMenuKey, setDayActionMenuKey] = useState(null)
  const [isCopyDayModalOpen, setIsCopyDayModalOpen] = useState(false)
  const [copyDaySourceDay, setCopyDaySourceDay] = useState(null)
  const [copyDayTargetKey, setCopyDayTargetKey] = useState('')
  const [isClearDayModalOpen, setIsClearDayModalOpen] = useState(false)
  const [clearDayTarget, setClearDayTarget] = useState(null)
  const [isCopyWeekModalOpen, setIsCopyWeekModalOpen] = useState(false)
  const [copyWeekTargetDate, setCopyWeekTargetDate] = useState('')
  const [copyWeekTargetShiftCount, setCopyWeekTargetShiftCount] = useState(0)
  const [isCopyWeekTargetLoading, setIsCopyWeekTargetLoading] = useState(false)
  const [isClearWeekModalOpen, setIsClearWeekModalOpen] = useState(false)
  const [cellActionMenuKey, setCellActionMenuKey] = useState('')
  const [clearCellPending, setClearCellPending] = useState(null)
  const [assignmentTimeEdit, setAssignmentTimeEdit] = useState(null)
  const [isAutoFillModalOpen, setIsAutoFillModalOpen] = useState(false)
  const [autoFillReplaceExisting, setAutoFillReplaceExisting] = useState(false)
  const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false)
  const [isUnpublishConfirmOpen, setIsUnpublishConfirmOpen] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [browseWeekShifts, setBrowseWeekShifts] = useState([])
  const [isBrowseWeekLoading, setIsBrowseWeekLoading] = useState(false)
  const [weekPickerValue, setWeekPickerValue] = useState(weekStartDate)
  const [dragPayload, setDragPayload] = useState(null)
  const [dropTargetKey, setDropTargetKey] = useState('')
  const [pendingShiftDrop, setPendingShiftDrop] = useState(null)
  const dragSessionRef = useRef(null)

  const isDragDropDisabled = isSaving || isPublishing

  const shiftCountByDate = useMemo(() => {
    const counts = {}
    shifts.forEach((shift) => {
      const key = `${shift.date ?? ''}`.slice(0, 10)
      if (!key) return
      counts[key] = (counts[key] ?? 0) + 1
    })
    return counts
  }, [shifts])

  const weekDays = useMemo(
    () => getWeekDays(weekStartDate, { shiftCounts: shiftCountByDate }),
    [shiftCountByDate, weekStartDate],
  )

  useEffect(() => {
    setWeekPickerValue(weekStartDate)
    setCapacityDraftMap({})
    setCapacityPickerKey('')
    setSelectedDay(null)
    setDayActionMenuKey(null)
    setCellActionMenuKey('')
  }, [weekStartDate])

  useEffect(() => {
    let isMounted = true

    if (!browseWeekAnchorDate) {
      setBrowseWeekShifts([])
      setIsBrowseWeekLoading(false)
      return () => {
        isMounted = false
      }
    }

    const loadBrowseWeek = async () => {
      setIsBrowseWeekLoading(true)
      try {
        const browseWeekStart = getWeekStartDate(parseLocalDate(browseWeekAnchorDate))
        const browseKeys = getWeekDateKeys(browseWeekStart)
        const remoteShifts = await getShifts({
          startDate: browseKeys[0],
          endDate: browseKeys[browseKeys.length - 1],
        })
        if (!isMounted) return
        setBrowseWeekShifts(remoteShifts)
      } catch {
        if (!isMounted) return
        setBrowseWeekShifts([])
      } finally {
        if (isMounted) {
          setIsBrowseWeekLoading(false)
        }
      }
    }

    loadBrowseWeek()

    return () => {
      isMounted = false
    }
  }, [browseWeekAnchorDate])

  useEffect(() => {
    let isMounted = true

    if (!copyWeekTargetDate || !isCopyWeekModalOpen) {
      setCopyWeekTargetShiftCount(0)
      setIsCopyWeekTargetLoading(false)
      return () => {
        isMounted = false
      }
    }

    const loadTargetWeekCount = async () => {
      setIsCopyWeekTargetLoading(true)
      try {
        const targetWeekStart = getWeekStartDate(parseLocalDate(copyWeekTargetDate))
        const targetKeys = getWeekDateKeys(targetWeekStart)
        const remoteShifts = await getShifts({
          startDate: targetKeys[0],
          endDate: targetKeys[targetKeys.length - 1],
        })
        if (!isMounted) return
        setCopyWeekTargetShiftCount(remoteShifts.length)
      } catch {
        if (!isMounted) return
        setCopyWeekTargetShiftCount(0)
      } finally {
        if (isMounted) {
          setIsCopyWeekTargetLoading(false)
        }
      }
    }

    loadTargetWeekCount()

    return () => {
      isMounted = false
    }
  }, [copyWeekTargetDate, isCopyWeekModalOpen])

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

  const normalizeShiftDateKey = (value) => {
    if (!value) return ''
    const raw = `${value}`.trim()
    if (!raw) return ''
    if (raw.includes('T')) return raw.split('T')[0]
    return raw.slice(0, 10)
  }

  const resolveTemplateCapacityId = (template) => {
    const rawId = template?.templateId ?? template?.id
    if (typeof rawId === 'string' && rawId.startsWith('supabase-')) {
      return rawId.replace('supabase-', '')
    }
    return rawId
  }

  const buildCapacityKey = (templateId, shiftDate) => `${String(templateId)}:${normalizeShiftDateKey(shiftDate)}`

  const normalizeCellDate = (value) => {
    if (!value) return ''
    const raw = `${value}`.trim()
    if (!raw) return ''
    if (raw.includes('T')) return raw.split('T')[0]
    return raw.slice(0, 10)
  }

  const normalizeCellTime = (value) => normalizeTimeValue(value)

  const normalizeCellArea = (value) => `${value ?? ''}`.trim().toLowerCase()

  const buildLegacyCellKey = ({ shiftDate, startTime, endTime, area }) => {
    return `${normalizeCellDate(shiftDate)}:${normalizeCellTime(startTime)}:${normalizeCellTime(endTime)}:${normalizeCellArea(area)}`
  }

  const getPrimaryCellKey = ({ shiftTemplateId, shiftDate }) => {
    const normalizedDate = normalizeCellDate(shiftDate)
    if (!shiftTemplateId || !normalizedDate) return ''
    return `${String(shiftTemplateId)}:${normalizedDate}`
  }

  const buildCellDropKey = (template, dayKey) => getPrimaryCellKey({
    shiftTemplateId: resolveTemplateCapacityId(template),
    shiftDate: dayKey,
  })

  const getTemplateCellKeys = (template, dayKey) => {
    const normalizedDay = normalizeCellDate(dayKey)
    const templateId = resolveTemplateCapacityId(template)
    const primary = getPrimaryCellKey({ shiftTemplateId: templateId, shiftDate: normalizedDay })
    if (primary) {
      return [primary]
    }

    const legacy = buildLegacyCellKey({
      shiftDate: normalizedDay,
      startTime: template?.startTime,
      endTime: template?.endTime,
      area: template?.defaultArea,
    })
    return legacy ? [legacy] : []
  }

  const getShiftCellKeys = (shift) => {
    const primary = getPrimaryCellKey({
      shiftTemplateId: shift?.shiftTemplateId,
      shiftDate: shift?.date,
    })

    if (primary) {
      return [primary]
    }

    const legacy = buildLegacyCellKey({
      shiftDate: shift?.date,
      startTime: shift?.startTime,
      endTime: shift?.endTime,
      area: shift?.area,
    })

    return legacy ? [legacy] : []
  }

  const visibleWeekShifts = useMemo(
    () => shifts.filter((shift) => weekDateKeys.includes(normalizeCellDate(shift.date))),
    [shifts, weekDateKeys],
  )

  const scheduleGridTemplates = useMemo(
    () => buildScheduleGridTemplates(shiftTemplates, visibleWeekShifts),
    [shiftTemplates, visibleWeekShifts],
  )

  const isWeekPublished = schedulePublication?.status === 'published'
  const hasUnpublishedChanges = isWeekPublished
    && !draftMatchesPublishedSnapshot(visibleWeekShifts, publishedShifts)
  const publicationStatusLabel = isWeekPublished
    ? (hasUnpublishedChanges ? 'Published · Unpublished changes' : 'Published')
    : 'Draft'
  const publicationTimestampLabel = schedulePublication?.publishedAt
    ? new Date(schedulePublication.publishedAt).toLocaleString('en-US')
    : ''

  useEffect(() => {
    console.log("Visible week shifts", visibleWeekShifts)
  }, [visibleWeekShifts])

  const assignmentsByCell = useMemo(() => {
    const map = {}

    visibleWeekShifts.forEach((shift) => {
      const keys = getShiftCellKeys(shift)
      keys.forEach((cellKey) => {
        if (!cellKey) return
        console.log("Cell key", cellKey)
        if (!Array.isArray(map[cellKey])) {
          map[cellKey] = []
        }
        map[cellKey].push(shift)
      })
    })

    console.log("Grid assignments map", map)
    return map
  }, [visibleWeekShifts])

  const capacityLookup = useMemo(() => {
    const lookup = {}
    ;(scheduleCapacities ?? []).forEach((item) => {
      const key = buildCapacityKey(item.shiftTemplateId, item.shiftDate)
      console.log("Capacity key loading", key)
      const parsed = Number(item.requiredCount)
      if (Number.isFinite(parsed) && parsed >= 0) {
        lookup[key] = parsed
      }
    })
    console.log("Capacity lookup", lookup)
    return lookup
  }, [scheduleCapacities])

  const getRequiredCountForCell = (template, dayKey) => {
    const key = buildCapacityKey(resolveTemplateCapacityId(template), dayKey)
    console.log("Capacity key loading", key)
    if (Object.prototype.hasOwnProperty.call(capacityDraftMap, key)) {
      const draftValue = Number(capacityDraftMap[key])
      return Number.isFinite(draftValue) && draftValue >= 0 ? draftValue : 1
    }
    return Object.prototype.hasOwnProperty.call(capacityLookup, key) ? capacityLookup[key] : 1
  }

  const getWeekDaysFromAnchor = (anchorDateInput) => {
    const weekStart = anchorDateInput
      ? getWeekStartDate(parseLocalDate(anchorDateInput))
      : getWeekStartDate(new Date())
    return getWeekDays(weekStart)
  }

  const browseWeekDays = useMemo(() => getWeekDaysFromAnchor(browseWeekAnchorDate), [browseWeekAnchorDate])

  const browsedWeekShifts = browseWeekShifts

  const browsedWeekPreview = useMemo(() => {
    return [...browsedWeekShifts]
      .sort((left, right) => `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`))
      .slice(0, 4)
      .map((shift) => {
        const employeeName = shift.employees?.full_name
          || shift.employeeName
          || employees.find((employee) => String(employee.id) === String(shift.employeeId))?.name
          || 'Unassigned'

        return `${shift.date} · ${formatTimeRange24(shift.startTime, shift.endTime, '-')} · ${employeeName}`
      })
  }, [browsedWeekShifts, employees])

  const weekRangeLabel = (days) => formatWeekRange(days)

  const isBrowseWeekCurrentWeek = useMemo(() => {
    const browseStart = browseWeekDays[0]?.key
    const currentStart = weekDays[0]?.key
    return Boolean(browseStart && currentStart && browseStart === currentStart)
  }, [browseWeekDays, weekDays])

  const handleOpenDeleteShiftTemplateModal = (template) => {
    setTemplateActionMenuId(null)
    setShiftTemplatePendingDelete(template)
    setIsDeleteShiftTemplateModalOpen(true)
    setAssignmentError('')
  }

  const handleConfirmDeleteShiftTemplate = async () => {
    if (!shiftTemplatePendingDelete) return

    try {
      await onDeleteShiftTemplate(shiftTemplatePendingDelete)
      setIsDeleteShiftTemplateModalOpen(false)
      setShiftTemplatePendingDelete(null)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to delete shift template right now.')
    }
  }

  const handleStartRenameShiftTemplate = (template) => {
    setTemplateActionMenuId(null)
    setShiftTemplatePendingRename(template)
    setShiftTemplateRenameName(template?.name ?? '')
    setAssignmentError('')
  }

  const handleSubmitRenameShiftTemplate = async (event) => {
    event.preventDefault()
    if (!shiftTemplatePendingRename) return
    if (!shiftTemplateRenameName.trim()) {
      setAssignmentError('Template name is required.')
      return
    }

    try {
      await onRenameShiftTemplate(shiftTemplatePendingRename, shiftTemplateRenameName.trim())
      setShiftTemplatePendingRename(null)
      setShiftTemplateRenameName('')
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to rename shift template right now.')
    }
  }

  const handleEditShiftTemplateFromCard = (template) => {
    setTemplateActionMenuId(null)
    onEditShiftTemplate(template)
  }

  const handleDuplicateShiftTemplateFromCard = async (template) => {
    setTemplateActionMenuId(null)
    try {
      await onDuplicateShiftTemplate(template)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to duplicate shift template right now.')
    }
  }

  const handleOpenCopyThisWeekModal = () => {
    if (isBrowseWeekCurrentWeek) {
      setAssignmentError('Select a different week to copy from.')
      return
    }
    setAssignmentError('')
    setIsCopyThisWeekModalOpen(true)
  }

  const handlePublishConfirm = async () => {
    if (!weekStartDate) {
      setPublishError('Week start date is missing for publish.')
      return
    }

    setIsPublishing(true)
    setPublishError('')

    try {
      const result = await onPublishWeekSchedule(weekStartDate, weekDateKeys)
      if (!result?.publication || result.publication.status !== 'published') {
        throw new Error('Publish did not complete. The week is still in draft.')
      }

      setIsPublishConfirmOpen(false)
      setAssignmentError('')
      setPublishError('')
    } catch (error) {
      const message = error?.message || 'Unable to publish this week right now.'
      setPublishError(message)
      setAssignmentError(message)
      console.error('[ScheduleView] publish failed:', error)
    } finally {
      setIsPublishing(false)
    }
  }

  const handleConfirmUnpublishSchedule = async () => {
    if (!weekStartDate) return
    setIsPublishing(true)
    try {
      await onUnpublishWeekSchedule(weekStartDate)
      setIsUnpublishConfirmOpen(false)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to unpublish this week right now.')
    } finally {
      setIsPublishing(false)
    }
  }

  const handleConfirmCopyThisWeek = async () => {
    try {
      await onCopyHistoricalWeek({
        sourceWeekDays: browseWeekDays,
        targetWeekDays: weekDays,
      })
      setIsCopyThisWeekModalOpen(false)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to copy this week right now.')
    }
  }

  const copyWeekTargetWeekStart = copyWeekTargetDate
    ? getWeekStartDate(parseLocalDate(copyWeekTargetDate))
    : ''
  const isCopyWeekTargetCurrentWeek = copyWeekTargetWeekStart === weekStartDate

  const handleOpenCopyDayModal = (day) => {
    setDayActionMenuKey(null)
    setCopyDaySourceDay(day)
    const fallbackTarget = weekDays.find((item) => item.key !== day.key)?.key ?? ''
    setCopyDayTargetKey(fallbackTarget)
    setAssignmentError('')
    setIsCopyDayModalOpen(true)
  }

  const handleOpenClearDayModal = (day) => {
    setDayActionMenuKey(null)
    setClearDayTarget(day)
    setAssignmentError('')
    setIsClearDayModalOpen(true)
  }

  const copyDayTargetShiftCount = copyDayTargetKey
    ? visibleWeekShifts.filter((shift) => shift.date === copyDayTargetKey).length
    : 0

  const handleConfirmCopyDay = async () => {
    if (!copyDaySourceDay?.key || !copyDayTargetKey) {
      setAssignmentError('Select a target day first.')
      return
    }

    if (copyDaySourceDay.key === copyDayTargetKey) {
      setAssignmentError('Source and target day must be different.')
      return
    }

    try {
      await onCopyDay({
        sourceDate: copyDaySourceDay.key,
        targetDate: copyDayTargetKey,
        overwrite: copyDayTargetShiftCount > 0,
      })
      setIsCopyDayModalOpen(false)
      setCopyDaySourceDay(null)
      setCopyDayTargetKey('')
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to copy this day right now.')
    }
  }

  const handleConfirmClearDay = async () => {
    if (!clearDayTarget?.key) return

    try {
      await onClearDay(clearDayTarget.key)
      setIsClearDayModalOpen(false)
      setClearDayTarget(null)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to clear this day right now.')
    }
  }

  const handleOpenCopyWeekModal = () => {
    setCopyWeekTargetDate('')
    setCopyWeekTargetShiftCount(0)
    setAssignmentError('')
    setIsCopyWeekModalOpen(true)
  }

  const handleConfirmCopyWeek = async () => {
    if (!copyWeekTargetDate) {
      setAssignmentError('Select a target week first.')
      return
    }

    if (isCopyWeekTargetCurrentWeek) {
      setAssignmentError('Select a different week as the copy target.')
      return
    }

    const sourceShiftCount = visibleWeekShifts.length
    if (sourceShiftCount === 0) {
      setAssignmentError('Current week has no assignments to copy.')
      return
    }

    try {
      await onCopyWeek({
        sourceWeekDays: weekDays,
        targetWeekStartDate: copyWeekTargetWeekStart,
        overwrite: copyWeekTargetShiftCount > 0,
      })
      setIsCopyWeekModalOpen(false)
      setCopyWeekTargetDate('')
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to copy week right now.')
    }
  }

  const handleOpenClearWeekModal = () => {
    setAssignmentError('')
    setIsClearWeekModalOpen(true)
  }

  const handleConfirmClearWeek = async () => {
    if (visibleWeekShifts.length === 0) {
      setAssignmentError('This week is already empty.')
      return
    }

    try {
      await onClearWeek(weekDays)
      setIsClearWeekModalOpen(false)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to clear this week right now.')
    }
  }

  const buildCellActionMenuKey = (template, dayKey) => `${resolveTemplateCapacityId(template)}|${normalizeCellDate(dayKey)}`

  const handleOpenClearCellModal = (template, cell) => {
    setCellActionMenuKey('')
    setClearCellPending({
      template,
      day: cell.day,
      shifts: cell.shifts,
      templateName: template.name || 'Shift',
    })
    setAssignmentError('')
  }

  const handleConfirmClearCell = async () => {
    if (!clearCellPending) return

    const shiftIds = (clearCellPending.shifts ?? []).map((shift) => shift.id).filter(Boolean)
    if (shiftIds.length === 0) {
      setAssignmentError('No assignments found in this shift cell.')
      return
    }

    try {
      await onClearGridCell({
        template: clearCellPending.template,
        shiftDate: clearCellPending.day.key,
        shiftIds,
      })
      setClearCellPending(null)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to clear this shift right now.')
    }
  }

  const handleOpenAutoFillModal = () => {
    if (!selectedWeeklyTemplateId) {
      setAssignmentError('Select a weekly template first.')
      return
    }

    setAssignmentError('')
    setAutoFillReplaceExisting(false)
    setLoadWeekOptions({
      employees: true,
      positions: true,
      areas: true,
      times: true,
      notes: true,
    })
    setIsAutoFillModalOpen(true)
  }

  const handleConfirmAutoFillWeek = async () => {
    if (!selectedWeeklyTemplateId) {
      setAssignmentError('Select a weekly template first.')
      return
    }

    try {
      await onAutoFillWeekFromTemplate({
        templateId: selectedWeeklyTemplateId,
        weekDays,
        options: loadWeekOptions,
        replaceExisting: autoFillReplaceExisting,
      })
      setIsAutoFillModalOpen(false)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to auto fill week right now.')
    }
  }

  const currentWeekShifts = visibleWeekShifts

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

  const employeePublishedWeekSchedule = useMemo(() => {
    if (!isWeekPublished || !Array.isArray(publishedShifts) || publishedShifts.length === 0) return []

    const grouped = new Map()
    publishedShifts.forEach((shift) => {
      const key = String(shift.employeeId ?? '')
      if (!key) return
      if (!grouped.has(key)) {
        const employeeRecord = employees.find((employee) => String(employee.id) === key) ?? null
        grouped.set(key, {
          employeeId: key,
          employeeName: employeeRecord?.name || shift.employeeName || shift.employees?.full_name || `Employee ${key}`,
          entries: [],
        })
      }

      grouped.get(key).entries.push({
        date: shift.date,
        dayLabel: new Date(`${shift.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' }),
        startTime: shift.startTime,
        endTime: shift.endTime,
        area: shift.area,
        role: shift.role,
        notes: shift.notes,
      })
    })

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        entries: item.entries.sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)),
      }))
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName))
  }, [employees, isWeekPublished, publishedShifts])

  const blendGridRows = useMemo(() => {
    return scheduleGridTemplates.map((template) => {
      const dayCells = weekDays.map((day) => {
        const requiredCount = getRequiredCountForCell(template, day.key)
        const cellKeys = getTemplateCellKeys(template, day.key)
        const seen = new Set()
        const dayShifts = []

        cellKeys.forEach((cellKey) => {
          console.log("Cell key", cellKey)
          ;(assignmentsByCell[cellKey] ?? []).forEach((shift) => {
            if (seen.has(String(shift.id))) return
            seen.add(String(shift.id))
            dayShifts.push({
              ...shift,
              employeeRecord: employees.find((employee) => employee.id === shift.employeeId) ?? null,
            })
          })
        })

        return {
          day,
          shifts: dayShifts,
          assignedCount: dayShifts.length,
          requiredCount,
          staffingState: dayShifts.length > requiredCount
            ? 'overstaffed'
            : dayShifts.length === requiredCount
              ? 'staffed'
              : dayShifts.length === 0
                ? 'understaffed'
                : 'attention',
        }
      })

      return {
        template,
        requiredCount: 1,
        dayCells,
      }
    })
  }, [employees, scheduleGridTemplates, weekDays, capacityLookup, capacityDraftMap, assignmentsByCell])

  const dayHeaderSummariesByKey = useMemo(() => {
    const summaries = {}

    weekDays.forEach((day) => {
      const dayKey = day.key
      const seenShiftIds = new Set()
      let totalAssignedStaff = 0
      let totalScheduledHours = 0

      visibleWeekShifts.forEach((shift) => {
        if (normalizeCellDate(shift.date) !== dayKey) return
        const shiftId = String(shift.id)
        if (seenShiftIds.has(shiftId)) return
        seenShiftIds.add(shiftId)
        totalAssignedStaff += 1
        totalScheduledHours += calculateShiftDurationHours(shift.startTime, shift.endTime)
      })

      let hasOverstaffed = false
      let hasUnderstaffed = false

      blendGridRows.forEach((row) => {
        const cell = row.dayCells.find((entry) => entry.day.key === dayKey)
        if (!cell) return
        if (cell.assignedCount > cell.requiredCount) hasOverstaffed = true
        if (cell.assignedCount < cell.requiredCount) hasUnderstaffed = true
      })

      let status = 'empty'
      let statusLabel = 'Empty'
      let statusIcon = '⚪'

      if (totalAssignedStaff === 0) {
        status = 'empty'
        statusLabel = 'Empty'
        statusIcon = '⚪'
      } else if (hasOverstaffed) {
        status = 'overstaffed'
        statusLabel = 'Overstaffed'
        statusIcon = '🔴'
      } else if (hasUnderstaffed) {
        status = 'understaffed'
        statusLabel = 'Understaffed'
        statusIcon = '🟡'
      } else {
        status = 'covered'
        statusLabel = 'Fully Covered'
        statusIcon = '🟢'
      }

      summaries[dayKey] = {
        totalAssignedStaff,
        totalScheduledHours,
        hoursLabel: formatHoursLabel(totalScheduledHours),
        status,
        statusLabel,
        statusIcon,
      }
    })

    return summaries
  }, [blendGridRows, visibleWeekShifts, weekDays])

  const activeStaffMembers = useMemo(() => (
    employees
      .filter((employee) => !isEmployeeUnavailable(employee))
      .sort((left, right) => (
        `${left.full_name || left.name || ''}`.localeCompare(`${right.full_name || right.name || ''}`)
      ))
  ), [employees])

  const employeeWeeklyHoursMap = useMemo(
    () => buildEmployeeWeeklyHoursMap(visibleWeekShifts),
    [visibleWeekShifts],
  )

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
    () => scheduleGridTemplates.find((template) => template.id === assignmentDraft.templateId) ?? null,
    [assignmentDraft.templateId, scheduleGridTemplates],
  )

  const compatibleEmployeeIdSet = useMemo(() => {
    const areaOptions = areaPositionCatalog[assignmentDraft.area] ?? []
    const areaSet = new Set(areaOptions.map((item) => item.toLowerCase()))
    if (areaSet.size === 0) {
      return new Set(employees.map((employee) => String(employee.id)))
    }

    return new Set(
      employees
        .filter((employee) => getEmployeePositionNames(employee).some((name) => areaSet.has(name.toLowerCase())))
        .map((employee) => String(employee.id)),
    )
  }, [assignmentDraft.area, employees])

  const selectedAssignmentEmployees = useMemo(() => {
    const selectedSet = new Set((assignmentDraft.employeeIds ?? []).map((id) => String(id)))
    return employees.filter((employee) => selectedSet.has(String(employee.id)))
  }, [assignmentDraft.employeeIds, employees])

  const assignmentEmployeeOptions = useMemo(() => {
    const needle = assignmentEmployeeSearch.trim().toLowerCase()
    if (!needle) return employees
    return employees.filter((employee) => `${employee.full_name || employee.name || ''}`.toLowerCase().includes(needle))
  }, [assignmentEmployeeSearch, employees])

  const getEmployeeAdditionalPositions = (employee) => {
    const names = getEmployeePositionNames(employee)
    return names.slice(1)
  }

  const getEmployeeRoleOptions = (employee) => {
    const employeeRoles = getEmployeePositionNames(employee)
    const areaRoles = areaPositionCatalog[assignmentDraft.area] ?? []
    const unique = Array.from(new Set([...employeeRoles, ...areaRoles].filter(Boolean)))
    return [...unique, 'Custom']
  }

  const getDefaultRoleForEmployee = (employee) => {
    const employeeRoles = getEmployeePositionNames(employee)
    const areaRoles = areaPositionCatalog[assignmentDraft.area] ?? []
    const areaSet = new Set(areaRoles.map((item) => item.toLowerCase()))
    const compatibleEmployeeRoles = employeeRoles.filter((role) => areaSet.has(role.toLowerCase()))

    if (compatibleEmployeeRoles.length === 1) return compatibleEmployeeRoles[0]
    if (compatibleEmployeeRoles.length === 0 && employeeRoles.length === 1) return employeeRoles[0]
    if (compatibleEmployeeRoles.length === 0 && employeeRoles.length === 0 && areaRoles.length === 1) return areaRoles[0]
    if (compatibleEmployeeRoles.length === 0 && employeeRoles.length > 0 && areaRoles.length === 0) return employeeRoles[0]
    return ''
  }

  useEffect(() => {
    if (!isAssignmentModalOpen) return

    setAssignmentEmployeeRoleMap((current) => {
      const next = { ...current }
      let changed = false

      selectedAssignmentEmployees.forEach((employee) => {
        const key = String(employee.id)
        const existing = next[key]
        if (existing?.role) return
        const autoRole = getDefaultRoleForEmployee(employee)
        if (autoRole) {
          next[key] = { role: autoRole, customRole: '' }
          changed = true
        } else if (!existing) {
          next[key] = { role: '', customRole: '' }
          changed = true
        }
      })

      Object.keys(next).forEach((employeeId) => {
        if (!(assignmentDraft.employeeIds ?? []).some((id) => String(id) === employeeId)) {
          delete next[employeeId]
          changed = true
        }
      })

      return changed ? next : current
    })
  }, [assignmentDraft.area, assignmentDraft.employeeIds, isAssignmentModalOpen, selectedAssignmentEmployees])

  useEffect(() => {
    if (!isAssignmentModalOpen) return

    if (!assignmentDraft.positionName.trim()) return

    setAssignmentEmployeeRoleMap((current) => {
      const next = { ...current }
      let changed = false
      selectedAssignmentEmployees.forEach((employee) => {
        const key = String(employee.id)
        const currentRole = `${next[key]?.role ?? ''}`.trim()
        const currentCustom = `${next[key]?.customRole ?? ''}`.trim()
        if (!currentRole && !currentCustom) {
          next[key] = { role: assignmentDraft.positionName.trim(), customRole: '' }
          changed = true
        }
      })
      return changed ? next : current
    })
  }, [assignmentDraft.positionName, isAssignmentModalOpen, selectedAssignmentEmployees])

  const assignmentContext = useMemo(() => {
    if (!assignmentDraft.templateId || !assignmentDraft.shiftDate) return null

    const row = blendGridRows.find((item) => item.template.id === assignmentDraft.templateId)
    const cell = row?.dayCells.find((item) => item.day.key === assignmentDraft.shiftDate)
    const selectedDayRecord = weekDays.find((day) => day.key === assignmentDraft.shiftDate)

    const effectiveTemplate = {
      ...(row?.template ?? assignmentTemplate ?? {}),
      id: assignmentDraft.templateId,
      templateId: row?.template?.templateId ?? assignmentTemplate?.templateId ?? assignmentDraft.templateId,
      name: assignmentDraft.templateName || row?.template?.name || assignmentTemplate?.name || '',
      defaultArea: `${assignmentDraft.area ?? ''}`.trim() || row?.template?.defaultArea || assignmentTemplate?.defaultArea || '',
      defaultRole: assignmentDraft.defaultRole || row?.template?.defaultRole || assignmentTemplate?.defaultRole || '',
      startTime: assignmentDraft.startTime || row?.template?.startTime || assignmentTemplate?.startTime || '',
      endTime: assignmentDraft.endTime || row?.template?.endTime || assignmentTemplate?.endTime || '',
    }

    return {
      template: effectiveTemplate,
      cell: cell ?? null,
      selectedDayRecord: selectedDayRecord ?? null,
      dayLabel: assignmentDraft.shiftDate
        ? new Date(`${assignmentDraft.shiftDate}T00:00:00`).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })
        : '',
    }
  }, [assignmentDraft.shiftDate, assignmentDraft.templateId, assignmentTemplate, blendGridRows, weekDays])

  const handleOpenAssignmentModal = (template, day) => {
    const selectedTemplatePayload = {
      id: template?.templateId ?? template?.id ?? null,
      template_name: template?.name ?? '',
      area: template?.defaultArea ?? null,
      default_role: template?.defaultRole ?? '',
      start_time: normalizeTimeValue(template?.startTime),
      end_time: normalizeTimeValue(template?.endTime),
    }
    console.log('Selected Template:', selectedTemplatePayload)

    const fromCollection = scheduleGridTemplates.find((item) => item.id === template.id || item.templateId === template.templateId)
    if (fromCollection && `${fromCollection.defaultArea ?? ''}`.trim() && !`${template?.defaultArea ?? ''}`.trim()) {
      console.warn('Template area lost between collection and cell payload', {
        collectionTemplate: fromCollection,
        cellTemplate: template,
      })
    }

    setSelectedDay(day.key)
    setAssignmentError('')
    setAssignmentFieldErrors({})
    setAssignmentMissingFields([])
    setAssignmentAreaApplyMode('once')
    setAssignmentEmployeeSearch('')
    setAssignmentEmployeeRoleMap({})
    const areaInfo = inferAreaFromTemplate(template)
    setAssignmentDraft({
      templateId: template.id,
      templateName: template.name || '',
      shiftDate: day.key,
      employeeIds: [],
      area: areaInfo.area,
      defaultRole: `${template.defaultRole ?? ''}`.trim(),
      startTime: normalizeTimeValue(template.startTime),
      endTime: normalizeTimeValue(template.endTime),
      positionName: '',
      templateAreaMissing: !`${template.defaultArea ?? ''}`.trim(),
      notes: '',
    })
    setIsAssignmentModalOpen(true)
  }

  const handleCloseAssignmentModal = () => {
    setIsAssignmentModalOpen(false)
    setAssignmentError('')
    setAssignmentFieldErrors({})
    setAssignmentMissingFields([])
    setAssignmentAreaApplyMode('once')
    setAssignmentEmployeeSearch('')
    setAssignmentEmployeeRoleMap({})
    setAssignmentDraft({
      templateId: '',
      templateName: '',
      shiftDate: '',
      employeeIds: [],
      area: '',
      defaultRole: '',
      startTime: '',
      endTime: '',
      positionName: '',
      templateAreaMissing: false,
      notes: '',
    })
  }

  const handleSelectCellCapacity = async (template, day, nextRequired) => {
    const currentRequired = getRequiredCountForCell(template, day.key)
    const normalizedNext = Number(nextRequired)
    if (!Number.isFinite(normalizedNext) || normalizedNext < 0) {
      setAssignmentError('Required staffing must be between 0 and 99.')
      return
    }

    if (normalizedNext > 99) {
      setAssignmentError('Required staffing must be between 0 and 99.')
      return
    }

    if (normalizedNext === currentRequired) {
      setCapacityPickerKey('')
      return
    }

    const templateId = resolveTemplateCapacityId(template)
    const normalizedShiftDate = normalizeShiftDateKey(day.key)
    const key = buildCapacityKey(templateId, normalizedShiftDate)
    console.log("Capacity key saving", key)

    setCapacityPickerKey('')
    setCapacityDraftMap((current) => ({
      ...current,
      [key]: normalizedNext,
    }))
    setCapacitySavingKey(key)

    try {
      const saved = await onUpdateCellCapacity({
        shiftTemplateId: templateId,
        shiftDate: normalizedShiftDate,
        requiredCount: normalizedNext,
      })
      setCapacityDraftMap((current) => ({
        ...current,
        [key]: Number(saved.requiredCount),
      }))
    } catch (error) {
      setCapacityDraftMap((current) => ({
        ...current,
        [key]: currentRequired,
      }))
      setAssignmentError(error?.message || 'Unable to update required staffing right now.')
    } finally {
      setCapacitySavingKey('')
    }
  }

  const handleSaveCustomCapacity = async (template, day) => {
    const parsed = Number(capacityCustomValue)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99) {
      setAssignmentError('Required staffing must be between 0 and 99.')
      return
    }

    await handleSelectCellCapacity(template, day, Math.floor(parsed))
    setCapacityCustomValue('')
  }

  const handleSaveAssignmentAreaToTemplate = async () => {
    const template = scheduleGridTemplates.find((item) => item.id === assignmentDraft.templateId)
    if (!template) {
      setAssignmentError('Shift template could not be found.')
      return
    }

    const normalizedArea = `${assignmentDraft.area ?? ''}`.trim()
    if (!normalizedArea) {
      setAssignmentError('Area is required before saving to template.')
      return
    }

    try {
      await onApplyAreaToTemplate(template, normalizedArea)
      setAssignmentAreaApplyMode('template')
      setAssignmentDraft((current) => ({
        ...current,
        templateAreaMissing: false,
        area: normalizedArea,
      }))
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to save area to template right now.')
    }
  }

  const handleCreateAssignment = async (event) => {
    event.preventDefault()

    const template = scheduleGridTemplates.find((item) => item.id === assignmentDraft.templateId)
    if (!template) {
      setAssignmentFieldErrors({ shift_template_id: 'Shift template is missing.' })
      setAssignmentMissingFields(['shift_template_id'])
      setAssignmentError('Cannot save assignment.')
      return
    }

    const payload = {
      shift_template_id: template.templateId ?? assignmentDraft.templateId,
      shift_template_name: assignmentDraft.templateName || template.name || '',
      shift_date: assignmentDraft.shiftDate,
      start_time: normalizeTimeValue(assignmentDraft.startTime || template.startTime),
      end_time: normalizeTimeValue(assignmentDraft.endTime || template.endTime),
      area: `${assignmentDraft.area ?? template.defaultArea ?? ''}`.trim(),
      status: 'Scheduled',
      notes: assignmentDraft.notes,
    }

    console.log('Schedule assignment payload', payload)

    const nextFieldErrors = {}
    const missingFields = []

    if (!Array.isArray(assignmentDraft.employeeIds) || assignmentDraft.employeeIds.length === 0) {
      nextFieldErrors.employee_ids = 'Select at least one employee.'
      missingFields.push('employee_ids')
    }

    if (!payload.shift_template_id) {
      nextFieldErrors.shift_template_id = 'Shift template is missing.'
      missingFields.push('shift_template_id')
    }

    if (!payload.shift_date) {
      nextFieldErrors.shift_date = 'Shift date is missing.'
      missingFields.push('shift_date')
    }

    if (!payload.start_time) {
      nextFieldErrors.start_time = 'Start time is missing.'
      missingFields.push('start_time')
    }

    if (!payload.end_time) {
      nextFieldErrors.end_time = 'End time is missing.'
      missingFields.push('end_time')
    }

    if (!payload.area) {
      nextFieldErrors.area = 'Area is required.'
      missingFields.push('area')
    }

    const selectedEmployees = employees.filter((employee) => (
      (assignmentDraft.employeeIds ?? []).some((id) => String(id) === String(employee.id))
    ))

    const unresolvedPositionEmployees = selectedEmployees.filter((employee) => {
      const employeeKey = String(employee.id)
      const roleState = assignmentEmployeeRoleMap[employeeKey] ?? { role: '', customRole: '' }
      const resolvedRole = roleState.role === 'Custom' ? `${roleState.customRole ?? ''}`.trim() : `${roleState.role ?? ''}`.trim()
      return !resolvedRole
    })

    if (unresolvedPositionEmployees.length > 0) {
      nextFieldErrors.employee_positions = 'Every selected employee must have a position.'
      missingFields.push('employee_positions')
    }

    if (missingFields.length > 0) {
      setAssignmentFieldErrors(nextFieldErrors)
      setAssignmentMissingFields(missingFields)
      setAssignmentError('Cannot save assignment.')
      return
    }

    setAssignmentFieldErrors({})
    setAssignmentMissingFields([])
    setAssignmentError('')

    try {
      if (assignmentDraft.templateAreaMissing && payload.area && assignmentAreaApplyMode === 'template') {
        await onApplyAreaToTemplate(template, payload.area)
      }

      let assignedCount = 0
      const skippedMessages = []

      for (const employee of selectedEmployees) {
        try {
          const employeeKey = String(employee.id)
          const roleState = assignmentEmployeeRoleMap[employeeKey] ?? { role: '', customRole: '' }
          const resolvedRole = roleState.role === 'Custom'
            ? `${roleState.customRole ?? ''}`.trim()
            : `${roleState.role ?? ''}`.trim()

          if (!resolvedRole) {
            const name = employee.full_name || employee.name || `Employee ${employee.id}`
            skippedMessages.push(`Skipped ${name} due to: Position is required.`)
            continue
          }

          await onCreateGridShift({
            employeeId: employee.id,
            shiftDate: assignmentDraft.shiftDate,
            template: {
              ...template,
              name: payload.shift_template_name,
              defaultArea: payload.area,
              defaultRole: assignmentDraft.defaultRole || template.defaultRole || '',
              startTime: payload.start_time,
              endTime: payload.end_time,
            },
            positionName: resolvedRole,
            notes: assignmentDraft.notes,
            requiredCount: assignmentContext?.cell?.requiredCount ?? 1,
            currentAssignedCount: (assignmentContext?.cell?.assignedCount ?? 0) + assignedCount,
          })
          assignedCount += 1
        } catch (error) {
          const name = employee.full_name || employee.name || `Employee ${employee.id}`
          const message = `${error?.message || ''}`.toLowerCase()
          if (message.includes('already scheduled')) {
            skippedMessages.push(`Skipped ${name} because he is already scheduled for this shift.`)
            continue
          }
          if (message.includes('overlap')) {
            skippedMessages.push(`Skipped ${name} because this overlaps with another shift.`)
            continue
          }
          skippedMessages.push(`Skipped ${name} due to: ${error?.message || 'Unknown error.'}`)
        }
      }

      const skippedCount = skippedMessages.length
      const summary = `${assignedCount} employees assigned. ${skippedCount} skipped.`

      if (skippedCount > 0 || assignedCount === 0) {
        setAssignmentError(`${summary} ${skippedMessages.join(' ')}`.trim())
        return
      }

      handleCloseAssignmentModal()
    } catch (error) {
      setAssignmentError(error?.message || 'Unknown error while saving assignment.')
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

    const matchedTemplate = scheduleGridTemplates.find((template) => (
      resolveShiftTemplateId(template) === resolveShiftTemplateId(editingAssignmentShift)
    ))

    if (matchedTemplate && editingAssignmentShift.shiftTemplateId) {
      const usesCustomTime = isAssignmentUsingCustomTime(editingAssignmentShift, matchedTemplate)
      setAssignmentTimeEdit({
        shift: editingAssignmentShift,
        template: matchedTemplate,
        timeMode: usesCustomTime ? 'custom' : 'template',
        startTime: normalizeTimeValue(editingAssignmentShift.startTime) || normalizeTimeValue(matchedTemplate.startTime),
        endTime: normalizeTimeValue(editingAssignmentShift.endTime) || normalizeTimeValue(matchedTemplate.endTime),
      })
      setAssignmentError('')
      handleCloseAssignmentActions()
      return
    }

    onOpenEditShift(editingAssignmentShift)
    handleCloseAssignmentActions()
  }

  const handleCloseAssignmentTimeEdit = () => {
    setAssignmentTimeEdit(null)
    setAssignmentError('')
  }

  const handleAssignmentTimeModeChange = (timeMode) => {
    if (!assignmentTimeEdit) return

    if (timeMode === 'template') {
      setAssignmentTimeEdit((current) => ({
        ...current,
        timeMode: 'template',
        startTime: normalizeTimeValue(current.template.startTime),
        endTime: normalizeTimeValue(current.template.endTime),
      }))
      return
    }

    setAssignmentTimeEdit((current) => ({
      ...current,
      timeMode: 'custom',
    }))
  }

  const handleSaveAssignmentTimeEdit = async (event) => {
    event.preventDefault()
    if (!assignmentTimeEdit?.shift?.id) return

    const { shift, template, timeMode } = assignmentTimeEdit
    const startTime = timeMode === 'template'
      ? normalizeTimeValue(template.startTime)
      : normalizeTimeValue(assignmentTimeEdit.startTime)
    const endTime = timeMode === 'template'
      ? normalizeTimeValue(template.endTime)
      : normalizeTimeValue(assignmentTimeEdit.endTime)

    if (!startTime || !endTime || startTime === endTime) {
      setAssignmentError('Please add a valid start and end time.')
      return
    }

    try {
      await onUpdateAssignmentTime(shift.id, { startTime, endTime })
      setAssignmentTimeEdit(null)
      setAssignmentError('')
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to update assignment time right now.')
    }
  }

  const getShiftTemplateForAssignment = (shift) => (
    scheduleGridTemplates.find((template) => resolveShiftTemplateId(template) === resolveShiftTemplateId(shift)) ?? null
  )

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

  const handleShiftDragStart = (event, shift) => {
    if (isDragDropDisabled) {
      event.preventDefault()
      return
    }

    const mode = event.altKey ? 'copy' : 'prompt'
    const payload = { type: 'shift', shiftId: shift.id, mode }
    dragSessionRef.current = payload
    setDragPayload(payload)
    event.dataTransfer.setData('application/json', JSON.stringify(payload))
    event.dataTransfer.effectAllowed = mode === 'copy' ? 'copy' : 'move'
  }

  const handleEmployeeDragStart = (event, employee) => {
    if (isDragDropDisabled) {
      event.preventDefault()
      return
    }

    const payload = { type: 'employee', employeeId: employee.id }
    dragSessionRef.current = payload
    setDragPayload(payload)
    event.dataTransfer.setData('application/json', JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'copy'
  }

  const handleDragEnd = () => {
    dragSessionRef.current = null
    setDragPayload(null)
    setDropTargetKey('')
  }

  const handleCellDragOver = (event, cellDropKey, { canAcceptDrop }) => {
    if (isDragDropDisabled) return
    if (!event.dataTransfer.types.includes('application/json')) return

    const session = dragSessionRef.current
    if (!session) return

    if (!canAcceptDrop) {
      setDropTargetKey('')
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = session.type === 'employee' || session.mode === 'copy' ? 'copy' : 'move'
    setDropTargetKey(cellDropKey)
  }

  const handleCloseShiftDropPrompt = () => {
    setPendingShiftDrop(null)
    setAssignmentError('')
  }

  const isSameShiftCell = (shift, template, dayKey) => {
    if (!shift) return false
    return resolveShiftTemplateId(shift) === resolveShiftTemplateId(template)
      && normalizeCellDate(`${shift.date}`) === normalizeCellDate(dayKey)
  }

  const handleConfirmShiftDropMove = async () => {
    if (!pendingShiftDrop) return

    const { shiftId, template, day, cell } = pendingShiftDrop

    try {
      setAssignmentError('')
      await onMoveGridShift(shiftId, {
        template,
        shiftDate: day.key,
        requiredCount: cell.requiredCount ?? 1,
        currentAssignedCount: cell.assignedCount ?? 0,
      })
      handleCloseShiftDropPrompt()
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to move this shift right now.')
    }
  }

  const handleConfirmShiftDropCopy = async () => {
    if (!pendingShiftDrop) return

    const { shiftId, template, day, cell } = pendingShiftDrop
    const sourceShift = shifts.find((item) => String(item.id) === String(shiftId))

    if (sourceShift && resolveShiftTemplateId(sourceShift) !== resolveShiftTemplateId(template)) {
      setAssignmentError('Copy within the same shift template row only.')
      return
    }

    if (isEmployeeAssignedInCell(cell, sourceShift?.employeeId)) {
      setAssignmentError('This employee is already assigned here.')
      return
    }

    try {
      setAssignmentError('')
      await onCopyGridShift(shiftId, {
        template,
        shiftDate: day.key,
        requiredCount: cell.requiredCount ?? 1,
        currentAssignedCount: cell.assignedCount ?? 0,
        cellShifts: cell.shifts ?? [],
      })
      handleCloseShiftDropPrompt()
    } catch (error) {
      setAssignmentError(error?.message || 'Unable to copy this shift right now.')
    }
  }

  const handleCellDrop = async (event, template, day, cell) => {
    event.preventDefault()
    event.stopPropagation()
    setDropTargetKey('')

    if (isDragDropDisabled) return

    let payload = dragSessionRef.current ?? dragPayload
    try {
      const raw = event.dataTransfer.getData('application/json')
      if (raw) {
        payload = JSON.parse(raw)
      }
    } catch {
      // Fall back to in-memory drag payload.
    }

    dragSessionRef.current = null
    setDragPayload(null)

    if (!payload?.type) return

    if (payload.type === 'shift') {
      if (!payload.shiftId) return

      const sourceShift = shifts.find((item) => String(item.id) === String(payload.shiftId))
      const dropMode = payload.mode === 'copy' ? 'copy' : 'prompt'

      if (dropMode === 'prompt' && isSameShiftCell(sourceShift, template, day.key)) {
        return
      }

      if (dropMode === 'copy') {
        if (sourceShift && resolveShiftTemplateId(sourceShift) !== resolveShiftTemplateId(template)) {
          setAssignmentError('Copy within the same shift template row only.')
          return
        }

        if (isEmployeeAssignedInCell(cell, sourceShift?.employeeId)) {
          setAssignmentError('This employee is already assigned here.')
          return
        }

        try {
          setAssignmentError('')
          await onCopyGridShift(payload.shiftId, {
            template,
            shiftDate: day.key,
            requiredCount: cell.requiredCount ?? 1,
            currentAssignedCount: cell.assignedCount ?? 0,
            cellShifts: cell.shifts ?? [],
          })
        } catch (error) {
          setAssignmentError(error?.message || 'Unable to copy this shift right now.')
        }
        return
      }

      setAssignmentError('')
      setPendingShiftDrop({
        shiftId: payload.shiftId,
        template,
        day,
        cell,
      })
      return
    }

    if (payload.type === 'employee') {
      if (!payload.employeeId) return

      if (isEmployeeAssignedInCell(cell, payload.employeeId)) {
        setAssignmentError('This employee is already assigned here.')
        return
      }

      const employee = employees.find((item) => String(item.id) === String(payload.employeeId))
      if (!employee) {
        setAssignmentError('Employee could not be found.')
        return
      }

      if (isEmployeeUnavailable(employee)) {
        setAssignmentError('This employee is not available for assignment.')
        return
      }

      const areaInfo = inferAreaFromTemplate(template)
      const area = areaInfo.area
      if (!area) {
        setAssignmentError('This shift template needs an area before drag assignment.')
        return
      }

      const positionName = resolvePositionForDrop(
        employee,
        { area, defaultRole: template?.defaultRole ?? '' },
        areaPositionCatalog,
      )

      if (!positionName) {
        setAssignmentError('Could not determine a position for this employee. Use + to assign manually.')
        return
      }

      try {
        setAssignmentError('')
        await onCreateGridShift({
          employeeId: employee.id,
          shiftDate: day.key,
          template: {
            ...template,
            defaultArea: area,
            defaultRole: template?.defaultRole || positionName,
            startTime: template.startTime,
            endTime: template.endTime,
          },
          positionName,
          notes: '',
          requiredCount: cell.requiredCount ?? 1,
          currentAssignedCount: cell.assignedCount ?? 0,
        })
      } catch (error) {
        setAssignmentError(error?.message || 'Unable to assign this employee right now.')
      }
    }
  }

  return (
    <section className="staff-page" onClick={() => { setCapacityPickerKey(''); setDayActionMenuKey(null); setCellActionMenuKey('') }}>
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

      <div className="schedule-week-nav">
        <div className="schedule-week-nav-main">
          <button
            type="button"
            className="ghost-btn schedule-week-nav-btn"
            onClick={() => onWeekStartDateChange(addWeeks(weekStartDate, -1))}
            disabled={isLoading || isSaving || isPublishing}
            aria-label="Previous week"
          >
            ‹
          </button>
          <div className="schedule-week-nav-label">
            <strong>{weekRangeLabel(weekDays)}</strong>
            {!isCurrentWeek(weekStartDate) ? <span>Viewing another week</span> : <span>This week</span>}
          </div>
          <button
            type="button"
            className="ghost-btn schedule-week-nav-btn"
            onClick={() => onWeekStartDateChange(addWeeks(weekStartDate, 1))}
            disabled={isLoading || isSaving || isPublishing}
            aria-label="Next week"
          >
            ›
          </button>
        </div>
        <div className="schedule-week-nav-actions">
          <button
            type="button"
            className="ghost-btn"
            onClick={handleOpenCopyWeekModal}
            disabled={isLoading || isSaving || isPublishing || visibleWeekShifts.length === 0}
          >
            Copy Week
          </button>
          <button
            type="button"
            className="ghost-btn schedule-week-nav-today"
            onClick={() => onWeekStartDateChange(getCurrentWeekStartDate())}
            disabled={isLoading || isSaving || isPublishing || isCurrentWeek(weekStartDate)}
          >
            Today
          </button>
          <label className="schedule-week-nav-picker">
            <span className="sr-only">Jump to week</span>
            <input
              type="date"
              value={weekPickerValue}
              onChange={(event) => {
                const nextValue = event.target.value
                setWeekPickerValue(nextValue)
                if (!nextValue) return
                onWeekStartDateChange(getWeekStartDate(parseLocalDate(nextValue)))
              }}
              disabled={isLoading || isSaving || isPublishing}
            />
          </label>
        </div>
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
            <p className="eyebrow">Saved Weekly Schedules</p>
            <h3>Reusable week presets</h3>
          </div>
        </div>

        <div className="weekly-template-toolbar">
          <label className="form-field weekly-template-selector">
            <span>Load Saved Week</span>
            <select value={selectedWeeklyTemplateId} onChange={(event) => setSelectedWeeklyTemplateId(event.target.value)}>
              <option value="">Choose a saved weekly schedule</option>
              {weeklyTemplates.map((template) => (
                <option key={`weekly-template-${template.id}`} value={String(template.id)}>{template.name}</option>
              ))}
            </select>
          </label>

          <div className="action-group">
            <button type="button" className="ghost-btn" onClick={handleOpenSaveWeekTemplateModal} disabled={isSaving}>Save Current Week</button>
            <button type="button" className="ghost-btn" onClick={handleOpenLoadWeekTemplateModal} disabled={isSaving || !selectedWeeklyTemplateId}>Load Saved Week</button>
            <button type="button" className="ghost-btn" onClick={handleOpenAutoFillModal} disabled={isSaving || !selectedWeeklyTemplateId}>Auto Fill Empty Week</button>
            <button type="button" className="ghost-btn" onClick={handleStartRenameWeeklyTemplate} disabled={isSaving || !selectedWeeklyTemplateId}>Rename Saved Week</button>
            <button type="button" className="ghost-btn" onClick={handleDeleteSelectedWeeklyTemplate} disabled={isSaving || !selectedWeeklyTemplateId}>Delete Saved Week</button>
          </div>
        </div>

        <div className="weekly-history-panel">
          <label className="form-field weekly-template-selector">
            <span>Week Picker</span>
            <input
              type="date"
              value={browseWeekAnchorDate}
              onChange={(event) => setBrowseWeekAnchorDate(event.target.value)}
            />
          </label>

          <div className="weekly-history-meta">
            <p><strong>Selected Week:</strong> {weekRangeLabel(browseWeekDays)}</p>
            <p><strong>Shifts Found:</strong> {isBrowseWeekLoading ? 'Loading…' : browsedWeekShifts.length}</p>
            {browsedWeekPreview.length > 0 ? (
              <div className="weekly-history-preview">
                {browsedWeekPreview.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            ) : null}
          </div>

          <div className="action-group">
            <button
              type="button"
              className="ghost-btn"
              onClick={handleOpenCopyThisWeekModal}
              disabled={isSaving || isBrowseWeekCurrentWeek || isBrowseWeekLoading || browsedWeekShifts.length === 0}
            >
              Copy This Week
            </button>
          </div>
        </div>
      </div>

      <div className="panel staff-panel blend-grid-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Weekly assignment grid</p>
            <h3>
              Weekly schedule
              <span className={`schedule-publication-badge ${
                hasUnpublishedChanges ? 'pending' : isWeekPublished ? 'published' : 'draft'
              }`}>
                {hasUnpublishedChanges ? 'Unpublished changes' : isWeekPublished ? 'Published' : 'Draft'}
              </span>
            </h3>
            <p className="schedule-publication-meta">
              {publicationStatusLabel}
              {isWeekPublished && publicationTimestampLabel ? ` · ${publicationTimestampLabel}` : ''}
            </p>
          </div>
          <div className="action-group">
            {hasUnpublishedChanges || !isWeekPublished ? (
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setPublishError('')
                  setIsPublishConfirmOpen(true)
                }}
                disabled={isSaving || isPublishing}
              >
                {hasUnpublishedChanges ? 'Publish changes' : 'Publish'}
              </button>
            ) : null}
            {isWeekPublished ? (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setPublishError('')
                  setIsUnpublishConfirmOpen(true)
                }}
                disabled={isSaving || isPublishing}
              >
                Unpublish
              </button>
            ) : null}
            <button
              type="button"
              className="ghost-btn danger-text"
              onClick={handleOpenClearWeekModal}
              disabled={isSaving || isPublishing}
            >
              Clear Week
            </button>
            <button type="button" className="primary-btn" onClick={() => handleOpenAddShiftForDate(selectedDate)} disabled={isSaving}>
              {isSaving ? 'Saving…' : '+ Add Shift'}
            </button>
          </div>
        </div>

        {hasUnpublishedChanges ? (
          <div className="staff-status-banner schedule-draft-changes-banner">
            Draft has unpublished changes.
          </div>
        ) : null}

        {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

        {scheduleGridTemplates.length === 0 ? (
          <div className="schedule-empty-state">
            <h4>No shift templates available.</h4>
            <p>Create templates first, then assign employees directly in this grid.</p>
          </div>
        ) : (
          <>
          <div className="schedule-staff-strip">
            <div className="schedule-staff-strip-header">
              <p className="eyebrow">Staff</p>
              <span className="schedule-staff-strip-hint">Drag staff onto any shift cell</span>
            </div>
            <div className="schedule-staff-strip-scroll">
              {activeStaffMembers.length === 0 ? (
                <p className="schedule-staff-strip-empty">No active employees available.</p>
              ) : (
                activeStaffMembers.map((employee) => {
                  const employeeName = employee.full_name || employee.name || 'Staff'
                  const firstName = getEmployeeFirstName(employee)
                  const positionLabel = getEmployeePrimaryPosition(employee)
                  const scheduledHours = employeeWeeklyHoursMap.get(String(employee.id)) ?? 0
                  const weeklyTarget = parseWeeklyHoursTarget(employee.weeklyHours ?? employee.weekly_hours)
                  const hoursTracker = getEmployeeHoursTrackerState(scheduledHours, weeklyTarget)

                  return (
                    <button
                      key={`staff-chip-${employee.id}`}
                      type="button"
                      className={`schedule-staff-chip ${dragPayload?.type === 'employee' && String(dragPayload.employeeId) === String(employee.id) ? 'dragging' : ''}`}
                      draggable={!isDragDropDisabled}
                      onDragStart={(event) => handleEmployeeDragStart(event, employee)}
                      onDragEnd={handleDragEnd}
                      aria-label={`Assign ${employeeName}, ${hoursTracker.primaryLabel}, ${hoursTracker.secondaryLabel}`}
                    >
                      <span className="schedule-staff-chip-main">
                        <span className="schedule-staff-chip-avatar">{getInitials(employeeName)}</span>
                        <span className="schedule-staff-chip-copy">
                          <strong>{firstName} · {positionLabel}</strong>
                        </span>
                      </span>
                      <span className="schedule-staff-hours-track">
                        {hoursTracker.hasTarget ? (
                          <span className="schedule-staff-hours-bar" aria-hidden="true">
                            <span
                              className={`schedule-staff-hours-bar-fill ${hoursTracker.status}`}
                              style={{ width: `${hoursTracker.barWidth}%` }}
                            />
                          </span>
                        ) : null}
                        <span className="schedule-staff-hours-meta">
                          <span className="schedule-staff-hours-primary">{hoursTracker.primaryLabel}</span>
                          <span className={`schedule-staff-hours-secondary ${hoursTracker.status}`}>
                            {hoursTracker.secondaryLabel}
                          </span>
                        </span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="blend-grid-scroll">
            <div className="blend-grid-table" style={{ gridTemplateColumns: `300px repeat(${weekDays.length}, minmax(190px, 1fr))` }}>
              <div className="blend-grid-header blend-grid-header-template">Shift template</div>
              {weekDays.map((day) => {
                const daySummary = dayHeaderSummariesByKey[day.key] ?? {
                  totalAssignedStaff: 0,
                  hoursLabel: '0',
                  status: 'empty',
                  statusLabel: 'Empty',
                  statusIcon: '⚪',
                }
                return (
                <div
                  key={`head-${day.key}`}
                  className={`blend-grid-header blend-grid-header-day ${selectedDay === day.key ? 'active' : ''}`}
                >
                  <button
                    type="button"
                    className="blend-grid-header-day-select"
                    onClick={() => setSelectedDay(day.key)}
                  >
                    <strong>{day.label}</strong>
                    <span className="blend-grid-header-day-date">{day.shortDate}</span>
                    <div className="blend-grid-header-day-metrics" aria-label={`${daySummary.totalAssignedStaff} staff, ${daySummary.hoursLabel} hours`}>
                      <span className="blend-grid-header-day-metric">👥 {daySummary.totalAssignedStaff}</span>
                      <span className="blend-grid-header-day-metric">⏱ {daySummary.hoursLabel}h</span>
                    </div>
                    <span className={`day-header-status ${daySummary.status}`}>
                      <span className="day-header-status-icon" aria-hidden="true">{daySummary.statusIcon}</span>
                      {daySummary.statusLabel}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="blend-grid-header-day-menu-btn"
                    onClick={(event) => {
                      event.stopPropagation()
                      setDayActionMenuKey((current) => (current === day.key ? null : day.key))
                    }}
                    aria-label={`Day actions for ${day.label}`}
                    disabled={isSaving}
                  >
                    ⋯
                  </button>
                  {dayActionMenuKey === day.key ? (
                    <div className="template-card-menu blend-day-header-menu" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className="template-card-menu-item"
                        onClick={() => handleOpenCopyDayModal(day)}
                        disabled={isSaving || (shiftCountByDate[day.key] ?? 0) === 0}
                      >
                        Copy Day
                      </button>
                      <button
                        type="button"
                        className="template-card-menu-item danger"
                        onClick={() => handleOpenClearDayModal(day)}
                        disabled={isSaving || (shiftCountByDate[day.key] ?? 0) === 0}
                      >
                        Clear Day
                      </button>
                    </div>
                  ) : null}
                </div>
                )
              })}

              {blendGridRows.map((row) => (
                <Fragment key={`row-${row.template.id}`}>
                  {(() => {
                    const templatePresentation = getTemplatePresentation(row.template)
                    return (
                  <aside key={`template-${row.template.id}`} className="blend-grid-template-cell">
                    <div className="template-card-actions">
                      <button
                        type="button"
                        className="template-card-delete-btn"
                        onClick={() => handleOpenDeleteShiftTemplateModal(row.template)}
                        aria-label={`Delete ${row.template.name} template`}
                      >
                        ✕
                      </button>
                      <button
                        type="button"
                        className="template-card-menu-btn"
                        onClick={() => setTemplateActionMenuId((current) => (current === row.template.id ? null : row.template.id))}
                        aria-label={`More actions for ${row.template.name}`}
                      >
                        ⋯
                      </button>
                      {templateActionMenuId === row.template.id ? (
                        <div className="template-card-menu" onClick={(event) => event.stopPropagation()}>
                          <button type="button" className="template-card-menu-item" onClick={() => handleStartRenameShiftTemplate(row.template)}>Rename Template</button>
                          <button type="button" className="template-card-menu-item" onClick={() => handleEditShiftTemplateFromCard(row.template)}>Edit Template</button>
                          <button type="button" className="template-card-menu-item" onClick={() => handleDuplicateShiftTemplateFromCard(row.template)}>Duplicate Template</button>
                        </div>
                      ) : null}
                    </div>
                    <strong>
                      {templatePresentation.icon} {templatePresentation.label}
                    </strong>
                    <p className="blend-grid-template-department">{(row.template.defaultArea || row.template.defaultRole || 'General').toUpperCase()}</p>
                    {row.template.notes ? <p className="blend-grid-template-break">{row.template.notes}</p> : null}
                    <span>{formatTimeRange24(row.template.startTime, row.template.endTime)}</span>
                  </aside>
                    )
                  })()}

                  {row.dayCells.map((cell) => {
                    const cellDropKey = buildCellDropKey(row.template, cell.day.key)
                    const draggedShift = dragPayload?.type === 'shift' && dragPayload?.shiftId
                      ? shifts.find((item) => String(item.id) === String(dragPayload.shiftId))
                      : null
                    const isShiftCopyDrag = dragPayload?.type === 'shift' && dragPayload?.mode === 'copy'
                    const isShiftPromptDrag = dragPayload?.type === 'shift' && dragPayload?.mode !== 'copy'
                    const isSameTemplateForCopy = !isShiftCopyDrag
                      || (
                        draggedShift
                        && resolveShiftTemplateId(draggedShift) === resolveShiftTemplateId(row.template)
                      )
                    const canAcceptEmployeeDrop = dragPayload?.type === 'employee'
                    const canAcceptShiftCopyDrop = isShiftCopyDrag && isSameTemplateForCopy
                    const canAcceptShiftMoveDrop = isShiftPromptDrag
                    const canAcceptDrop = canAcceptEmployeeDrop || canAcceptShiftCopyDrop || canAcceptShiftMoveDrop
                    const isDropTarget = dropTargetKey === cellDropKey && canAcceptDrop

                    return (
                    <div
                      key={`cell-${row.template.id}-${cell.day.key}`}
                      className={`blend-grid-assignment-cell ${selectedDay === cell.day.key ? 'active' : ''} ${cell.assignedCount === 0 ? 'empty' : ''} ${cell.staffingState} ${isDropTarget ? 'drop-target' : ''}`}
                      onClick={() => {
                        setSelectedDay(cell.day.key)
                        if (cell.assignedCount === 0) {
                          handleOpenAssignmentModal(row.template, cell.day)
                        }
                      }}
                      onDragOver={(event) => handleCellDragOver(event, cellDropKey, { canAcceptDrop })}
                      onDrop={(event) => handleCellDrop(event, row.template, cell.day, cell)}
                    >
                      <div className="blend-grid-cell-top">
                        {cell.staffingState === 'overstaffed' ? (
                          <span className="cell-over-badge">Over</span>
                        ) : null}
                        <div className="cell-capacity-controls" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            className="capacity-value-btn"
                            onClick={() => {
                              setAssignmentError('')
                              const key = `${row.template.templateId ?? row.template.id}|${cell.day.key}`
                              setCapacityPickerKey((current) => (current === key ? '' : key))
                              setCapacityCustomValue(`${cell.requiredCount}`)
                            }}
                            disabled={capacitySavingKey === `${row.template.templateId ?? row.template.id}|${cell.day.key}`}
                          >
                            {cell.assignedCount}/{cell.requiredCount}
                          </button>

                          {capacityPickerKey === `${row.template.templateId ?? row.template.id}|${cell.day.key}` ? (
                            <div className="capacity-picker-popover">
                              <p>Required Staff</p>
                              <div className="capacity-picker-grid">
                                {Array.from({ length: 11 }, (_, number) => number).map((value) => (
                                  <button
                                    key={`capacity-option-${row.template.id}-${cell.day.key}-${value}`}
                                    type="button"
                                    className={`capacity-option-btn ${cell.requiredCount === value ? 'active' : ''}`}
                                    onClick={() => handleSelectCellCapacity(row.template, cell.day, value)}
                                  >
                                    {value}
                                  </button>
                                ))}
                              </div>
                              <div className="capacity-custom-editor">
                                <span>Custom required staff</span>
                                <div className="capacity-custom-row">
                                  <input
                                    type="number"
                                    min="0"
                                    max="99"
                                    value={capacityCustomValue}
                                    onChange={(event) => setCapacityCustomValue(event.target.value)}
                                    onClick={(event) => event.stopPropagation()}
                                  />
                                  <button
                                    type="button"
                                    className="capacity-custom-save"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      handleSaveCustomCapacity(row.template, cell.day)
                                    }}
                                    disabled={capacitySavingKey === `${row.template.templateId ?? row.template.id}|${cell.day.key}`}
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div className="blend-grid-cell-actions" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            className="blend-grid-cell-menu-btn"
                            onClick={() => {
                              const menuKey = buildCellActionMenuKey(row.template, cell.day.key)
                              setCellActionMenuKey((current) => (current === menuKey ? '' : menuKey))
                            }}
                            aria-label={`Shift actions for ${row.template.name} on ${cell.day.label}`}
                            disabled={isSaving}
                          >
                            ⋯
                          </button>
                          {cellActionMenuKey === buildCellActionMenuKey(row.template, cell.day.key) ? (
                            <div className="template-card-menu blend-grid-cell-menu">
                              <button
                                type="button"
                                className="template-card-menu-item danger"
                                onClick={() => handleOpenClearCellModal(row.template, cell)}
                                disabled={isSaving || cell.assignedCount === 0}
                              >
                                Clear shift
                              </button>
                            </div>
                          ) : null}
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
                      </div>

                      <div className="blend-grid-pill-list">
                        {cell.shifts.map((shift) => {
                          const employeeName = shift.employees?.full_name || shift.employeeName || shift.employeeRecord?.name || 'Unassigned'
                          const shiftPosition = (shift.role || getEmployeePositionNames(shift.employeeRecord).join(' • ') || 'Unassigned position').replace(/,\s*/g, ' • ')
                          const shiftTemplate = getShiftTemplateForAssignment(shift)
                          const usesCustomTime = shiftTemplate ? isAssignmentUsingCustomTime(shift, shiftTemplate) : false
                          const overtimeHours = shiftTemplate ? getAssignmentOvertimeHours(shift, shiftTemplate) : 0
                          const pillStartTime = normalizeTimeValue(shift.startTime) || normalizeTimeValue(shiftTemplate?.startTime)
                          const pillEndTime = normalizeTimeValue(shift.endTime) || normalizeTimeValue(shiftTemplate?.endTime)

                          return (
                            <button
                              key={`shift-pill-${shift.id}`}
                              type="button"
                              className={`blend-grid-pill ${usesCustomTime ? 'has-custom-time' : ''} ${dragPayload?.shiftId === shift.id ? 'dragging' : ''}`}
                              draggable={!isDragDropDisabled}
                              onDragStart={(event) => handleShiftDragStart(event, shift)}
                              onDragEnd={handleDragEnd}
                              onClick={(event) => {
                                event.stopPropagation()
                                handleOpenAssignmentActions(shift)
                              }}
                            >
                              <span className="blend-grid-pill-name">{employeeName} • {shiftPosition}</span>
                              {usesCustomTime ? (
                                <span className="blend-grid-pill-time">
                                  <span>{formatTimeRange24(pillStartTime, pillEndTime, '–')}</span>
                                  {overtimeHours > 0 ? <span className="blend-grid-pill-overtime">+{formatHoursLabel(overtimeHours)}h</span> : null}
                                </span>
                              ) : null}
                            </button>
                          )
                        })}
                      </div>

                      <div className="blend-grid-cell-bottom">
                        <span>{formatTimeRange24(row.template.startTime, row.template.endTime, ' - ')}</span>
                        {cell.assignedCount > cell.requiredCount ? <small className="capacity-warning">This shift is over capacity.</small> : null}
                      </div>
                    </div>
                    )
                  })}
                </Fragment>
              ))}
            </div>
          </div>
          </>
        )}
      </div>

      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading schedule…</div> : null}

      {isWeekPublished ? (
        <div className="panel staff-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Employee view</p>
              <h3>What employees see</h3>
            </div>
          </div>

          <div className="published-week-grid">
            {employeePublishedWeekSchedule.length === 0 ? (
              <p className="staff-subtitle">No published assignments for this week yet.</p>
            ) : (
              employeePublishedWeekSchedule.map((employeeSchedule) => (
                <article key={`published-employee-${employeeSchedule.employeeId}`} className="published-week-card">
                  <h4>{employeeSchedule.employeeName}</h4>
                  {employeeSchedule.entries.map((entry) => (
                    <div key={`published-entry-${employeeSchedule.employeeId}-${entry.date}-${entry.startTime}-${entry.endTime}`} className="published-week-entry">
                      <strong>{entry.dayLabel}</strong>
                      <span>{formatTimeRange24(entry.startTime, entry.endTime)}</span>
                      <span>{entry.area || '—'}</span>
                      <span>{entry.role || '—'}</span>
                      {entry.notes ? <small>{entry.notes}</small> : null}
                    </div>
                  ))}
                </article>
              ))
            )}
          </div>
        </div>
      ) : null}

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
                          <span>{formatTimeRange24(shift.startTime, shift.endTime, ' – ')}</span>
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

      {isDeleteShiftTemplateModalOpen ? (
        <div className="employee-modal-backdrop" onClick={() => setIsDeleteShiftTemplateModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Template delete</p>
                <h3>Delete shift template?</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsDeleteShiftTemplateModalOpen(false)}>✕</button>
            </div>

            <p className="template-delete-copy">Are you sure you want to delete this shift template? Existing scheduled shifts will not be deleted.</p>

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsDeleteShiftTemplateModalOpen(false)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmDeleteShiftTemplate} disabled={isSaving}>Delete Template</button>
            </div>
          </div>
        </div>
      ) : null}

      {shiftTemplatePendingRename ? (
        <div className="employee-modal-backdrop" onClick={() => setShiftTemplatePendingRename(null)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Rename template</p>
                <h3>Update shift template name</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setShiftTemplatePendingRename(null)}>✕</button>
            </div>

            <form className="employee-form" onSubmit={handleSubmitRenameShiftTemplate}>
              <label className="form-field">
                <span>Template Name</span>
                <input
                  value={shiftTemplateRenameName}
                  onChange={(event) => setShiftTemplateRenameName(event.target.value)}
                  required
                />
              </label>

              {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={() => setShiftTemplatePendingRename(null)}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isSaving}>Rename Template</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isCopyThisWeekModalOpen ? (
        <div className="employee-modal-backdrop" onClick={() => setIsCopyThisWeekModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Copy selected week</p>
                <h3>This will replace the current week's schedule.</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsCopyThisWeekModalOpen(false)}>✕</button>
            </div>

            <p className="template-delete-copy">
              Copy {weekRangeLabel(browseWeekDays)} into {weekRangeLabel(weekDays)}? Existing shifts in the current week will be replaced only after confirmation.
            </p>

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsCopyThisWeekModalOpen(false)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmCopyThisWeek} disabled={isSaving}>Copy This Week</button>
            </div>
          </div>
        </div>
      ) : null}

      {isCopyDayModalOpen && copyDaySourceDay ? (
        <div className="employee-modal-backdrop" onClick={() => setIsCopyDayModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Copy day</p>
                <h3>Copy {copyDaySourceDay.label} assignments</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsCopyDayModalOpen(false)}>✕</button>
            </div>

            <label className="form-field">
              <span>Copy to</span>
              <select
                value={copyDayTargetKey}
                onChange={(event) => setCopyDayTargetKey(event.target.value)}
              >
                <option value="">Select target day</option>
                {weekDays
                  .filter((day) => day.key !== copyDaySourceDay.key)
                  .map((day) => (
                    <option key={`copy-day-target-${day.key}`} value={day.key}>
                      {day.label} ({day.shortDate})
                    </option>
                  ))}
              </select>
            </label>

            {copyDayTargetShiftCount > 0 ? (
              <p className="template-delete-copy">
                {copyDayTargetShiftCount} assignment{copyDayTargetShiftCount === 1 ? '' : 's'} already exist on the target day. Copying will replace them.
              </p>
            ) : (
              <p className="template-delete-copy">
                All assignments from {copyDaySourceDay.label} will be copied to the selected day.
              </p>
            )}

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsCopyDayModalOpen(false)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmCopyDay} disabled={isSaving || !copyDayTargetKey}>
                {copyDayTargetShiftCount > 0 ? 'Replace & Copy' : 'Copy Day'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isClearDayModalOpen && clearDayTarget ? (
        <div className="employee-modal-backdrop" onClick={() => setIsClearDayModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Clear day</p>
                <h3>Remove all {clearDayTarget.label} assignments?</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsClearDayModalOpen(false)}>✕</button>
            </div>

            <p className="template-delete-copy">
              This will remove {shiftCountByDate[clearDayTarget.key] ?? 0} draft assignment{(shiftCountByDate[clearDayTarget.key] ?? 0) === 1 ? '' : 's'} from {clearDayTarget.label}. Published schedule is not affected.
            </p>

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsClearDayModalOpen(false)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmClearDay} disabled={isSaving}>Clear Day</button>
            </div>
          </div>
        </div>
      ) : null}

      {isCopyWeekModalOpen ? (
        <div className="employee-modal-backdrop" onClick={() => setIsCopyWeekModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Copy week</p>
                <h3>Copy {weekRangeLabel(weekDays)} to another week</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsCopyWeekModalOpen(false)}>✕</button>
            </div>

            <label className="form-field">
              <span>Target week</span>
              <input
                type="date"
                value={copyWeekTargetDate}
                onChange={(event) => setCopyWeekTargetDate(event.target.value)}
              />
            </label>

            {copyWeekTargetDate ? (
              <p className="template-delete-copy">
                {isCopyWeekTargetCurrentWeek
                  ? 'Select a different week than the one you are viewing.'
                  : isCopyWeekTargetLoading
                    ? 'Checking target week…'
                    : copyWeekTargetShiftCount > 0
                      ? `${copyWeekTargetShiftCount} assignment${copyWeekTargetShiftCount === 1 ? '' : 's'} already exist in the target week. Copying will replace them. Draft only — nothing will be published.`
                      : 'All assignments will be copied as draft shifts. Nothing will be published automatically.'}
              </p>
            ) : (
              <p className="template-delete-copy">Pick any date in the week you want to copy into.</p>
            )}

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsCopyWeekModalOpen(false)}>Cancel</button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleConfirmCopyWeek}
                disabled={isSaving || !copyWeekTargetDate || isCopyWeekTargetCurrentWeek || isCopyWeekTargetLoading}
              >
                {copyWeekTargetShiftCount > 0 ? 'Replace & Copy Week' : 'Copy Week'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isClearWeekModalOpen ? (
        <div className="employee-modal-backdrop" onClick={() => setIsClearWeekModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Clear week</p>
                <h3>Clear entire week?</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsClearWeekModalOpen(false)}>✕</button>
            </div>

            {visibleWeekShifts.length === 0 ? (
              <p className="template-delete-copy">This week is already empty.</p>
            ) : (
              <p className="template-delete-copy">
                This will remove {visibleWeekShifts.length} draft assignment{visibleWeekShifts.length === 1 ? '' : 's'} from this week.
              </p>
            )}

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsClearWeekModalOpen(false)}>Cancel</button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleConfirmClearWeek}
                disabled={isSaving || visibleWeekShifts.length === 0}
              >
                Clear Week
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {clearCellPending ? (
        <div className="employee-modal-backdrop" onClick={() => setClearCellPending(null)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Clear shift</p>
                <h3>Clear all assignments from this shift?</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setClearCellPending(null)}>✕</button>
            </div>

            <p className="template-delete-copy">
              This will remove {clearCellPending.shifts.length} assignment{clearCellPending.shifts.length === 1 ? '' : 's'} from {clearCellPending.templateName} on {clearCellPending.day.label}. Other cells and days are not affected. Published schedule remains untouched.
            </p>

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setClearCellPending(null)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmClearCell} disabled={isSaving}>Clear Shift</button>
            </div>
          </div>
        </div>
      ) : null}

      {isAutoFillModalOpen ? (
        <div className="employee-modal-backdrop" onClick={() => setIsAutoFillModalOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Auto fill week</p>
                <h3>Fill empty cells from template</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsAutoFillModalOpen(false)}>✕</button>
            </div>

            <p className="template-delete-copy">
              Empty shift cells will be filled from the selected weekly template. Existing assignments are kept unless you choose Replace.
            </p>

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
              <label className="inline-check-row">
                <input type="checkbox" checked={autoFillReplaceExisting} onChange={(event) => setAutoFillReplaceExisting(event.target.checked)} />
                <span>Replace existing assignments</span>
              </label>
            </div>

            {autoFillReplaceExisting ? (
              <p className="template-delete-copy">
                Replace will remove all current-week draft assignments before filling from the template.
              </p>
            ) : null}

            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsAutoFillModalOpen(false)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmAutoFillWeek} disabled={isSaving}>
                {autoFillReplaceExisting ? 'Replace & Fill' : 'Auto Fill'}
              </button>
            </div>
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
              <div className="assignment-context-card">
                <h4>{assignmentContext?.template?.name || 'Unknown shift template'}</h4>
                <p className={assignmentFieldErrors.shift_date ? 'invalid' : ''}>{assignmentContext?.dayLabel || 'No day selected'}</p>
                <p className={(assignmentFieldErrors.start_time || assignmentFieldErrors.end_time) ? 'invalid' : ''}>
                  {formatTimeRange24(assignmentContext?.template?.startTime, assignmentContext?.template?.endTime)}
                </p>
                <p className={assignmentFieldErrors.area ? 'invalid' : ''}>Area: {assignmentContext?.template?.defaultArea || 'Not set'}</p>
                <p>Coverage: {assignmentContext?.cell?.assignedCount ?? 0}/{assignmentContext?.cell?.requiredCount ?? 1}</p>
                {assignmentFieldErrors.shift_template_id ? <small className="field-helper-error">{assignmentFieldErrors.shift_template_id}</small> : null}
                {assignmentFieldErrors.shift_date ? <small className="field-helper-error">{assignmentFieldErrors.shift_date}</small> : null}
                {assignmentFieldErrors.start_time ? <small className="field-helper-error">{assignmentFieldErrors.start_time}</small> : null}
                {assignmentFieldErrors.end_time ? <small className="field-helper-error">{assignmentFieldErrors.end_time}</small> : null}
                {assignmentFieldErrors.area ? <small className="field-helper-error">{assignmentFieldErrors.area}</small> : null}
              </div>

              {assignmentDraft.templateAreaMissing ? (
                <div className="assignment-area-warning">
                  <p>
                    This shift template has no saved Area.
                    {assignmentDraft.area ? ` Using ${assignmentDraft.area} for this assignment.` : ' Select an Area to continue.'}
                  </p>

                  <label className="form-field">
                    <span>Area (required)</span>
                    <select
                      className={assignmentFieldErrors.area ? 'field-invalid' : ''}
                      value={assignmentDraft.area}
                      onChange={(event) => {
                        const nextArea = event.target.value
                        setAssignmentDraft((current) => ({ ...current, area: nextArea }))
                        if (assignmentFieldErrors.area) {
                          setAssignmentFieldErrors((current) => ({ ...current, area: undefined }))
                        }
                      }}
                    >
                      <option value="">Select area</option>
                      {scheduleAreaOptions.filter((option) => option !== 'Other').map((option) => (
                        <option key={`assignment-area-${option}`} value={option}>{option}</option>
                      ))}
                    </select>
                    {assignmentFieldErrors.area ? <small className="field-helper-error">Area is required.</small> : null}
                  </label>

                  <div className="assignment-area-apply">
                    <span>Apply this Area to the template permanently?</span>
                    <div className="action-group">
                      <button
                        type="button"
                        className={`ghost-btn small ${assignmentAreaApplyMode === 'once' ? 'active' : ''}`}
                        onClick={() => setAssignmentAreaApplyMode('once')}
                      >
                        Only this assignment
                      </button>
                      <button
                        type="button"
                        className={`ghost-btn small ${assignmentAreaApplyMode === 'template' ? 'active' : ''}`}
                        onClick={handleSaveAssignmentAreaToTemplate}
                      >
                        Save to template
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <label className="form-field">
                <span>Select employees</span>
                <input
                  type="search"
                  value={assignmentEmployeeSearch}
                  onChange={(event) => setAssignmentEmployeeSearch(event.target.value)}
                  placeholder="Search employees"
                />
                <div className={`assignment-employee-list ${assignmentFieldErrors.employee_ids ? 'field-invalid' : ''}`}>
                  {assignmentEmployeeOptions.map((employee) => {
                    const employeeId = String(employee.id)
                    const checked = (assignmentDraft.employeeIds ?? []).some((id) => String(id) === employeeId)
                    const primaryPosition = getEmployeePrimaryPosition(employee) || 'Not set'
                    const additionalPositions = getEmployeeAdditionalPositions(employee)
                    const isCompatible = compatibleEmployeeIdSet.has(employeeId)
                    return (
                      <label key={`assignment-employee-${employee.id}`} className="inline-check-row assignment-employee-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const nextChecked = event.target.checked
                            setAssignmentDraft((current) => {
                              const currentIds = Array.isArray(current.employeeIds) ? current.employeeIds.map((id) => String(id)) : []
                              const nextIds = nextChecked
                                ? Array.from(new Set([...currentIds, employeeId]))
                                : currentIds.filter((id) => id !== employeeId)

                              return {
                                ...current,
                                employeeIds: nextIds,
                              }
                            })
                            if (assignmentFieldErrors.employee_ids) {
                              setAssignmentFieldErrors((current) => ({
                                ...current,
                                employee_ids: undefined,
                              }))
                            }
                          }}
                        />
                        <div className="assignment-employee-meta">
                          <strong>{employee.full_name || employee.name}</strong>
                          <span>Primary: {primaryPosition}</span>
                          {additionalPositions.length > 0 ? <span>Also: {additionalPositions.join(', ')}</span> : null}
                          <small className={isCompatible ? 'compatible' : 'not-compatible'}>
                            {isCompatible ? 'Compatible with selected area' : 'Outside selected area'}
                          </small>
                        </div>
                      </label>
                    )
                  })}
                </div>
                <small className="field-helper-note">Selected: {selectedAssignmentEmployees.length}</small>
                {assignmentFieldErrors.employee_ids ? <small className="field-helper-error">Select at least one employee.</small> : null}
              </label>

              <label className="form-field">
                <span>Apply same position to all selected (optional)</span>
                <select
                  value={assignmentDraft.positionName}
                  onChange={(event) => {
                    const nextPosition = event.target.value
                    setAssignmentDraft((current) => ({ ...current, positionName: nextPosition }))
                  }}
                >
                  <option value="">No shared position</option>
                  {Array.from(new Set(selectedAssignmentEmployees.flatMap((employee) => getEmployeeRoleOptions(employee).filter((option) => option !== 'Custom')))).map((name) => (
                    <option key={`assignment-global-position-${name}`} value={name}>{name}</option>
                  ))}
                </select>
              </label>

              {selectedAssignmentEmployees.length > 0 ? (
                <div className={`assignment-selected-list ${assignmentFieldErrors.employee_positions ? 'field-invalid' : ''}`}>
                  {selectedAssignmentEmployees.map((employee) => {
                    const employeeId = String(employee.id)
                    const roleState = assignmentEmployeeRoleMap[employeeId] ?? { role: '', customRole: '' }
                    const options = getEmployeeRoleOptions(employee)
                    return (
                      <div className="assignment-selected-item" key={`selected-employee-role-${employee.id}`}>
                        <p>{employee.full_name || employee.name}</p>
                        <label className="form-field">
                          <span>Position for this shift</span>
                          <select
                            value={roleState.role}
                            onChange={(event) => {
                              const nextRole = event.target.value
                              setAssignmentEmployeeRoleMap((current) => ({
                                ...current,
                                [employeeId]: {
                                  role: nextRole,
                                  customRole: nextRole === 'Custom' ? current[employeeId]?.customRole ?? '' : '',
                                },
                              }))
                              if (assignmentFieldErrors.employee_positions) {
                                setAssignmentFieldErrors((current) => ({ ...current, employee_positions: undefined }))
                              }
                            }}
                          >
                            <option value="">Select position</option>
                            {options.map((option) => (
                              <option key={`employee-role-option-${employee.id}-${option}`} value={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                        {roleState.role === 'Custom' ? (
                          <label className="form-field">
                            <span>Custom position</span>
                            <input
                              value={roleState.customRole}
                              onChange={(event) => {
                                const nextCustomRole = event.target.value
                                setAssignmentEmployeeRoleMap((current) => ({
                                  ...current,
                                  [employeeId]: {
                                    role: 'Custom',
                                    customRole: nextCustomRole,
                                  },
                                }))
                              }}
                              placeholder="Type custom position"
                            />
                          </label>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : null}
              {assignmentFieldErrors.employee_positions ? <small className="field-helper-error">Every selected employee must have a position.</small> : null}

              <label className="form-field">
                <span>Notes</span>
                <textarea
                  rows="3"
                  value={assignmentDraft.notes}
                  onChange={(event) => setAssignmentDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Optional notes"
                />
              </label>

              {assignmentError ? (
                <div className="staff-status-banner">
                  <strong>{assignmentError}</strong>
                  {assignmentMissingFields.length > 0 ? (
                    <div className="assignment-missing-list">
                      <p>Missing:</p>
                      <ul>
                        {assignmentMissingFields.map((field) => (
                          <li key={field}>{field}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={handleCloseAssignmentModal}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {pendingShiftDrop ? (
        <div className="employee-modal-backdrop" onClick={handleCloseShiftDropPrompt}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Shift placement</p>
                <h3>Move or copy this shift?</h3>
              </div>
              <button type="button" className="icon-btn" onClick={handleCloseShiftDropPrompt}>✕</button>
            </div>

            <p className="staff-subtitle">Choose whether to move the original assignment or keep it and create a copy in the target cell.</p>
            {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={handleCloseShiftDropPrompt}>Cancel</button>
              <button type="button" className="ghost-btn" onClick={handleConfirmShiftDropCopy} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Copy'}
              </button>
              <button type="button" className="primary-btn" onClick={handleConfirmShiftDropMove} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Move'}
              </button>
            </div>
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

      {assignmentTimeEdit ? (
        <div className="employee-modal-backdrop" onClick={handleCloseAssignmentTimeEdit}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Edit assignment</p>
                <h3>Assignment time</h3>
              </div>
              <button type="button" className="icon-btn" onClick={handleCloseAssignmentTimeEdit}>✕</button>
            </div>

            <form className="employee-form" onSubmit={handleSaveAssignmentTimeEdit}>
              <div className="assignment-context-card">
                <h4>{assignmentTimeEdit.shift.employees?.full_name || assignmentTimeEdit.shift.employeeName || 'Employee'}</h4>
                <p>{assignmentTimeEdit.template.name}</p>
                <p>Template: {formatTimeRange24(assignmentTimeEdit.template.startTime, assignmentTimeEdit.template.endTime)}</p>
              </div>

              <div className="assignment-time-mode">
                <span>Time source</span>
                <div className="action-group">
                  <button
                    type="button"
                    className={`ghost-btn small ${assignmentTimeEdit.timeMode === 'template' ? 'active' : ''}`}
                    onClick={() => handleAssignmentTimeModeChange('template')}
                  >
                    Use template time
                  </button>
                  <button
                    type="button"
                    className={`ghost-btn small ${assignmentTimeEdit.timeMode === 'custom' ? 'active' : ''}`}
                    onClick={() => handleAssignmentTimeModeChange('custom')}
                  >
                    Custom time
                  </button>
                </div>
              </div>

              <div className="form-grid">
                <label className="form-field">
                  <span>Start Time</span>
                  <input
                    {...TIME_INPUT_PROPS}
                    value={assignmentTimeEdit.startTime}
                    onChange={(event) => setAssignmentTimeEdit((current) => ({
                      ...current,
                      timeMode: 'custom',
                      startTime: normalizeTimeValue(event.target.value),
                    }))}
                    disabled={assignmentTimeEdit.timeMode === 'template' || isSaving}
                  />
                </label>
                <label className="form-field">
                  <span>End Time</span>
                  <input
                    {...TIME_INPUT_PROPS}
                    value={assignmentTimeEdit.endTime}
                    onChange={(event) => setAssignmentTimeEdit((current) => ({
                      ...current,
                      timeMode: 'custom',
                      endTime: normalizeTimeValue(event.target.value),
                    }))}
                    disabled={assignmentTimeEdit.timeMode === 'template' || isSaving}
                  />
                </label>
              </div>

              {assignmentTimeEdit.timeMode === 'custom' ? (
                <p className="template-delete-copy">
                  Custom time applies only to this employee. The shift template time stays unchanged.
                </p>
              ) : (
                <p className="template-delete-copy">
                  Reset to template time ({formatTimeRange24(assignmentTimeEdit.template.startTime, assignmentTimeEdit.template.endTime)}).
                </p>
              )}

              {assignmentError ? <div className="staff-status-banner">{assignmentError}</div> : null}

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={handleCloseAssignmentTimeEdit}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save Time'}</button>
              </div>
            </form>
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
              <div className="drawer-row"><span>Time</span><strong>{formatTimeRange24(selectedShift.startTime, selectedShift.endTime, ' – ')}</strong></div>
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

      {isPublishConfirmOpen ? (
        <div className="employee-modal-backdrop" onClick={() => {
          if (isPublishing) return
          setPublishError('')
          setIsPublishConfirmOpen(false)
        }}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">{hasUnpublishedChanges ? 'Publish changes?' : 'Publish schedule?'}</p>
                <h3>{hasUnpublishedChanges
                  ? 'Employees will see your latest draft.'
                  : 'Employees will see this week\'s schedule. You can keep editing the draft afterward.'}</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => {
                setPublishError('')
                setIsPublishConfirmOpen(false)
              }}>✕</button>
            </div>

            {isPublishing ? <div className="staff-status-banner">Publishing...</div> : null}
            {publishError ? <div className="staff-status-banner">{publishError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => {
                setPublishError('')
                setIsPublishConfirmOpen(false)
              }}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handlePublishConfirm} disabled={isPublishing}>
                {isPublishing ? 'Publishing…' : hasUnpublishedChanges ? 'Publish changes' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isUnpublishConfirmOpen ? (
        <div className="employee-modal-backdrop" onClick={() => setIsUnpublishConfirmOpen(false)}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Unpublish this schedule?</p>
                <h3>Employees will no longer see this week. Your draft stays editable.</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIsUnpublishConfirmOpen(false)}>✕</button>
            </div>

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsUnpublishConfirmOpen(false)}>Cancel</button>
              <button type="button" className="primary-btn" onClick={handleConfirmUnpublishSchedule} disabled={isPublishing}>
                {isPublishing ? 'Unpublishing…' : 'Unpublish'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function ReservationsView({ reservations, onOpenAddReservation, onOpenEditReservation, onDeleteReservation, isLoading, noticeMessage, isSaving }) {
  const today = getCurrentDateKey()
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

function WorkspaceProfileSettingsView({
  workspaceProfile,
  noticeMessage,
  isLoading,
  isSaving,
  onChange,
  onSubmit,
  onLogoFileChange,
  onClearLogo,
}) {
  return (
    <>
      <div className="staff-header-card">
        <div>
          <p className="eyebrow">Workspace Settings</p>
          <h3>Workspace Profile</h3>
          <p className="staff-subtitle">Configure your business identity and manager details for the Operations Dashboard.</p>
        </div>
      </div>

      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading workspace profile…</div> : null}

      <div className="panel staff-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Business identity</p>
            <h3>Profile details</h3>
          </div>
        </div>

        <form
          className="employee-form"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <div className="form-grid">
            <label className="form-field">
              <span>Business Name</span>
              <input
                value={workspaceProfile.businessName}
                onChange={(event) => onChange({ ...workspaceProfile, businessName: event.target.value })}
                placeholder="e.g. Amore Nicosia"
                disabled={isLoading || isSaving}
              />
            </label>
            <label className="form-field">
              <span>Manager Full Name</span>
              <input
                value={workspaceProfile.managerName}
                onChange={(event) => onChange({ ...workspaceProfile, managerName: event.target.value })}
                placeholder="Full name"
                disabled={isLoading || isSaving}
              />
            </label>
            <label className="form-field">
              <span>Manager Role</span>
              <input
                value={workspaceProfile.managerRole}
                onChange={(event) => onChange({ ...workspaceProfile, managerRole: event.target.value })}
                placeholder="e.g. General Manager"
                disabled={isLoading || isSaving}
              />
            </label>
            <label className="form-field">
              <span>Timezone</span>
              <select
                value={workspaceProfile.timezone}
                onChange={(event) => onChange({ ...workspaceProfile, timezone: event.target.value })}
                disabled={isLoading || isSaving}
              >
                <option value="">Browser default</option>
                {WORKSPACE_PROFILE_TIMEZONES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Currency</span>
              <select
                value={workspaceProfile.currency}
                onChange={(event) => onChange({ ...workspaceProfile, currency: event.target.value })}
                disabled={isLoading || isSaving}
              >
                <option value="">Not set</option>
                {WORKSPACE_PROFILE_CURRENCIES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="form-field full-width">
              <span>Logo</span>
              <div className="workspace-logo-field">
                {workspaceProfile.logoUrl ? (
                  <div className="workspace-logo-preview">
                    <img src={workspaceProfile.logoUrl} alt="Workspace logo preview" />
                  </div>
                ) : (
                  <div className="workspace-logo-placeholder">No logo uploaded</div>
                )}
                <div className="workspace-logo-actions">
                  <label className="ghost-btn small workspace-logo-upload-btn">
                    Upload logo
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={onLogoFileChange}
                      disabled={isLoading || isSaving}
                      hidden
                    />
                  </label>
                  {workspaceProfile.logoUrl ? (
                    <button type="button" className="ghost-btn small" onClick={onClearLogo} disabled={isLoading || isSaving}>
                      Remove logo
                    </button>
                  ) : null}
                </div>
                <small className="workspace-logo-hint">PNG, JPG, WEBP, or SVG up to {Math.round(MAX_WORKSPACE_LOGO_BYTES / 1024)} KB.</small>
              </div>
            </label>
          </div>

          <div className="modal-actions">
            <button type="submit" className="primary-btn" disabled={isLoading || isSaving}>
              {isSaving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </>
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
    <>
      <div className="staff-header-card">
        <div>
          <p className="eyebrow">Workspace Settings</p>
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
    </>
  )
}

function WorkspaceSettingsView({
  activeSection,
  onSectionChange,
  workspaceProfileProps,
  positionsProps,
  renderBuildInfo,
}) {
  return (
    <section className="staff-page settings-page">
      <div className="settings-layout">
        <aside className="settings-nav" aria-label="Workspace settings sections">
          <p className="eyebrow">Workspace Settings</p>
          <h3>Configuration</h3>
          <div className="settings-nav-links">
            {workspaceSettingsSections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`settings-nav-link ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => onSectionChange(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>
        </aside>

        <div className="settings-content">
          {activeSection === 'profile' ? (
            <WorkspaceProfileSettingsView {...workspaceProfileProps} />
          ) : (
            <PositionsSettingsView {...positionsProps} />
          )}

          <div className="settings-footer">
            {renderBuildInfo}
          </div>
        </div>
      </div>
    </section>
  )
}

function App() {
  const [activeView, setActiveView] = useState('dashboard')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState('All')
  const [employees, setEmployees] = useState([])
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [shifts, setShifts] = useState([])
  const [scheduleCapacities, setScheduleCapacities] = useState([])
  const [schedulePublication, setSchedulePublication] = useState({
    weekStartDate: getCurrentWeekStartDate(),
    status: 'draft',
    publishedAt: null,
    unpublishedAt: null,
    publishedBy: null,
  })
  const [publishedShifts, setPublishedShifts] = useState([])
  const [scheduleWeekStart, setScheduleWeekStart] = useState(() => getCurrentWeekStartDate())
  const [scheduleEmployees, setScheduleEmployees] = useState([])
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
  const [localNow, setLocalNow] = useState(() => getLocalNow())
  const [todayWeekShifts, setTodayWeekShifts] = useState([])
  const [todayWeekCapacities, setTodayWeekCapacities] = useState([])
  const [todayWeekPublishedShifts, setTodayWeekPublishedShifts] = useState([])
  const [todayWeekPublication, setTodayWeekPublication] = useState({
    weekStartDate: getCurrentWeekStartDate(),
    status: 'draft',
    publishedAt: null,
    unpublishedAt: null,
    publishedBy: null,
  })
  const [isTodayWeekLoading, setIsTodayWeekLoading] = useState(true)
  const [isReservationsModuleConnected, setIsReservationsModuleConnected] = useState(false)
  const [isInventoryModuleConnected, setIsInventoryModuleConnected] = useState(false)
  const [settingsSection, setSettingsSection] = useState('profile')
  const [workspaceProfile, setWorkspaceProfile] = useState(EMPTY_WORKSPACE_PROFILE)
  const [workspaceProfileDraft, setWorkspaceProfileDraft] = useState(EMPTY_WORKSPACE_PROFILE)
  const [isWorkspaceProfileLoading, setIsWorkspaceProfileLoading] = useState(true)
  const [isSavingWorkspaceProfile, setIsSavingWorkspaceProfile] = useState(false)
  const [workspaceProfileNotice, setWorkspaceProfileNotice] = useState('')

  const workspaceTimeZone = workspaceProfile.timezone
  const currentDateLabel = formatCurrentDateLabel(localNow, workspaceTimeZone)
  const currentDateKey = getCurrentDateKey(localNow, workspaceTimeZone)
  const currentTimeGreeting = getTimeGreeting(localNow, workspaceTimeZone)
  const todayWeekStart = useMemo(
    () => getWeekStartDate(parseLocalDate(currentDateKey)),
    [currentDateKey],
  )

  const isViewingTodayWeekInScheduler = scheduleWeekStart === todayWeekStart

  const brandDisplay = useMemo(
    () => buildBrandDisplay(workspaceProfile),
    [workspaceProfile],
  )

  const profileChipDisplay = useMemo(
    () => buildProfileChipDisplay(workspaceProfile),
    [workspaceProfile],
  )

  const dashboardShifts = useMemo(() => {
    const draftSource = isViewingTodayWeekInScheduler ? shifts : todayWeekShifts
    return resolveLiveDraftShiftsForWeek(draftSource, todayWeekStart)
  }, [isViewingTodayWeekInScheduler, shifts, todayWeekShifts, todayWeekStart])

  const dashboardCapacities = useMemo(() => {
    const capacitySource = isViewingTodayWeekInScheduler ? scheduleCapacities : todayWeekCapacities
    return resolveLiveDraftCapacitiesForWeek(capacitySource, todayWeekStart, {
      useSchedulerSource: isViewingTodayWeekInScheduler,
    })
  }, [isViewingTodayWeekInScheduler, scheduleCapacities, todayWeekCapacities, todayWeekStart])

  const dashboardPublishedShifts = useMemo(() => (
    isViewingTodayWeekInScheduler ? publishedShifts : todayWeekPublishedShifts
  ), [isViewingTodayWeekInScheduler, publishedShifts, todayWeekPublishedShifts])

  const isTodayWeekPublished = useMemo(() => {
    const publication = isViewingTodayWeekInScheduler ? schedulePublication : todayWeekPublication
    return publication?.status === 'published'
  }, [isViewingTodayWeekInScheduler, schedulePublication, todayWeekPublication])

  const liveFloorState = useMemo(() => buildLiveFloorState({
    publishedShifts: dashboardPublishedShifts,
    isWeekPublished: isTodayWeekPublished,
    employees: scheduleEmployees,
    todayKey: currentDateKey,
    now: localNow,
  }), [
    dashboardPublishedShifts,
    isTodayWeekPublished,
    scheduleEmployees,
    currentDateKey,
    localNow,
  ])

  const refreshTodayWeekPublishedData = useCallback(async (weekStartDate = todayWeekStart) => {
    const normalizedWeekStart = `${weekStartDate ?? ''}`.trim() || todayWeekStart
    if (!normalizedWeekStart) {
      return { publication: null, publishedShifts: [] }
    }

    const state = await getWeekSchedulePublicationState(normalizedWeekStart)

    if (normalizedWeekStart === scheduleWeekStart) {
      setSchedulePublication(state.publication ?? {
        weekStartDate: normalizedWeekStart,
        status: 'draft',
        publishedAt: null,
        unpublishedAt: null,
        publishedBy: null,
      })
      setPublishedShifts(Array.isArray(state.publishedShifts) ? state.publishedShifts : [])
    } else {
      setTodayWeekPublication(state.publication ?? {
        weekStartDate: normalizedWeekStart,
        status: 'draft',
        publishedAt: null,
        unpublishedAt: null,
        publishedBy: null,
      })
      setTodayWeekPublishedShifts(Array.isArray(state.publishedShifts) ? state.publishedShifts : [])
    }

    return state
  }, [scheduleWeekStart, todayWeekStart])

  const refreshTodayWeekDraftData = useCallback(async (weekStartDate = todayWeekStart) => {
    const normalizedWeekStart = `${weekStartDate ?? ''}`.trim() || todayWeekStart
    if (!normalizedWeekStart) {
      return { shifts: [], capacities: [] }
    }

    const weekDateKeys = getWeekDateKeys(normalizedWeekStart)
    const [remoteShifts, remoteCapacities] = await Promise.all([
      getShifts({
        startDate: weekDateKeys[0],
        endDate: weekDateKeys[weekDateKeys.length - 1],
      }),
      getScheduleCapacities({ shiftDates: weekDateKeys }),
    ])

    if (normalizedWeekStart === scheduleWeekStart) {
      setShifts(remoteShifts)
      setScheduleCapacities(remoteCapacities)
    } else {
      setTodayWeekShifts(remoteShifts)
      setTodayWeekCapacities(remoteCapacities)
    }

    return { shifts: remoteShifts, capacities: remoteCapacities }
  }, [scheduleWeekStart, todayWeekStart])

  const isDashboardScheduleLoading = isViewingTodayWeekInScheduler
    ? isScheduleLoading
    : isTodayWeekLoading

  const isLiveFloorLoading = isViewingTodayWeekInScheduler
    ? isScheduleLoading
    : isTodayWeekLoading

  const operationalSnapshot = useMemo(() => buildOperationalSnapshot({
    shifts: dashboardShifts,
    shiftTemplates,
    scheduleCapacities: dashboardCapacities,
    employees: scheduleEmployees,
    todayKey: currentDateKey,
    todayDateLabel: currentDateLabel,
    timeGreeting: currentTimeGreeting,
    businessName: workspaceProfile.businessName,
    userName: workspaceProfile.managerName,
  }), [
    dashboardShifts,
    shiftTemplates,
    dashboardCapacities,
    scheduleEmployees,
    currentDateKey,
    currentDateLabel,
    currentTimeGreeting,
    workspaceProfile.businessName,
    workspaceProfile.managerName,
  ])

  const timelineEvents = useMemo(() => buildTodayTimeline({
    shifts: dashboardShifts,
    shiftTemplates,
    todayKey: currentDateKey,
  }), [dashboardShifts, shiftTemplates, currentDateKey])

  const todayReservationsSummary = useMemo(
    () => buildTodayReservationsSummary(reservations, currentDateKey),
    [reservations, currentDateKey],
  )

  const dashboardStats = useMemo(() => buildDashboardStats({
    liveFloorState,
    reservationsConnected: isReservationsModuleConnected,
    reservationsSummary: todayReservationsSummary,
    inventoryConnected: isInventoryModuleConnected,
    lowStockCount: countLowStockAlerts(inventoryItems),
  }), [
    liveFloorState,
    isReservationsModuleConnected,
    todayReservationsSummary,
    isInventoryModuleConnected,
    inventoryItems,
  ])

  const refreshReservations = useCallback(async () => {
    try {
      const remoteReservations = await getReservations()
      setReservations(remoteReservations)
      setIsReservationsModuleConnected(true)
      return remoteReservations
    } catch (error) {
      setReservations([])
      setIsReservationsModuleConnected(!isModuleUnavailableMessage(error.message))
      throw error
    }
  }, [])

  const refreshInventory = useCallback(async () => {
    try {
      const remoteInventory = await getInventoryItems()
      setInventoryItems(remoteInventory)
      setIsInventoryModuleConnected(true)
      return remoteInventory
    } catch (error) {
      setInventoryItems([])
      setIsInventoryModuleConnected(!isModuleUnavailableMessage(error.message))
      throw error
    }
  }, [])

  const refreshDashboardModuleData = useCallback(async () => {
    await Promise.allSettled([
      refreshReservations(),
      refreshInventory(),
    ])
  }, [refreshInventory, refreshReservations])

  useEffect(() => {
    if (activeView !== 'dashboard') return undefined

    refreshDashboardModuleData()
    const intervalId = window.setInterval(refreshDashboardModuleData, 60_000)

    return () => window.clearInterval(intervalId)
  }, [activeView, refreshDashboardModuleData])

  useEffect(() => {
    if (activeView === 'settings' && settingsSection === 'profile') {
      setWorkspaceProfileDraft(workspaceProfile)
      setWorkspaceProfileNotice('')
    }
  }, [activeView, settingsSection, workspaceProfile])

  const handleWorkspaceProfileSubmit = async () => {
    setIsSavingWorkspaceProfile(true)
    setWorkspaceProfileNotice('')

    try {
      const savedProfile = await saveWorkspaceProfile(workspaceProfileDraft)
      setWorkspaceProfile(savedProfile)
      setWorkspaceProfileDraft(savedProfile)
      setWorkspaceProfileNotice('Workspace profile saved.')
    } catch (error) {
      setWorkspaceProfileNotice(error.message || 'Unable to save workspace profile right now.')
    } finally {
      setIsSavingWorkspaceProfile(false)
    }
  }

  const handleWorkspaceLogoFileChange = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (file.size > MAX_WORKSPACE_LOGO_BYTES) {
      setWorkspaceProfileNotice(`Logo must be smaller than ${Math.round(MAX_WORKSPACE_LOGO_BYTES / 1024)} KB.`)
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setWorkspaceProfileDraft((current) => ({
        ...current,
        logoUrl: `${reader.result ?? ''}`.trim(),
      }))
      setWorkspaceProfileNotice('')
    }
    reader.onerror = () => {
      setWorkspaceProfileNotice('Unable to read logo file.')
    }
    reader.readAsDataURL(file)
  }

  const handleClearWorkspaceLogo = () => {
    setWorkspaceProfileDraft((current) => ({ ...current, logoUrl: '' }))
    setWorkspaceProfileNotice('')
  }

  useEffect(() => {
    let isMounted = true

    const loadWorkspaceProfile = async () => {
      setIsWorkspaceProfileLoading(true)
      setWorkspaceProfileNotice('')

      try {
        const remoteProfile = await getWorkspaceProfile()
        if (!isMounted) return
        setWorkspaceProfile(remoteProfile)
        setWorkspaceProfileDraft(remoteProfile)
      } catch (error) {
        if (!isMounted) return
        setWorkspaceProfile(EMPTY_WORKSPACE_PROFILE)
        setWorkspaceProfileDraft(EMPTY_WORKSPACE_PROFILE)
        setWorkspaceProfileNotice(error.message || 'Unable to load workspace profile right now.')
      } finally {
        if (isMounted) {
          setIsWorkspaceProfileLoading(false)
        }
      }
    }

    loadWorkspaceProfile()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setLocalNow(getLocalNow())
    }, 60_000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (scheduleWeekStart === todayWeekStart) {
      setIsTodayWeekLoading(false)
      return
    }

    let isMounted = true

    const loadTodayWeekData = async () => {
      setIsTodayWeekLoading(true)
      const weekDateKeys = getWeekDateKeys(todayWeekStart)

      try {
        const [remoteShifts, remoteCapacities, publicationState] = await Promise.all([
          getShifts({
            startDate: weekDateKeys[0],
            endDate: weekDateKeys[weekDateKeys.length - 1],
          }),
          getScheduleCapacities({ shiftDates: weekDateKeys }),
          getWeekSchedulePublicationState(todayWeekStart),
        ])
        if (!isMounted) return

        setTodayWeekShifts(remoteShifts)
        setTodayWeekCapacities(remoteCapacities)
        setTodayWeekPublishedShifts(publicationState.publishedShifts ?? [])
        setTodayWeekPublication(publicationState.publication ?? {
          weekStartDate: todayWeekStart,
          status: 'draft',
          publishedAt: null,
          unpublishedAt: null,
          publishedBy: null,
        })
      } catch {
        if (!isMounted) return
        setTodayWeekShifts([])
        setTodayWeekCapacities([])
        setTodayWeekPublishedShifts([])
        setTodayWeekPublication({
          weekStartDate: todayWeekStart,
          status: 'draft',
          publishedAt: null,
          unpublishedAt: null,
          publishedBy: null,
        })
      } finally {
        if (isMounted) {
          setIsTodayWeekLoading(false)
        }
      }
    }

    loadTodayWeekData()

    return () => {
      isMounted = false
    }
  }, [scheduleWeekStart, todayWeekStart, activeView])

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
        setEmployees(remoteEmployees)
        setScheduleEmployees(remoteEmployees)
      } catch (error) {
        if (!isMounted) return

        setEmployees([])
        setScheduleEmployees([])
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
        await refreshInventory()
      } catch (error) {
        if (!isMounted) return
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
  }, [refreshInventory])

  useEffect(() => {
    let isMounted = true

    const loadScheduleBootstrap = async () => {
      setIsWeeklyTemplatesLoading(true)
      setScheduleNotice('')

      try {
        const remoteTemplates = await getShiftTemplates()
        if (!isMounted) return
        setShiftTemplates(composeShiftTemplates(remoteTemplates))
      } catch (error) {
        if (!isMounted) return
        setShiftTemplates([])
        setScheduleNotice(error.message || 'Unable to load shift templates right now.')
      }

      try {
        const remoteWeeklyTemplates = await getWeeklyScheduleTemplates()
        if (!isMounted) return
        setWeeklyTemplates(remoteWeeklyTemplates)
      } catch (_error) {
        if (!isMounted) return
        setWeeklyTemplates([])
      }

      try {
        const remoteEmployees = await getEmployees()
        if (!isMounted) return
        setEmployees(remoteEmployees)
        setScheduleEmployees(remoteEmployees)
      } catch (error) {
        if (!isMounted) return
        setEmployees([])
        setScheduleEmployees([])
        setScheduleNotice((current) => (
          current || error.message || 'Unable to load employees right now.'
        ))
      } finally {
        if (isMounted) {
          setIsWeeklyTemplatesLoading(false)
        }
      }
    }

    loadScheduleBootstrap()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadScheduleWeekData = async (weekStartDate) => {
      setIsScheduleLoading(true)
      setScheduleNotice('')
      const weekDateKeys = getWeekDateKeys(weekStartDate)

      try {
        const [remoteShifts, remoteCapacities, publicationState] = await Promise.all([
          getShifts({
            startDate: weekDateKeys[0],
            endDate: weekDateKeys[weekDateKeys.length - 1],
          }),
          getScheduleCapacities({ shiftDates: weekDateKeys }),
          getWeekSchedulePublicationState(weekStartDate),
        ])
        if (!isMounted) return

        setShifts(remoteShifts)
        setScheduleCapacities(remoteCapacities)
        setSchedulePublication(publicationState.publication ?? {
          weekStartDate,
          status: 'draft',
          publishedAt: null,
          unpublishedAt: null,
          publishedBy: null,
        })
        setPublishedShifts(publicationState.publishedShifts ?? [])
      } catch (error) {
        if (!isMounted) return

        setShifts([])
        setScheduleCapacities([])
        setSchedulePublication({
          weekStartDate,
          status: 'draft',
          publishedAt: null,
          unpublishedAt: null,
          publishedBy: null,
        })
        setPublishedShifts([])
        setScheduleNotice(error.message || 'Unable to load schedule right now.')
      } finally {
        if (isMounted) {
          setIsScheduleLoading(false)
        }
      }
    }

    loadScheduleWeekData(scheduleWeekStart)

    return () => {
      isMounted = false
    }
  }, [scheduleWeekStart, todayWeekStart])

  useEffect(() => {
    let isMounted = true

    const loadReservations = async () => {
      setIsReservationsLoading(true)
      setReservationNotice('')

      try {
        await refreshReservations()
      } catch (error) {
        if (!isMounted) return
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
  }, [refreshReservations])

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

  const employeePositionOptions = useMemo(() => buildEmployeePositionOptions(positions), [positions])

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
    setEmployees(remoteEmployees)
    setScheduleEmployees(remoteEmployees)
    return remoteEmployees
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
        const updatedPosition = await updatePosition(editingPositionId, {
          name: positionForm.name.trim(),
          department: positionForm.department,
        })
        setPositions((current) => current
          .map((position) => (position.id === updatedPosition.id ? updatedPosition : position))
          .sort((left, right) => (left.sortOrder - right.sortOrder) || left.name.localeCompare(right.name)))
        setPositionsNotice('Position updated.')
      } else {
        const createdPosition = await createPosition({
          name: positionForm.name.trim(),
          department: positionForm.department,
          sortOrder: positions.length + 1,
        })
        setPositions((current) => [...current, createdPosition]
          .sort((left, right) => (left.sortOrder - right.sortOrder) || left.name.localeCompare(right.name)))
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
      setPositions((current) => current.filter((position) => position.id !== positionPendingDelete.id))
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

  const refreshScheduleCapacities = async (weekStartDate = scheduleWeekStart) => {
    const weekDateKeys = getWeekDateKeys(weekStartDate)
    const remote = await getScheduleCapacities({ shiftDates: weekDateKeys })
    setScheduleCapacities(remote)
    return remote
  }

  const refreshSchedulePublication = async (weekStartDate = scheduleWeekStart) => {
    try {
      const state = await getWeekSchedulePublicationState(weekStartDate)
      setSchedulePublication(state.publication ?? {
        weekStartDate,
        status: 'draft',
        publishedAt: null,
        unpublishedAt: null,
        publishedBy: null,
      })
      setPublishedShifts(Array.isArray(state.publishedShifts) ? state.publishedShifts : [])
      return state
    } catch (error) {
      console.error('[App] refreshSchedulePublication failed:', error)
      setScheduleNotice(error?.message || 'Unable to refresh published schedule status.')
      return null
    }
  }

  const handlePublishWeekSchedule = async (weekStartDate, weekDateKeys = []) => {
    const normalizedKeys = (weekDateKeys ?? []).map((item) => `${item}`.trim()).filter(Boolean)
    const weekDateSet = new Set(normalizedKeys.length > 0 ? normalizedKeys : getWeekDateKeys(weekStartDate))
    const draftWeekShifts = shifts.filter((shift) => weekDateSet.has(`${shift.date ?? ''}`.slice(0, 10)))

    try {
      const result = await publishWeekSchedule({
        weekStartDate,
        weekDateKeys: Array.from(weekDateSet),
        draftShifts: draftWeekShifts,
        knownTemplateIds: buildKnownShiftTemplateIdSet(shiftTemplates),
      })

      if (!result?.publication) {
        throw new Error('Publish did not return a publication record.')
      }

      if (weekStartDate === scheduleWeekStart) {
        setSchedulePublication(result.publication)
        setPublishedShifts(Array.isArray(result.publishedShifts) ? result.publishedShifts : [])
      }

      if (weekStartDate === todayWeekStart) {
        await Promise.all([
          refreshTodayWeekDraftData(weekStartDate),
          weekStartDate === scheduleWeekStart
            ? Promise.resolve()
            : refreshTodayWeekPublishedData(weekStartDate),
        ])
      }

      setScheduleNotice(result.publication.status === 'published' ? 'Schedule published for employees.' : 'Schedule updated.')
      return result
    } catch (error) {
      const message = error?.message || 'Unable to publish this week right now.'
      setScheduleNotice(message)
      throw error
    }
  }

  const handleUnpublishWeekSchedule = async (weekStartDate) => {
    const result = await unpublishWeekSchedule({ weekStartDate })

    if (weekStartDate === scheduleWeekStart) {
      setSchedulePublication(result.publication)
      setPublishedShifts(result.publishedShifts)
    }

    if (weekStartDate === todayWeekStart) {
      await Promise.all([
        refreshTodayWeekDraftData(weekStartDate),
        weekStartDate === scheduleWeekStart
          ? Promise.resolve()
          : refreshTodayWeekPublishedData(weekStartDate),
      ])
    }

    setScheduleNotice('Schedule returned to draft. Employees can no longer see it.')
    return result
  }

  const handleUpdateCellCapacity = async ({ shiftTemplateId, shiftDate, requiredCount }) => {
    const saved = await upsertScheduleCapacity({ shiftTemplateId, shiftDate, requiredCount })
    const savedKey = `${String(saved.shiftTemplateId)}:${saved.shiftDate}`

    setScheduleCapacities((current) => {
      const withoutExisting = current.filter((item) => `${String(item.shiftTemplateId)}:${item.shiftDate}` !== savedKey)
      return [...withoutExisting, saved]
    })

    await refreshScheduleViewData()

    setScheduleNotice('Required staffing updated.')
    return saved
  }

  const handleRenameShiftTemplate = async (template, nextName) => {
    if (!template?.templateId) {
      throw new Error('Template could not be found.')
    }

    if (!nextName?.trim()) {
      throw new Error('Template name is required.')
    }

    const payload = {
      name: nextName.trim(),
      startTime: normalizeTimeValue(template.startTime),
      endTime: normalizeTimeValue(template.endTime),
      defaultRole: template.defaultRole ?? '',
      defaultArea: template.defaultArea ?? '',
      notes: template.notes ?? '',
    }

    await updateShiftTemplate(template.templateId, payload)
    await refreshShiftTemplates()
    setScheduleNotice('Shift template renamed.')
  }

  const handleEditShiftTemplate = (template) => {
    setTemplateNotice('')
    setEditingTemplate(template)
    setTemplateForm(buildTemplateForm(template))
    setIsTemplateModalOpen(true)
  }

  const handleDuplicateShiftTemplate = async (template) => {
    if (!template?.templateId) {
      throw new Error('Template could not be found.')
    }

    const payload = {
      name: `${template.name} Copy`,
      startTime: normalizeTimeValue(template.startTime),
      endTime: normalizeTimeValue(template.endTime),
      defaultRole: template.defaultRole ?? '',
      defaultArea: template.defaultArea ?? '',
      notes: template.notes ?? '',
    }

    await createShiftTemplate(payload)
    await refreshShiftTemplates()
    setScheduleNotice('Shift template duplicated.')
  }

  const handleDeleteShiftTemplate = async (template) => {
    if (!template?.templateId) {
      throw new Error('Template could not be found.')
    }

    await deleteShiftTemplate(template.templateId)
    await refreshShiftTemplates()

    if (formData.shift_template === template.id) {
      setFormData((current) => ({ ...current, shift_template: 'custom' }))
    }

    if (editingTemplate?.id === template.id) {
      setEditingTemplate(null)
      setTemplateForm(buildTemplateForm())
    }

    setScheduleNotice('Shift template deleted. Existing scheduled shifts were not changed.')
  }

  const handleApplyAreaToTemplate = async (template, area) => {
    if (!template?.templateId) {
      throw new Error('Template could not be found.')
    }

    const normalizedArea = `${area ?? ''}`.trim()
    if (!normalizedArea) {
      throw new Error('Area is required before saving to template.')
    }

    await updateShiftTemplate(template.templateId, {
      name: template.name,
      startTime: normalizeTimeValue(template.startTime),
      endTime: normalizeTimeValue(template.endTime),
      defaultRole: template.defaultRole ?? '',
      defaultArea: normalizedArea,
      notes: template.notes ?? '',
    })

    await refreshShiftTemplates()
    setScheduleNotice('Template area saved.')
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
        shiftTemplateId: shift.shiftTemplateId ?? null,
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
        shift.shiftTemplateId ?? 'none',
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

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)

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

        const rawPayload = {
          employee_id: options?.employees ? templateShift.employeeId : null,
          date: templateShift.date,
          startTime: normalizedStart,
          endTime: normalizedEnd,
          role: options?.positions ? templateShift.role : '',
          area: options?.areas ? templateShift.area : '',
          status: templateShift.status || 'Scheduled',
          notes: options?.notes ? (templateShift.notes ?? '') : '',
          shiftTemplateId: templateShift.shiftTemplateId ?? null,
        }

        const prepared = prepareShiftForSave(rawPayload, gridShiftOptions)

        const dedupeKey = [
          prepared.employee_id ?? 'none',
          prepared.date,
          prepared.shiftTemplateId ?? 'none',
          prepared.startTime,
          prepared.endTime,
          `${prepared.role ?? ''}`.trim().toLowerCase(),
          `${prepared.area ?? ''}`.trim().toLowerCase(),
        ].join('|')

        if (createdKeySet.has(dedupeKey)) {
          continue
        }
        createdKeySet.add(dedupeKey)

        const savedShift = await createShift(prepared, gridShiftOptions)
        created.push(savedShift)
      }

      await refreshScheduleViewData()
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

  const handleCopyHistoricalWeek = async ({ sourceWeekDays, targetWeekDays }) => {
    if (!Array.isArray(sourceWeekDays) || sourceWeekDays.length !== 7) {
      throw new Error('Select a valid source week first.')
    }

    if (!Array.isArray(targetWeekDays) || targetWeekDays.length !== 7) {
      throw new Error('Current week is unavailable for copying.')
    }

    const sourceByDate = new Map(sourceWeekDays.map((day, index) => [day.key, index]))
    const targetDateByIndex = new Map(targetWeekDays.map((day, index) => [index, day.key]))
    const targetDates = new Set(targetWeekDays.map((day) => day.key))

    const sourceDateKeys = sourceWeekDays.map((day) => day.key).sort()
    const sourceWeekShifts = await getShifts({
      startDate: sourceDateKeys[0],
      endDate: sourceDateKeys[sourceDateKeys.length - 1],
    })

    if (sourceWeekShifts.length === 0) {
      throw new Error('No shifts found in the selected week.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)

    try {
      for (const existingShift of shifts.filter((shift) => targetDates.has(shift.date))) {
        await deleteShift(existingShift.id)
      }

      const created = []
      const dedupe = new Set()

      for (const shift of sourceWeekShifts) {
        const dayIndex = sourceByDate.get(shift.date)
        const targetDate = targetDateByIndex.get(dayIndex)
        const startTime = normalizeTimeValue(shift.startTime)
        const endTime = normalizeTimeValue(shift.endTime)

        if (dayIndex === undefined || !targetDate || !startTime || !endTime) continue

        const rawPayload = {
          employee_id: shift.employeeId ?? null,
          date: targetDate,
          startTime,
          endTime,
          role: shift.role ?? '',
          area: shift.area ?? '',
          status: shift.status ?? 'Scheduled',
          notes: shift.notes ?? '',
          shiftTemplateId: shift.shiftTemplateId ?? null,
        }

        const prepared = prepareShiftForSave(rawPayload, gridShiftOptions)

        const dedupeKey = [
          prepared.employee_id ?? 'none',
          prepared.date,
          prepared.shiftTemplateId ?? 'none',
          prepared.startTime,
          prepared.endTime,
          `${prepared.role ?? ''}`.trim().toLowerCase(),
          `${prepared.area ?? ''}`.trim().toLowerCase(),
        ].join('|')

        if (dedupe.has(dedupeKey)) continue
        dedupe.add(dedupeKey)

        const saved = await createShift(prepared, gridShiftOptions)
        created.push(saved)
      }

      await refreshScheduleViewData()
      setScheduleNotice(`Copied ${created.length} shift${created.length === 1 ? '' : 's'} into the current week.`)
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const bulkCreateShiftsFromSource = async (sourceShifts, mapTargetDate) => {
    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)
    const created = []
    const dedupe = new Set()

    for (const shift of sourceShifts) {
      const targetDate = mapTargetDate(shift)
      const startTime = normalizeTimeValue(shift.startTime)
      const endTime = normalizeTimeValue(shift.endTime)

      if (!targetDate || !startTime || !endTime) continue

      const rawPayload = buildCloneRawPayload({
        ...shift,
        startTime,
        endTime,
      }, targetDate)

      const prepared = prepareShiftForSave(rawPayload, gridShiftOptions)
      const dedupeKey = buildShiftDedupeKey(prepared)

      if (dedupe.has(dedupeKey)) continue
      dedupe.add(dedupeKey)

      const saved = await createShift(prepared, gridShiftOptions)
      created.push(saved)
    }

    return created
  }

  const handleCopyDay = async ({ sourceDate, targetDate, overwrite = false }) => {
    if (!sourceDate || !targetDate) {
      throw new Error('Source and target day are required.')
    }

    if (sourceDate === targetDate) {
      throw new Error('Source and target day must be different.')
    }

    const sourceShifts = shifts.filter((shift) => shift.date === sourceDate)
    if (sourceShifts.length === 0) {
      throw new Error('No assignments found on the source day.')
    }

    const targetShifts = shifts.filter((shift) => shift.date === targetDate)
    if (targetShifts.length > 0 && !overwrite) {
      throw new Error('Target day has existing assignments. Confirm overwrite to continue.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    try {
      if (overwrite) {
        for (const existingShift of targetShifts) {
          await deleteShift(existingShift.id)
        }
      }

      const created = await bulkCreateShiftsFromSource(sourceShifts, () => targetDate)
      await refreshScheduleViewData()
      setScheduleNotice(`Copied ${created.length} assignment${created.length === 1 ? '' : 's'} to the target day.`)
      return created
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleCopyWeek = async ({ sourceWeekDays, targetWeekStartDate, overwrite = false }) => {
    if (!Array.isArray(sourceWeekDays) || sourceWeekDays.length !== 7) {
      throw new Error('Current week is unavailable for copying.')
    }

    if (!targetWeekStartDate) {
      throw new Error('Select a target week first.')
    }

    const targetWeekDays = getWeekDays(targetWeekStartDate)
    if (targetWeekDays[0]?.key === sourceWeekDays[0]?.key) {
      throw new Error('Select a different week as the copy target.')
    }

    const sourceByDate = new Map(sourceWeekDays.map((day, index) => [day.key, index]))
    const targetDateByIndex = new Map(targetWeekDays.map((day, index) => [index, day.key]))
    const sourceDates = new Set(sourceWeekDays.map((day) => day.key))

    const sourceWeekShifts = shifts.filter((shift) => sourceDates.has(shift.date))
    if (sourceWeekShifts.length === 0) {
      throw new Error('Current week has no assignments to copy.')
    }

    const targetDateKeys = targetWeekDays.map((day) => day.key).sort()
    const targetWeekShifts = await getShifts({
      startDate: targetDateKeys[0],
      endDate: targetDateKeys[targetDateKeys.length - 1],
    })

    if (targetWeekShifts.length > 0 && !overwrite) {
      throw new Error('Target week has existing assignments. Confirm overwrite to continue.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    try {
      for (const existingShift of targetWeekShifts) {
        await deleteShift(existingShift.id)
      }

      const created = await bulkCreateShiftsFromSource(sourceWeekShifts, (shift) => {
        const dayIndex = sourceByDate.get(shift.date)
        return targetDateByIndex.get(dayIndex)
      })

      await refreshScheduleViewData()
      setScheduleNotice(`Copied ${created.length} assignment${created.length === 1 ? '' : 's'} to ${formatWeekRange(targetWeekDays)} (draft only).`)
      return created
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleClearDay = async (dateKey) => {
    if (!dateKey) {
      throw new Error('Day is required.')
    }

    const dayShifts = shifts.filter((shift) => shift.date === dateKey)
    if (dayShifts.length === 0) {
      throw new Error('No assignments found on this day.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    try {
      for (const shift of dayShifts) {
        await deleteShift(shift.id)
      }

      await refreshScheduleViewData()
      setScheduleNotice(`Cleared ${dayShifts.length} assignment${dayShifts.length === 1 ? '' : 's'} from the day.`)
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleClearWeek = async (weekDays) => {
    if (!Array.isArray(weekDays) || weekDays.length === 0) {
      throw new Error('Current week is unavailable for clearing.')
    }

    const weekDates = new Set(weekDays.map((day) => day.key))
    const weekShifts = shifts.filter((shift) => weekDates.has(normalizeCellDateKey(shift.date)))

    if (weekShifts.length === 0) {
      throw new Error('This week is already empty.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    try {
      for (const shift of weekShifts) {
        await deleteShift(shift.id)
      }

      await refreshScheduleViewData()
      setScheduleNotice(`Cleared ${weekShifts.length} draft assignment${weekShifts.length === 1 ? '' : 's'} from the week.`)
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleClearGridCell = async ({ template, shiftDate, shiftIds }) => {
    if (!template || !shiftDate) {
      throw new Error('Shift cell could not be identified.')
    }

    const ids = Array.isArray(shiftIds) ? shiftIds.filter(Boolean) : []
    const cellKey = buildTemplateCellKey({ template, shiftDate })

    const cellShifts = shifts.filter((shift) => {
      if (ids.length > 0) {
        return ids.some((id) => String(id) === String(shift.id))
      }
      return buildShiftCellKeyFromRecord(shift) === cellKey
    })

    if (cellShifts.length === 0) {
      throw new Error('No assignments found in this shift cell.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    try {
      for (const shift of cellShifts) {
        await deleteShift(shift.id)
      }

      await refreshScheduleViewData()
      setScheduleNotice(`Cleared ${cellShifts.length} assignment${cellShifts.length === 1 ? '' : 's'} from this shift.`)
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleAutoFillWeekFromTemplate = async ({ templateId, weekDays, options, replaceExisting = false }) => {
    if (!templateId) {
      throw new Error('Select a weekly template first.')
    }

    if (!Array.isArray(weekDays) || weekDays.length === 0) {
      throw new Error('Current week is not available for auto fill.')
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

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)

    try {
      if (replaceExisting) {
        for (const existingShift of shifts.filter((shift) => weekDates.has(shift.date))) {
          await deleteShift(existingShift.id)
        }
      }

      const occupiedCells = new Set(
        (replaceExisting ? [] : shifts.filter((shift) => weekDates.has(shift.date)))
          .map((shift) => buildShiftCellKeyFromRecord(shift))
          .filter(Boolean),
      )

      const created = []
      const createdKeySet = new Set()

      for (const templateShift of targetTemplateShifts) {
        const normalizedStart = normalizeTimeValue(templateShift.startTime)
        const normalizedEnd = normalizeTimeValue(templateShift.endTime)
        if (!normalizedStart || !normalizedEnd) continue

        const cellKey = buildShiftCellKeyFromParts({
          shiftTemplateId: templateShift.shiftTemplateId,
          date: templateShift.date,
        })

        if (!replaceExisting && cellKey && occupiedCells.has(cellKey)) {
          continue
        }

        const rawPayload = {
          employee_id: options?.employees ? templateShift.employeeId : null,
          date: templateShift.date,
          startTime: normalizedStart,
          endTime: normalizedEnd,
          role: options?.positions ? templateShift.role : '',
          area: options?.areas ? templateShift.area : '',
          status: templateShift.status || 'Scheduled',
          notes: options?.notes ? (templateShift.notes ?? '') : '',
          shiftTemplateId: templateShift.shiftTemplateId ?? null,
        }

        const prepared = prepareShiftForSave(rawPayload, gridShiftOptions)
        const dedupeKey = buildShiftDedupeKey(prepared)

        if (createdKeySet.has(dedupeKey)) {
          continue
        }
        createdKeySet.add(dedupeKey)

        const savedShift = await createShift(prepared, gridShiftOptions)
        created.push(savedShift)

        if (cellKey) {
          occupiedCells.add(cellKey)
        }
      }

      await refreshScheduleViewData()
      setScheduleNotice(`Auto filled ${created.length} assignment${created.length === 1 ? '' : 's'} from template.`)
      return created
    } catch (error) {
      const message = error?.message || 'Unable to auto fill week right now.'
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

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

  const handleAddCustomPositionToEmployee = async () => {
    const customName = `${employeeForm.customPositionName ?? ''}`.trim()
    if (!customName) {
      const message = 'Enter a custom position name before adding.'
      setSaveError(message)
      setStaffNotice(message)
      return
    }

    const existing = employeePositionOptions.find((position) => position.name.toLowerCase() === customName.toLowerCase())

    setIsSavingEmployee(true)
    setSaveError('')

    try {
      if (!existing) {
        await createPosition({
          name: customName,
          department: employeeForm.department || inferPositionDepartment(customName),
          sortOrder: positions.length + 1,
        })
        await refreshPositions()
      }

      setEmployeeForm((current) => {
        const normalizedCustom = `${current.customPositionName ?? ''}`.trim()
        if (!normalizedCustom) return current

        if (!`${current.primaryPosition ?? ''}`.trim()) {
          return {
            ...current,
            primaryPosition: normalizedCustom,
            customPositionName: '',
          }
        }

        if (current.primaryPosition.trim().toLowerCase() === normalizedCustom.toLowerCase()) {
          return {
            ...current,
            customPositionName: '',
          }
        }

        const nextAdditional = Array.from(new Set([
          ...current.additionalPositions,
          normalizedCustom,
        ]))

        return {
          ...current,
          additionalPositions: nextAdditional,
          customPositionName: '',
        }
      })

      setStaffNotice('Custom position added.')
    } catch (error) {
      const message = error?.message || 'Unable to add custom position right now.'
      setSaveError(message)
      setStaffNotice(message)
    } finally {
      setIsSavingEmployee(false)
    }
  }

  const handleEmployeeSubmit = async (event) => {
    event.preventDefault()

    if (!employeeForm.fullName.trim()) {
      const message = 'Full Name is required.'
      setSaveError(message)
      setStaffNotice(message)
      return
    }

    if (!`${employeeForm.primaryPosition ?? ''}`.trim()) {
      const message = 'Primary Position is required.'
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

    const normalizedPrimary = `${employeeForm.primaryPosition ?? ''}`.trim()
    const normalizedAdditional = Array.from(new Set((employeeForm.additionalPositions ?? [])
      .map((name) => `${name ?? ''}`.trim())
      .filter((name) => name && name.toLowerCase() !== normalizedPrimary.toLowerCase())))

    const allPositionNames = [normalizedPrimary, ...normalizedAdditional]
    const selectedPositions = allPositionNames.map((name) => {
      const fromCatalog = employeePositionOptions.find((position) => position.name.toLowerCase() === name.toLowerCase())
      if (fromCatalog) {
        return {
          id: fromCatalog.id,
          name: fromCatalog.name,
          department: fromCatalog.department,
        }
      }

      return {
        id: null,
        name,
        department: inferPositionDepartment(name),
      }
    })

    const payload = {
      name: employeeForm.fullName.trim(),
      position: allPositionNames.join(', '),
      positions: selectedPositions,
      primaryPosition: normalizedPrimary,
      additionalPositions: normalizedAdditional,
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

      await refreshPositions()
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
      return String(shift.employeeId) === String(employeeId) && shift.date === date
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

  const refreshScheduleShifts = async (weekStartDate = scheduleWeekStart) => {
    const weekDateKeys = getWeekDateKeys(weekStartDate)
    const remoteShifts = await getShifts({
      startDate: weekDateKeys[0],
      endDate: weekDateKeys[weekDateKeys.length - 1],
    })
    setShifts(remoteShifts)
    return remoteShifts
  }

  const refreshScheduleViewData = async (weekStartDate = scheduleWeekStart) => {
    const [remoteShifts, remoteCapacities] = await Promise.all([
      refreshScheduleShifts(weekStartDate),
      refreshScheduleCapacities(weekStartDate),
    ])

    await refreshSchedulePublication(weekStartDate)

    if (weekStartDate === todayWeekStart && weekStartDate !== scheduleWeekStart) {
      setTodayWeekShifts(remoteShifts)
      setTodayWeekCapacities(remoteCapacities)
    }

    return remoteShifts
  }

  const normalizeCellDateKey = (value) => {
    if (!value) return ''
    const raw = `${value}`.trim()
    if (!raw) return ''
    if (raw.includes('T')) return raw.split('T')[0]
    return raw.slice(0, 10)
  }

  const normalizeCellAreaKey = (value) => `${value ?? ''}`.trim().toLowerCase()

  const buildShiftCellKeyFromRecord = (shift) => {
    const normalizedDate = normalizeCellDateKey(shift?.date)
    const templateId = shift?.shiftTemplateId
    if (templateId && normalizedDate) {
      return `${String(templateId)}:${normalizedDate}`
    }

    return [
      normalizedDate,
      normalizeTimeValue(shift?.startTime),
      normalizeTimeValue(shift?.endTime),
      normalizeCellAreaKey(shift?.area),
    ].join(':')
  }

  const buildTemplateCellKey = ({ template, shiftDate }) => {
    const normalizedDate = normalizeCellDateKey(shiftDate)
    const templateId = template?.templateId ?? template?.id
    if (templateId && normalizedDate) {
      return `${String(templateId)}:${normalizedDate}`
    }

    return [
      normalizedDate,
      normalizeTimeValue(template?.startTime),
      normalizeTimeValue(template?.endTime),
      normalizeCellAreaKey(template?.defaultArea),
    ].join(':')
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
      resolveShiftTemplateId(template) === resolveShiftTemplateId(shift)
    )) ?? shiftTemplates.find((template) => (
      normalizeTimeValue(template.startTime) === normalizeTimeValue(shift.startTime)
      && normalizeTimeValue(template.endTime) === normalizeTimeValue(shift.endTime)
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
      await refreshScheduleViewData()
      setScheduleNotice('Shift removed.')
    } catch (error) {
      setScheduleNotice(getSupabaseErrorMessage(error))
    }
  }

  const handleCreateGridShift = async ({ employeeId, shiftDate, template, positionName, notes, requiredCount = 1, currentAssignedCount = 0 }) => {
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
      throw new Error('This employee is already assigned here.')
    }

    if (conflict.type === 'overlap') {
      throw new Error('This shift overlaps with another shift for this employee.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)
    const rawPayload = {
      employee_id: employeeId,
      date: shiftDate,
      startTime,
      endTime,
      role,
      area,
      status: 'Scheduled',
      notes: (notes ?? '').trim(),
    }

    const payload = prepareShiftForSave(rawPayload, {
      ...gridShiftOptions,
      template,
    })

    try {
      const createdShift = await createShift(payload, gridShiftOptions)
      console.log("Created shift", createdShift)
      const refreshedShifts = await refreshScheduleViewData()
      const targetCellKey = buildTemplateCellKey({ template, shiftDate })
      const placed = refreshedShifts.some((shift) => {
        if (String(shift.id) !== String(createdShift.id)) return false
        return buildShiftCellKeyFromRecord(shift) === targetCellKey
      })
      if (!placed) {
        setScheduleNotice('Shift saved, but could not be placed in the grid. Check shift_template_id or cell key.')
        return createdShift
      }
      const nextAssigned = Number(currentAssignedCount) + 1
      if (nextAssigned > Number(requiredCount || 1)) {
        setScheduleNotice('This shift is over capacity.')
      } else {
        setScheduleNotice('Employee assigned successfully.')
      }
      return createdShift
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

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)
    const rawPayload = {
      employee_id: updates.employeeId,
      date: targetShift.date,
      startTime: targetStart,
      endTime: targetEnd,
      role: updates.positionName.trim(),
      area: targetArea,
      status: updates.status || targetShift.status || 'Scheduled',
      notes: updates.notes ?? targetShift.notes ?? '',
      shiftTemplateId: targetShift.shiftTemplateId ?? null,
    }

    const payload = prepareShiftForSave(rawPayload, gridShiftOptions)

    try {
      const savedShift = await updateShift(shiftId, payload, gridShiftOptions)
      await refreshScheduleViewData()
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

  const handleUpdateAssignmentTime = async (shiftId, { startTime, endTime }) => {
    const targetShift = shifts.find((shift) => String(shift.id) === String(shiftId))
    if (!targetShift) {
      throw new Error('Shift assignment could not be found.')
    }

    const normalizedStartTime = normalizeTimeValue(startTime)
    const normalizedEndTime = normalizeTimeValue(endTime)
    const role = `${targetShift.role ?? ''}`.trim()
    const area = `${targetShift.area ?? ''}`.trim()

    if (!validateShiftRequiredFields({
      employeeId: targetShift.employeeId,
      date: targetShift.date,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      role,
      area,
    })) {
      throw new Error('Please complete all required fields before saving.')
    }

    const startMinutes = parseShiftTimeToMinutes(normalizedStartTime)
    const endMinutes = parseShiftTimeToMinutes(normalizedEndTime)

    if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
      throw new Error('Please add a valid start and end time.')
    }

    const conflict = getShiftConflict({
      employeeId: targetShift.employeeId,
      date: targetShift.date,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
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

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)
    const rawPayload = {
      employee_id: targetShift.employeeId,
      date: targetShift.date,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      role,
      area,
      status: targetShift.status ?? 'Scheduled',
      notes: targetShift.notes ?? '',
      shiftTemplateId: targetShift.shiftTemplateId ?? null,
    }

    const payload = prepareShiftForSave(rawPayload, gridShiftOptions)

    try {
      const savedShift = await updateShift(shiftId, payload, gridShiftOptions)
      await refreshScheduleViewData()
      setScheduleNotice('Assignment time updated.')
      return savedShift
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleMoveGridShift = async (shiftId, {
    template,
    shiftDate,
    requiredCount = 1,
    currentAssignedCount = 0,
  }) => {
    const targetShift = shifts.find((shift) => shift.id === shiftId)
    if (!targetShift) {
      throw new Error('Shift assignment could not be found.')
    }

    const normalizedTargetDate = normalizeCellDateKey(shiftDate)
    const sourceTemplateId = resolveShiftTemplateId(targetShift)
    const targetTemplateId = resolveShiftTemplateId(template)

    if (
      normalizedTargetDate === normalizeCellDateKey(targetShift.date)
      && sourceTemplateId
      && targetTemplateId
      && sourceTemplateId === targetTemplateId
    ) {
      return targetShift
    }

    const employeeId = targetShift.employeeId
    const positionName = `${targetShift.role ?? ''}`.trim()
    const startTime = normalizeTimeValue(targetShift.startTime) || normalizeTimeValue(template?.startTime)
    const endTime = normalizeTimeValue(targetShift.endTime) || normalizeTimeValue(template?.endTime)
    const area = `${template?.defaultArea ?? ''}`.trim() || `${targetShift.area ?? ''}`.trim()

    if (!employeeId || !positionName) {
      throw new Error('Please complete all required fields before saving.')
    }

    if (!validateShiftRequiredFields({
      employeeId,
      date: normalizedTargetDate,
      startTime,
      endTime,
      role: positionName,
      area,
    })) {
      throw new Error('Please complete all required fields before saving.')
    }

    const conflict = getShiftConflict({
      employeeId,
      date: normalizedTargetDate,
      startTime,
      endTime,
      excludeShiftId: shiftId,
    })

    if (conflict.type === 'duplicate') {
      throw new Error('This employee is already assigned here.')
    }

    if (conflict.type === 'overlap') {
      throw new Error('This shift overlaps with another shift for this employee.')
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)
    const rawPayload = {
      employee_id: employeeId,
      date: normalizedTargetDate,
      startTime,
      endTime,
      role: positionName,
      area,
      status: targetShift.status || 'Scheduled',
      notes: targetShift.notes ?? '',
    }

    const payload = prepareShiftForSave(rawPayload, {
      ...gridShiftOptions,
      template,
    })

    try {
      const savedShift = await updateShift(shiftId, payload, gridShiftOptions)
      await refreshScheduleViewData()
      const nextAssigned = Number(currentAssignedCount) + 1
      if (nextAssigned > Number(requiredCount || 1)) {
        setScheduleNotice('This shift is over capacity.')
      } else {
        setScheduleNotice('Shift moved successfully.')
      }
      return savedShift
    } catch (error) {
      const message = getSupabaseErrorMessage(error)
      setScheduleNotice(message)
      throw new Error(message)
    } finally {
      setIsSavingShift(false)
    }
  }

  const handleCopyGridShift = async (shiftId, {
    template,
    shiftDate,
    requiredCount = 1,
    currentAssignedCount = 0,
    cellShifts = [],
  }) => {
    const sourceShift = shifts.find((shift) => String(shift.id) === String(shiftId))
    if (!sourceShift) {
      throw new Error('Shift assignment could not be found.')
    }

    const sourceTemplateId = resolveShiftTemplateId(sourceShift)
    const targetTemplateId = resolveShiftTemplateId(template)

    if (sourceTemplateId !== targetTemplateId) {
      throw new Error('Copy within the same shift template row only.')
    }

    if ((cellShifts ?? []).some((shift) => String(shift.employeeId) === String(sourceShift.employeeId))) {
      throw new Error('This employee is already assigned here.')
    }

    const normalizedTargetDate = normalizeCellDateKey(shiftDate)
    const employeeId = sourceShift.employeeId
    const startTime = normalizeTimeValue(sourceShift.startTime)
    const endTime = normalizeTimeValue(sourceShift.endTime)
    const role = `${sourceShift.role ?? ''}`.trim()
    const area = `${sourceShift.area ?? ''}`.trim()

    if (!validateShiftRequiredFields({
      employeeId,
      date: normalizedTargetDate,
      startTime,
      endTime,
      role,
      area,
    })) {
      throw new Error('Please complete all required fields before saving.')
    }

    const conflict = getShiftConflict({
      employeeId,
      date: normalizedTargetDate,
      startTime,
      endTime,
    })

    if (conflict.type === 'duplicate') {
      throw new Error('This employee is already assigned here.')
    }

    if (conflict.type === 'overlap') {
      throw new Error('This shift overlaps with another shift for this employee.')
    }

    const matchedTemplate = shiftTemplates.find((item) => (
      resolveShiftTemplateId(item) === sourceTemplateId
    )) ?? template

    setIsSavingShift(true)
    setScheduleNotice('')

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)
    const rawPayload = {
      employee_id: employeeId,
      date: normalizedTargetDate,
      startTime,
      endTime,
      role,
      area,
      status: sourceShift.status ?? 'Scheduled',
      notes: sourceShift.notes ?? '',
      shiftTemplateId: sourceShift.shiftTemplateId ?? null,
    }

    const payload = prepareShiftForSave(rawPayload, {
      ...gridShiftOptions,
      template: matchedTemplate,
    })

    try {
      const createdShift = await createShift(payload, gridShiftOptions)
      await refreshScheduleViewData()
      const nextAssigned = Number(currentAssignedCount) + 1
      if (nextAssigned > Number(requiredCount || 1)) {
        setScheduleNotice('This shift is over capacity.')
      } else {
        setScheduleNotice('Shift copied successfully.')
      }
      return createdShift
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
      await refreshScheduleViewData()
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

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)

    try {
      const rawPayload = {
        employee_id: shift.employeeId,
        date: targetDate,
        startTime,
        endTime,
        role,
        area,
        status: shift.status ?? 'Scheduled',
        notes: shift.notes ?? '',
        shiftTemplateId: shift.shiftTemplateId ?? null,
      }

      const prepared = prepareShiftForSave(rawPayload, gridShiftOptions)

      await createShift(prepared, gridShiftOptions)

      await refreshScheduleViewData()
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

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)

    try {
      const created = []
      for (const date of candidateDates) {
        const rawPayload = {
          employee_id: shift.employeeId,
          date,
          startTime,
          endTime,
          role,
          area,
          status: shift.status ?? 'Scheduled',
          notes: shift.notes ?? '',
          shiftTemplateId: shift.shiftTemplateId ?? null,
        }

        const prepared = prepareShiftForSave(rawPayload, gridShiftOptions)
        const savedShift = await createShift(prepared, gridShiftOptions)
        created.push(savedShift)
      }

      await refreshScheduleViewData()
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

    const employeeId = `${formData.employee_id ?? ''}`.trim()
    const selectedEmployee = scheduleEmployees.find((employee) => String(employee.id) === employeeId)

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

    const selectedTemplate = formData.shift_template !== 'custom'
      ? shiftTemplates.find((template) => template.id === formData.shift_template)
      : null
    const legacyShiftOptions = getLegacyShiftIntegrityOptions(shiftTemplates, {
      requireTemplateId: Boolean(selectedTemplate) || Boolean(editingShift?.shiftTemplateId),
    })

    const rawPayload = {
      employee_id: formData.employee_id,
      role: formData.role,
      area: resolvedArea,
      date: formData.shift_date,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      status: formData.status,
      notes: formData.notes,
      shiftTemplateId: editingShift?.shiftTemplateId ?? resolveShiftTemplateId(selectedTemplate),
    }

    const payload = prepareShiftForSave(rawPayload, {
      ...legacyShiftOptions,
      template: selectedTemplate,
    })

    try {
      const savedShift = editingShift
        ? await updateShift(editingShift.id, payload, legacyShiftOptions)
        : await createShift(payload, legacyShiftOptions)

      await refreshScheduleViewData()
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

    if (!templateForm.defaultArea.trim()) {
      setTemplateNotice('Default Area is required.')
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
      await refreshReservations()
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
      if (editingReservation) {
        await updateReservation(editingReservation.id, payload)
      } else {
        await createReservation(payload)
      }

      await refreshReservations()
      setReservationNotice(editingReservation ? 'Reservation updated.' : 'Reservation created.')
      handleCloseReservationModal()
    } catch (error) {
      setReservationNotice(error.message || 'Unable to save reservation right now.')
    } finally {
      setIsSavingReservation(false)
    }
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
    ? buildDashboardGreeting(currentTimeGreeting, workspaceProfile.managerName)
    : activeView === 'settings'
      ? 'Workspace Settings'
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
    ? `${currentDateLabel} · ${operationalSnapshot.statusMessage}`
    : activeView === 'settings'
      ? 'Configure your workspace profile and operational defaults.'
    : activeView === 'reservations'
      ? 'Review service flow, seating, and guest arrivals.'
      : activeView === 'suppliers'
        ? 'Review supplier contacts, terms, and delivery cadence.'
      : activeView === 'stock'
        ? 'Monitor supply health, costs, and replenishment risk.'
        : 'Search, filter, and review the full team roster.'

  const topbarEyebrow = activeView === 'dashboard'
    ? 'Operations dashboard'
    : activeView === 'settings'
      ? 'Workspace settings'
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

  const handleOpenWorkspaceProfile = () => {
    setActiveView('settings')
    setSettingsSection('profile')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-avatar" aria-hidden="true">
            {brandDisplay.logoUrl ? (
              <img src={brandDisplay.logoUrl} alt="" className="brand-logo" />
            ) : (
              <div className="brand-mark">{brandDisplay.mark}</div>
            )}
          </div>
          <div className="brand-copy">
            <h1
              className="brand-business-name"
              title={brandDisplay.businessName || undefined}
            >
              {brandDisplay.businessNameLabel}
            </h1>
            <p className="brand-powered-by">
              <span className="brand-powered-mark" aria-hidden="true">O</span>
              <span>Powered by ONE</span>
            </p>
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
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-title-block">
            <p className="eyebrow">{topbarEyebrow}</p>
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
            <div className="date-pill">{currentDateLabel}</div>
            <button
              type="button"
              className={`profile-chip${profileChipDisplay.isConfigured ? '' : ' profile-chip-unconfigured'}`}
              onClick={handleOpenWorkspaceProfile}
            >
              <div className="profile-avatar">{profileChipDisplay.initials}</div>
              <div>
                <strong>{profileChipDisplay.name}</strong>
                <p>{profileChipDisplay.role}</p>
              </div>
            </button>
          </div>
        </header>

        {activeView === 'dashboard' || activeView === 'schedule' ? (
          <OperationalSnapshot snapshot={operationalSnapshot} isLoading={isDashboardScheduleLoading} />
        ) : null}

        {activeView === 'dashboard' ? (
          <DashboardView
            stats={dashboardStats}
            liveFloor={liveFloorState}
            timelineEvents={timelineEvents}
            isLoading={isDashboardScheduleLoading}
            isLiveFloorLoading={isLiveFloorLoading}
          />
        ) : null}

        {activeView === 'dashboard' ? (
          <div className="build-info-floating">
            <BuildInfoBadge compact />
          </div>
        ) : null}

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
            scheduleCapacities={scheduleCapacities}
            employees={scheduleEmployees}
            positions={positions}
            shiftTemplates={shiftTemplates}
            weeklyTemplates={weeklyTemplates}
            onOpenAddShift={handleOpenAddShift}
            onOpenEditShift={handleOpenEditShift}
            onDeleteShift={handleDeleteShift}
            onCreateGridShift={handleCreateGridShift}
            onUpdateGridShift={handleUpdateGridShift}
            onUpdateAssignmentTime={handleUpdateAssignmentTime}
            onMoveGridShift={handleMoveGridShift}
            onCopyGridShift={handleCopyGridShift}
            onRemoveGridShift={handleRemoveGridShift}
            onCopyShiftToNextDay={handleCopyShiftToNextDay}
            onCopyShiftToRestOfWeek={handleCopyShiftToRestOfWeek}
            onSaveCurrentWeekTemplate={handleSaveCurrentWeekTemplate}
            onLoadWeeklyTemplate={handleLoadWeeklyTemplate}
            onRenameWeeklyTemplate={handleRenameWeeklyTemplate}
            onDeleteWeeklyTemplate={handleDeleteWeeklyTemplate}
            onUpdateCellCapacity={handleUpdateCellCapacity}
            onApplyAreaToTemplate={handleApplyAreaToTemplate}
            onRenameShiftTemplate={handleRenameShiftTemplate}
            onEditShiftTemplate={handleEditShiftTemplate}
            onDuplicateShiftTemplate={handleDuplicateShiftTemplate}
            onDeleteShiftTemplate={handleDeleteShiftTemplate}
            onCopyHistoricalWeek={handleCopyHistoricalWeek}
            onCopyDay={handleCopyDay}
            onCopyWeek={handleCopyWeek}
            onClearDay={handleClearDay}
            onClearWeek={handleClearWeek}
            onClearGridCell={handleClearGridCell}
            onAutoFillWeekFromTemplate={handleAutoFillWeekFromTemplate}
            schedulePublication={schedulePublication}
            publishedShifts={publishedShifts}
            weekStartDate={scheduleWeekStart}
            onWeekStartDateChange={setScheduleWeekStart}
            onPublishWeekSchedule={handlePublishWeekSchedule}
            onUnpublishWeekSchedule={handleUnpublishWeekSchedule}
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
          <WorkspaceSettingsView
            activeSection={settingsSection}
            onSectionChange={setSettingsSection}
            workspaceProfileProps={{
              workspaceProfile: workspaceProfileDraft,
              noticeMessage: workspaceProfileNotice,
              isLoading: isWorkspaceProfileLoading,
              isSaving: isSavingWorkspaceProfile,
              onChange: setWorkspaceProfileDraft,
              onSubmit: handleWorkspaceProfileSubmit,
              onLogoFileChange: handleWorkspaceLogoFileChange,
              onClearLogo: handleClearWorkspaceLogo,
            }}
            positionsProps={{
              positions,
              isLoading: isPositionsLoading,
              noticeMessage: positionsNotice,
              form: positionForm,
              isSaving: isSavingPosition,
              editingPositionId,
              onFormChange: setPositionForm,
              onSubmit: handlePositionSubmit,
              onStartEdit: handleStartEditPosition,
              onCancelEdit: handleCancelEditPosition,
              onRequestDelete: handleRequestDeletePosition,
              onMovePosition: handleMovePosition,
              getUsageCount: getPositionUsageCount,
            }}
            renderBuildInfo={<BuildInfoBadge />}
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
                    <span>Primary Position (required)</span>
                    <input
                      list="employee-primary-position-options"
                      value={employeeForm.primaryPosition}
                      onChange={(event) => setEmployeeForm((current) => {
                        const nextPrimary = event.target.value
                        return {
                          ...current,
                          primaryPosition: nextPrimary,
                          additionalPositions: current.additionalPositions.filter((name) => name.toLowerCase() !== `${nextPrimary}`.trim().toLowerCase()),
                        }
                      })}
                      placeholder="Search and select primary position"
                      required
                    />
                    <datalist id="employee-primary-position-options">
                      {employeePositionOptions.map((position) => (
                        <option key={`primary-position-option-${position.name}`} value={position.name} />
                      ))}
                    </datalist>
                  </div>
                  <div className="form-field full-width">
                    <span>Additional Positions (optional)</span>
                    <div className="positions-chip-grid">
                      {employeePositionOptions
                        .filter((position) => position.name.toLowerCase() !== `${employeeForm.primaryPosition ?? ''}`.trim().toLowerCase())
                        .map((position) => {
                          const checked = employeeForm.additionalPositions.some((name) => name.toLowerCase() === position.name.toLowerCase())

                          return (
                            <button
                              key={`employee-position-chip-${position.name}`}
                              type="button"
                              className={`position-chip ${checked ? 'active' : ''}`}
                              onClick={() => {
                                setEmployeeForm((current) => {
                                  const alreadySelected = current.additionalPositions.some((name) => name.toLowerCase() === position.name.toLowerCase())
                                  const nextAdditional = alreadySelected
                                    ? current.additionalPositions.filter((name) => name.toLowerCase() !== position.name.toLowerCase())
                                    : [...current.additionalPositions, position.name]

                                  return {
                                    ...current,
                                    additionalPositions: nextAdditional,
                                  }
                                })
                              }}
                            >
                              <span className="position-chip-check">{checked ? '☑' : '☐'}</span>
                              <span>{position.name}</span>
                            </button>
                          )
                        })}
                    </div>
                  </div>
                  <div className="form-field full-width">
                    <span>+ Add Custom Position</span>
                    <div className="custom-position-row">
                      <input
                        value={employeeForm.customPositionName}
                        onChange={(event) => setEmployeeForm((current) => ({ ...current, customPositionName: event.target.value }))}
                        placeholder="e.g. Sommelier, VIP Host, Pizza Chef"
                      />
                      <button type="button" className="ghost-btn" onClick={handleAddCustomPositionToEmployee} disabled={isSavingEmployee}>+ Add Custom Position</button>
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
                      {...TIME_INPUT_PROPS}
                      value={formData.start_time}
                      onChange={(event) => setFormData((current) => ({
                        ...current,
                        shift_template: 'custom',
                        start_time: normalizeTimeValue(event.target.value),
                      }))}
                    />
                  </label>
                  <label className="form-field">
                    <span>End Time</span>
                    <input
                      {...TIME_INPUT_PROPS}
                      value={formData.end_time}
                      onChange={(event) => setFormData((current) => ({
                        ...current,
                        shift_template: 'custom',
                        end_time: normalizeTimeValue(event.target.value),
                      }))}
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
                        <p>{formatTimeRange24(template.startTime, template.endTime, ' - ')}</p>
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
                    <input {...TIME_INPUT_PROPS} value={templateForm.startTime} onChange={(event) => setTemplateForm((current) => ({ ...current, startTime: normalizeTimeValue(event.target.value) }))} required />
                  </label>
                  <label className="form-field">
                    <span>End Time</span>
                    <input {...TIME_INPUT_PROPS} value={templateForm.endTime} onChange={(event) => setTemplateForm((current) => ({ ...current, endTime: normalizeTimeValue(event.target.value) }))} required />
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
                    <input {...TIME_INPUT_PROPS} value={reservationForm.time} onChange={(event) => setReservationForm((current) => ({ ...current, time: normalizeTimeValue(event.target.value) }))} required />
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
