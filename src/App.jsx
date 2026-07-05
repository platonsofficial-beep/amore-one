import { Fragment, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { createEmployee, deleteEmployee, getEmployees, updateEmployee } from './services/staffService'
import { createShift, deleteShift, getShifts, updateShift } from './services/scheduleService'
import { createShiftTemplate, deleteShiftTemplate, getShiftTemplates, updateShiftTemplate } from './services/shiftTemplateService'
import { getScheduleCapacities, upsertScheduleCapacity, deleteScheduleCapacitiesForDates, copyScheduleCapacitiesForWeek, applyScheduleCapacitiesForWeek, applyMinimumCapacitiesFromShifts } from './services/scheduleCapacityService'
import { draftMatchesPublishedSnapshot } from './services/publishedShiftService'
import { getWeekSchedulePublicationState, publishWeekSchedule, unpublishWeekSchedule } from './services/schedulePublicationService'
import { createPosition, deletePosition, getPositions, reorderPositions, updatePosition } from './services/positionsService'
import { createWeeklyScheduleTemplate, deleteWeeklyScheduleTemplate, getWeeklyScheduleTemplates, getWeeklyTemplateShifts, renameWeeklyScheduleTemplate } from './services/weeklyScheduleTemplateService'
import {
  createReservation,
  buildReservationUpdatePayload,
  createSeatingAssignmentPayload,
  deleteReservation,
  getReservations,
  updateReservation,
} from './services/reservationService'
import { SeatingConfirmPanel } from './components/seating/SeatingConfirmPanel'
import TasksView from './components/tasks/TasksView'
import { HostReservationEditPanel, createHostReservationEditForm } from './components/reservations/HostReservationEditPanel'
import { HostReservationEditErrorBoundary } from './components/reservations/HostReservationEditErrorBoundary'
import { HostReservationList } from './components/reservations/HostReservationList'
import { HostManagerSummaryBar } from './components/reservations/HostManagerSummaryBar'
import {
  buildHostManagerSummary,
  getSelectedDateReservations,
} from './components/reservations/hostReservationListUtils'
import { ReservationTableSelector } from './components/reservations/ReservationTableSelector'
import { ReservationTimeSelect } from './components/reservations/ReservationTimeSelect'
import { getHostUnitById, toSeatingUnitFromLayoutUnit } from './lib/hostFloorPlanLayout'
import { PublishedFloorPlanProvider, usePublishedFloorPlan } from './lib/PublishedFloorPlanContext'
import { loadPublishedHostLayout } from './lib/builderToHostLayout'
import {
  computeSeatingAssignmentTotals,
  enrichReservationWithSeatingAssignment,
  formatSeatingAssignmentSummary,
  formatHostListTableLabel,
  formatHostFloorReservationTooltipMeta,
  getReservationSeatingAssignment,
  normalizeUnitKey,
  reservationUsesSeatingUnit,
  seatingUnitMatchesFloorUnit,
} from './lib/seatingAssignment'
import { resolveAreaIdForReservation } from './lib/reservationTableOptions'
import {
  buildReservationLinkGroups,
  buildReservationLinkTableMeta,
  computeHostFloorFit,
  HOST_FLOOR_MAX_ZOOM,
  HOST_FLOOR_MIN_ZOOM,
} from './lib/hostFloorPlanViewport'
import { getFloorLayoutSpaceStyle, getPublishedTableLayoutStyle } from './lib/publishedTableLayout'
import {
  buildFloorTableScheduleEntries,
  getFloorTableScheduleLabel,
} from './lib/floorTableSchedule'
import {
  isFloorTablePhysicallyOccupied,
  resolveFloorTableOperationalState,
} from './lib/floorTableOperationalState'
import {
  buildFloorTableReservationMap,
  debugFloorAssignmentSnapshot,
  getReservationDateKey,
  getReservationsForFloorTable,
  reservationHasAssignedTables,
} from './lib/floorAssignmentMapping'
import {
  getFloorTableStatusPriority,
  getFloorTableVisualStatus,
  getHostListStatusLabel,
  getHostListGroupId,
  getHostStatusGroupId,
  getReservationDisplayStatus,
  getReservationDisplayStatusTone,
  isReservationInHouse,
  isReservationLate,
  isReservationWaiting,
  isReservationInHouseStatus,
  isTerminalReservationStatus,
  isUpcomingReservationStatus,
  normalizeReservationStatus,
  reservationOccupiesFloorTables,
} from './lib/reservationHostStatus'
import { EmbeddedFloorPlanEditor } from './components/floor/EmbeddedFloorPlanEditor'
import { FloorPlanReservationLinks } from './components/floor/FloorPlanReservationLinks'
import { FloorTableReservationTooltip } from './components/floor/FloorTableReservationTooltip'
import { FloorTableScheduleCard } from './components/floor/FloorTableScheduleCard'
import { createInventoryItem, deleteInventoryItem, getInventoryItems, updateInventoryItem } from './services/inventoryService'
import { createSupplier, deleteSupplier, getSuppliers, updateSupplier } from './services/supplierService'
import {
  completeTask,
  createTask,
  deleteTask,
  getTasks,
  reopenTask,
  updateTask,
} from './services/taskService'
import {
  createTaskTemplate,
  deleteTaskTemplate,
  generateTasksFromTemplates,
  getTaskTemplates,
  updateTaskTemplate,
} from './services/taskTemplateService'
import {
  getChecklistItemsForTasks,
  toggleChecklistItem,
} from './services/taskChecklistService'
import {
  getTemplateChecklistItems,
  replaceTemplateChecklist,
} from './services/taskTemplateChecklistService'
import {
  addWeeks,
  formatWeekRange,
  getCurrentWeekStartDate,
  getWeekDateKeys,
  getWeekDays,
  getWeekStartDate,
  isCurrentWeek,
  parseLocalDate,
  formatScheduleDayHeader,
  formatLocalDateKey,
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
  normalizeReservationTimeValue,
  normalizeReservationDateKey,
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
  parseTimeToMinutes,
} from './lib/shiftHoursUtils'
import { buildEmployeeWeekScheduleView } from './lib/employeeWeekScheduleView'
import {
  getRestOfWeekDateKeys,
  getShiftSchedulingConflictType,
  shiftHasSchedulingConflict,
} from './lib/scheduleConflictUtils'
import {
  buildWeeklyTemplateCapacitySnapshot,
  deleteWeeklyTemplateCapacitySnapshot,
  getWeeklyTemplateCapacitySnapshot,
  mapWeeklyTemplateCapacitySnapshotToWeek,
  saveWeeklyTemplateCapacitySnapshot,
} from './lib/weeklyTemplateCapacitySnapshots'
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
  buildBusinessHealthSummary,
  buildDashboardOperationalSummary,
  buildExecutiveLabourSummary,
  buildReservationsFooter,
  buildDashboardIssuesSummary,
  buildLiveFloorState,
  buildTodayCommandTimeline,
  buildTodayReservationsSummary,
  getTodayReservations,
  getLowStockAlertItems,
  isModuleUnavailableMessage,
  resolveLiveDraftShiftsForWeek,
  resolveLiveDraftCapacitiesForWeek,
} from './lib/dashboardUtils'
import {
  buildHostServiceHourPressureSlots,
  reservationMatchesServiceHourBucket,
} from './lib/hostReservationServiceHour'
import {
  formatCurrentDateLabel,
  getCurrentDateKey,
  getLocalNow,
  getTimeGreeting,
} from './lib/currentDateUtils'
import { calculateTaskOverview, matchesCustomDepartmentName, resolveCurrentEmployeeId } from './lib/taskUtils'
import { UNASSIGNED_CUSTOM_DEPARTMENT_NAME } from './lib/taskDepartments'

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

const dashboardQuickActions = [
  { id: 'add-reservation', label: 'Add Reservation', icon: '➕', available: true, tier: 'primary' },
  { id: 'add-staff', label: 'Add Staff', icon: '👤', available: true, tier: 'primary' },
  { id: 'add-task', label: 'Add Task', icon: '✓', available: true, tier: 'secondary' },
  { id: 'create-order', label: 'Create Order', icon: '📦', available: false, hint: 'Coming soon', tier: 'secondary' },
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

function getScheduleAreaIcon(area) {
  const normalized = `${area ?? ''}`.trim().toLowerCase()
  if (normalized.includes('coffee') || normalized.includes('morning')) return '☕'
  if (normalized.includes('bar')) return '🍸'
  if (normalized.includes('kitchen') || normalized.includes('chef') || normalized.includes('cook')) return '👨‍🍳'
  if (normalized.includes('runner')) return '🏃'
  if (normalized.includes('service') || normalized.includes('waiter')) return '🍽'
  if (normalized.includes('host') || normalized.includes('reception')) return '🛎'
  if (normalized.includes('terrace') || normalized.includes('garden')) return '🌿'
  if (normalized.includes('vip') || normalized.includes('lounge')) return '✨'
  if (normalized.includes('management') || normalized.includes('manager')) return '👔'
  return '📋'
}

function formatDayCoverageBadgeIcon(status) {
  if (status === 'covered') return '🟢'
  if (status === 'conflict') return '⛔'
  if (status === 'understaffed') return '⚠️'
  if (status === 'overstaffed') return '🟡'
  return '⚪'
}

function formatDayCoverageBadgeLabel(status, statusLabel) {
  if (status === 'covered') return 'Fully Covered'
  if (status === 'conflict') return 'Conflict'
  if (status === 'understaffed') return 'Understaffed'
  if (status === 'overstaffed') return 'Overstaffed'
  return statusLabel
}

function formatTemplateRequiredCount(minRequired, maxRequired) {
  if (minRequired === null) return null
  if (minRequired === maxRequired) {
    return `${minRequired} Employee${minRequired === 1 ? '' : 's'}`
  }
  return `${minRequired}–${maxRequired} Employees`
}

function getEmployeeWorkloadStatus(scheduledHours, weeklyTarget) {
  const tracker = getEmployeeHoursTrackerState(scheduledHours, weeklyTarget)

  if (tracker.status === 'over') {
    return { label: 'Overtime', tone: 'overtime', icon: '🔴' }
  }

  if (tracker.status === 'complete' || (tracker.hasTarget && tracker.barWidth >= 85)) {
    return { label: 'Near Limit', tone: 'near-limit', icon: '🟡' }
  }

  return { label: 'Available', tone: 'available', icon: '🟢' }
}

function doesShiftMatchScheduleVisualFilter(shift, employeeName, { focusedEmployeeId, searchNeedle }) {
  const matchesFocus = !focusedEmployeeId || String(shift.employeeId ?? '') === focusedEmployeeId
  const matchesSearch = !searchNeedle || `${employeeName}`.toLowerCase().includes(searchNeedle)
  return matchesFocus && matchesSearch
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
  const parts = `${name || ''}`.trim().split(/\s+/).filter(Boolean)

  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
  }

  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return (parts[0]?.[0] ?? 'G').toUpperCase()
}

function formatDashboardHeroDate(date, timeZone = '') {
  const resolvedTimeZone = `${timeZone ?? ''}`.trim() || undefined
  const options = resolvedTimeZone ? { timeZone: resolvedTimeZone } : {}

  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', ...options }).format(date)
  const monthDay = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', ...options }).format(date)

  return `${weekday} • ${monthDay}`
}

function formatTimelineEventDisplay(event) {
  if (event.type === 'reservation') {
    return {
      title: `${event.title.replace(/ reservation$/i, '').trim()}`.toUpperCase() || 'RESERVATION',
      department: event.note || 'Reservation',
    }
  }

  const title = `${event.title.replace(/ starts$/i, '').trim()}`.toUpperCase() || 'SHIFT'
  const department = `${event.note ?? ''}`.trim() || 'General'

  return { title, department }
}

const TIMELINE_PREVIEW_LIMIT = 5

function CommandTimeline({ events, isLoading }) {
  const totalEvents = events.length
  const isCollapsible = totalEvents > TIMELINE_PREVIEW_LIMIT
  const [isExpanded, setIsExpanded] = useState(() => totalEvents <= TIMELINE_PREVIEW_LIMIT)
  const contentRef = useRef(null)
  const [contentHeight, setContentHeight] = useState(null)

  useEffect(() => {
    setIsExpanded(totalEvents <= TIMELINE_PREVIEW_LIMIT)
  }, [totalEvents])

  const visibleEvents = isCollapsible && !isExpanded
    ? events.slice(0, TIMELINE_PREVIEW_LIMIT)
    : events
  const visibleCount = visibleEvents.length

  const measureHeight = useCallback(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight)
    }
  }, [])

  useLayoutEffect(() => {
    measureHeight()
  }, [events, isExpanded, measureHeight])

  useEffect(() => {
    if (!contentRef.current || typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const observer = new ResizeObserver(() => {
      measureHeight()
    })
    observer.observe(contentRef.current)
    return () => observer.disconnect()
  }, [measureHeight, visibleCount])

  if (isLoading) {
    return (
      <>
        <header className="command-card-header">
          <p className="eyebrow">Today&apos;s Timeline</p>
          <h3>What happens next?</h3>
        </header>
        <p className="command-empty-state">Loading timeline…</p>
      </>
    )
  }

  if (totalEvents === 0) {
    return (
      <>
        <header className="command-card-header">
          <p className="eyebrow">Today&apos;s Timeline</p>
          <h3>What happens next?</h3>
        </header>
        <p className="command-empty-state">No timeline events yet.</p>
      </>
    )
  }

  return (
    <>
      <header className="command-card-header command-timeline-header">
        <p className="eyebrow">Today&apos;s Timeline</p>
        <div className="command-timeline-header-row">
          <h3>What happens next?</h3>
          {isCollapsible ? (
            <div className="command-timeline-header-meta">
              <span className="command-timeline-counter">
                Showing {visibleCount} of {totalEvents} events
              </span>
              <button
                type="button"
                className="command-timeline-toggle"
                onClick={() => setIsExpanded((prev) => !prev)}
                aria-expanded={isExpanded}
              >
                <span
                  className={`command-timeline-chevron${isExpanded ? ' is-expanded' : ''}`}
                  aria-hidden="true"
                >
                  ▼
                </span>
                <span>{isExpanded ? 'Collapse' : 'Show all'}</span>
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <div
        className={`command-timeline-viewport${isCollapsible ? ' is-animated' : ''}`}
        style={
          isCollapsible && contentHeight != null
            ? { maxHeight: `${contentHeight}px` }
            : undefined
        }
      >
        <div ref={contentRef} className="command-timeline-content">
          <ul className="command-timeline-list">
            {visibleEvents.map((event) => {
              const display = formatTimelineEventDisplay(event)
              return (
                <li key={event.key} className={`command-timeline-item type-${event.type}`}>
                  <span className="command-timeline-time">{event.timeLabel}</span>
                  <span className="command-timeline-node" aria-hidden="true" />
                  <div className="command-timeline-copy">
                    <strong className="command-timeline-title">{display.title}</strong>
                    {display.department ? (
                      <p className="command-timeline-department">{display.department}</p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </>
  )
}

function CommandStaffList({ members, statusLabel }) {
  if (!Array.isArray(members) || members.length === 0) return null

  return (
    <ul className="command-staff-list">
      {members.map((member, index) => (
        <li
          key={member.shiftId}
          className={`command-staff-item${index < members.length - 1 ? ' has-divider' : ''}`}
        >
          <span className="command-staff-avatar">{getInitials(member.name || 'Staff')}</span>
          <div className="command-staff-copy">
            <strong>{member.name}</strong>
            <div className="command-staff-meta">
              {member.position ? (
                <span className="command-staff-role">{member.position}</span>
              ) : (
                <span className="command-staff-role">{statusLabel}</span>
              )}
              {member.department ? (
                <span className="command-staff-department">{member.department}</span>
              ) : null}
            </div>
          </div>
          <span className="command-staff-time command-staff-shift-badge">
            {member.startTimeLabel} – {member.endTimeLabel}
          </span>
        </li>
      ))}
    </ul>
  )
}

function CommandCenterView({
  snapshot,
  liveFloor,
  reservationsSummary,
  reservationsConnected,
  stockAlerts,
  inventoryConnected,
  tasksOverview,
  tasksConnected,
  isTasksLoading,
  issuesSummary,
  businessHealth,
  executiveLabour,
  reservationsFooter,
  timelineEvents,
  isScheduleLoading,
  isLiveFloorLoading,
  onQuickAction,
  onViewStock,
  onViewSchedule,
  onViewTasks,
}) {
  return (
    <div className="command-center command-workspace" aria-label="Operations command center">
      <section className="command-kpi-strip" aria-label="Today overview">
        {isScheduleLoading ? (
          <p className="command-empty-state">Loading today&apos;s overview…</p>
        ) : (
          <div className="command-hero-metrics command-kpi-grid" aria-label="Today's schedule metrics">
            <article className="command-hero-metric">
              <div className="command-kpi-icon-slot" aria-hidden="true">
                <span className="command-kpi-icon">👥</span>
              </div>
              <p className="command-hero-metric-value">{snapshot.scheduledStaff}</p>
              <p className="command-hero-metric-label">Scheduled Today</p>
              <p className="command-hero-metric-hint">Staff assigned</p>
            </article>
            <article className="command-hero-metric command-hero-metric-executive">
              <div className="command-kpi-icon-slot" aria-hidden="true">
                <span className="command-kpi-icon">🕒</span>
              </div>
              <p className="command-hero-metric-value">{executiveLabour.hoursLabel}h</p>
              <p className="command-hero-metric-label">Today&apos;s Coverage</p>
              <div className="command-hero-metric-cost" aria-label="Today's labour cost">
                <p className="command-hero-metric-cost-label">Labour Cost</p>
                {executiveLabour.costConnected ? (
                  <p className="command-hero-metric-cost-value">{executiveLabour.costDisplay}</p>
                ) : (
                  <p className="command-hero-metric-cost-value command-hero-metric-cost-value-empty">Not Connected</p>
                )}
              </div>
            </article>
            <article className={`command-hero-metric ${snapshot.issues > 0 ? 'has-issues' : ''}`}>
              <div className="command-kpi-icon-slot" aria-hidden="true">
                <span className="command-kpi-icon">⚠</span>
              </div>
              <p className="command-hero-metric-value">{snapshot.issues}</p>
              <p className="command-hero-metric-label">Needs Attention</p>
              <p className="command-hero-metric-hint">
                {snapshot.issues > 0 ? 'Review schedule' : 'All clear'}
              </p>
            </article>
            <article className={`command-hero-metric command-hero-metric-health health-tone-${businessHealth.tone}`} aria-label="Business health">
              <div className="command-kpi-icon-slot" aria-hidden="true">
                <span className={`command-health-icon tone-${businessHealth.tone}`}>
                  {businessHealth.icon}
                </span>
              </div>
              <p className="command-hero-metric-label command-hero-metric-label-health">Business Health</p>
              <p className="command-hero-metric-value command-hero-metric-value-text">{businessHealth.label}</p>
              <p className="command-hero-metric-hint">{businessHealth.message}</p>
              <div className="command-health-score-slot" aria-hidden="true" />
            </article>
          </div>
        )}
      </section>

      <div className="command-operations-grid">
        <div className="command-column command-column-primary">
          <section className="command-card command-card-primary command-card-staff" aria-label="Staff on shift">
            <header className="command-card-header">
              <p className="eyebrow">Staff on Shift</p>
              <h3>Who is working now?</h3>
            </header>
            {isLiveFloorLoading ? (
              <p className="command-empty-state">Loading live floor…</p>
            ) : liveFloor.state === 'unpublished' ? (
              <div className="command-status-block unpublished">
                <p className="command-state-label">No published schedule</p>
                <p className="command-status-message">{liveFloor.message}</p>
              </div>
            ) : liveFloor.state === 'idle' ? (
              <div className="command-staff-idle">
                <p className="command-staff-empty-label">No one is currently on shift.</p>
                {liveFloor.nextShiftStartLabel ? (
                  <p className="command-state-label">
                    Next shift starts at {liveFloor.nextShiftStartLabel}
                  </p>
                ) : null}
                {liveFloor.nextShifts?.length > 0 ? (
                  <CommandStaffList members={liveFloor.nextShifts} statusLabel="Up next" />
                ) : !liveFloor.nextShiftStartLabel ? (
                  <p className="command-status-message">{liveFloor.message}</p>
                ) : null}
              </div>
            ) : (
              <>
                <p className="command-state-label live">On shift now</p>
                <CommandStaffList members={liveFloor.onShift} statusLabel="On shift now" />
              </>
            )}
          </section>

          <section className="command-card command-card-primary command-card-timeline" aria-label="Today's timeline">
            <CommandTimeline events={timelineEvents} isLoading={isScheduleLoading} />
          </section>

          <section className="command-card command-card-widget command-card-tasks" aria-label="Tasks">
            <header className="command-card-header command-card-header-minimal">
              <p className="eyebrow">Today Tasks</p>
              {tasksConnected ? (
                <button type="button" className="command-card-link command-card-link-inline" onClick={onViewTasks}>
                  View Tasks →
                </button>
              ) : null}
            </header>
            {!tasksConnected ? (
              <p className="command-empty-state command-empty-state-tight">Not connected yet</p>
            ) : isTasksLoading ? (
              <p className="command-empty-state command-empty-state-tight">Loading tasks…</p>
            ) : tasksOverview.showEmptyToday ? (
              <p className="command-empty-state command-empty-state-tight">No active tasks today</p>
            ) : (
              <>
                <div className="command-task-metrics">
                  <article className="command-task-metric">
                    <p className="command-task-metric-value">{tasksOverview.active}</p>
                    <p className="command-task-metric-label">Active</p>
                  </article>
                  <article className={`command-task-metric${tasksOverview.overdue > 0 ? ' has-alert' : ''}`}>
                    <p className="command-task-metric-value">{tasksOverview.overdue}</p>
                    <p className="command-task-metric-label">Overdue</p>
                  </article>
                  <article className="command-task-metric">
                    <p className="command-task-metric-value">{tasksOverview.completedToday}</p>
                    <p className="command-task-metric-label">Completed today</p>
                  </article>
                  <article className="command-task-metric">
                    <p className="command-task-metric-value">{tasksOverview.completionPercent}%</p>
                    <p className="command-task-metric-label">Complete</p>
                  </article>
                </div>
                {tasksOverview.statusMessage ? (
                  <footer className="command-task-footer">
                    <p className={`command-task-footer-message${tasksOverview.overdue > 0 ? ' is-alert' : ' is-clear'}`}>
                      {tasksOverview.statusMessage}
                    </p>
                  </footer>
                ) : null}
              </>
            )}
          </section>
        </div>

        <div className="command-column command-column-secondary">
          <section className="command-card command-card-widget command-card-reservations" aria-label="Reservations summary">
            <header className="command-card-header command-card-header-minimal">
              <p className="eyebrow">Reservations</p>
            </header>
            {!reservationsConnected ? (
              <p className="command-empty-state command-empty-state-tight">Not connected yet</p>
            ) : (
              <>
                <div className="command-reservation-metrics">
                  <article className="command-reservation-metric">
                    <p className="command-reservation-metric-value">{reservationsSummary.bookings}</p>
                    <p className="command-reservation-metric-label">Bookings</p>
                  </article>
                  <article className="command-reservation-metric">
                    <p className="command-reservation-metric-value">{reservationsSummary.tables}</p>
                    <p className="command-reservation-metric-label">Tables</p>
                  </article>
                  <article className="command-reservation-metric">
                    <p className="command-reservation-metric-value">{reservationsSummary.guests}</p>
                    <p className="command-reservation-metric-label">Guests</p>
                  </article>
                </div>
                <footer className="command-reservation-footer">
                  {reservationsFooter.type === 'next' ? (
                    <>
                      <p className="command-reservation-footer-label">{reservationsFooter.label}</p>
                      <p className="command-reservation-footer-value">{reservationsFooter.time}</p>
                    </>
                  ) : (
                    <p className="command-reservation-footer-empty">{reservationsFooter.message}</p>
                  )}
                </footer>
              </>
            )}
          </section>

          <div className="command-ops-widgets">
            <section className="command-card command-card-widget command-card-stock" aria-label="Stock alerts">
              <header className="command-card-header command-card-header-inline">
                <p className="eyebrow">Stock Alerts</p>
                {inventoryConnected && stockAlerts.length > 0 ? (
                  <button type="button" className="command-card-link command-card-link-inline" onClick={onViewStock}>
                    View Stock →
                  </button>
                ) : null}
              </header>
              {!inventoryConnected ? (
                <p className="command-empty-state command-empty-state-tight">Not connected yet</p>
              ) : stockAlerts.length === 0 ? (
                <p className="command-empty-state command-empty-state-healthy command-empty-state-tight">Stock levels look healthy.</p>
              ) : (
                <ul className="command-stock-list">
                  {stockAlerts.map((item) => (
                    <li key={item.id} className={`command-stock-item severity-${item.severity}`}>
                      <span className={`command-alert-badge ${item.severity}`}>
                        {item.severity === 'critical' ? 'Critical' : 'Low'}
                      </span>
                      <div className="command-stock-copy">
                        <strong>{item.name}</strong>
                        {item.quantity !== undefined && item.quantity !== null ? (
                          <span className="command-stock-qty">
                            {item.quantity}{item.unit ? ` ${item.unit}` : ''} remaining
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="command-card command-card-widget command-quick-actions" aria-label="Quick actions">
              <header className="command-card-header command-card-header-minimal">
                <p className="eyebrow">Quick Actions</p>
              </header>
              <div className="command-quick-actions-grid">
                {dashboardQuickActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className={`command-quick-action command-quick-action-${action.tier}${action.available ? '' : ' unavailable'}`}
                    onClick={() => action.available && onQuickAction(action.id)}
                    disabled={!action.available}
                    title={action.available ? action.label : action.hint}
                  >
                    <span className="command-quick-action-icon" aria-hidden="true">{action.icon}</span>
                    <span className="command-quick-action-copy">
                      <strong>{action.label}</strong>
                      {!action.available ? <small>Coming Soon</small> : null}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <section className={`command-card command-card-widget command-issues-card severity-${issuesSummary.severity}`} aria-label="Issues and needs attention">
            {isScheduleLoading ? (
              <p className="command-empty-state command-empty-state-tight">Checking today&apos;s schedule…</p>
            ) : (
              <div className={`command-issue-panel severity-${issuesSummary.severity}`}>
                <span className={`command-severity-badge ${issuesSummary.severity}`}>
                  {issuesSummary.severity === 'info' ? 'Clear' : issuesSummary.severity === 'critical' ? 'Critical' : 'Warning'}
                </span>
                <p className="command-issues-title">
                  {issuesSummary.count > 0 ? issuesSummary.count : '0'}
                </p>
                <p className="command-issues-message">
                  {issuesSummary.count > 0 ? issuesSummary.message || issuesSummary.title : 'All systems clear'}
                </p>
                {issuesSummary.count > 0 ? (
                  <button type="button" className="command-card-link command-card-link-action" onClick={onViewSchedule}>
                    View →
                  </button>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
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

function formatScheduleHeaderWeekRange(days) {
  if (!Array.isArray(days) || days.length === 0) return 'No week selected'

  const formatDay = (dateKey) => {
    const date = parseLocalDate(dateKey)
    return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  }

  return `${formatDay(days[0].key)} – ${formatDay(days[days.length - 1].key)}`
}

function ScheduleCollapsibleSection({ eyebrow, title, meta, children, className = '' }) {
  return (
    <details className={`schedule-collapsible panel staff-panel ${className}`.trim()}>
      <summary className="schedule-collapsible-summary">
        <div className="schedule-collapsible-summary-copy">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h3>{title}</h3>
          {meta ? <p className="schedule-collapsible-meta">{meta}</p> : null}
        </div>
        <span className="schedule-collapsible-chevron" aria-hidden="true">▾</span>
      </summary>
      <div className="schedule-collapsible-body">
        {children}
      </div>
    </details>
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
    position: 'All',
    status: 'All',
    search: '',
    publishedOnly: false,
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
  const [isScheduleMoreMenuOpen, setIsScheduleMoreMenuOpen] = useState(false)
  const [browseWeekShifts, setBrowseWeekShifts] = useState([])
  const [isBrowseWeekLoading, setIsBrowseWeekLoading] = useState(false)
  const [dragPayload, setDragPayload] = useState(null)
  const [dropTargetKey, setDropTargetKey] = useState('')
  const [pendingShiftDrop, setPendingShiftDrop] = useState(null)
  const [focusedEmployeeId, setFocusedEmployeeId] = useState(null)
  const dragSessionRef = useRef(null)
  const employeeChipClickGuardRef = useRef(false)

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
    setCapacityDraftMap({})
    setCapacityPickerKey('')
    setSelectedDay(null)
    setDayActionMenuKey(null)
    setCellActionMenuKey('')
    setFocusedEmployeeId(null)
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

  const assignmentsByCell = useMemo(() => {
    const map = {}

    visibleWeekShifts.forEach((shift) => {
      const keys = getShiftCellKeys(shift)
      keys.forEach((cellKey) => {
        if (!cellKey) return
        if (!Array.isArray(map[cellKey])) {
          map[cellKey] = []
        }
        map[cellKey].push(shift)
      })
    })

    return map
  }, [visibleWeekShifts])

  const capacityLookup = useMemo(() => {
    const lookup = {}
    ;(scheduleCapacities ?? []).forEach((item) => {
      const key = buildCapacityKey(item.shiftTemplateId, item.shiftDate)
      const parsed = Number(item.requiredCount)
      if (Number.isFinite(parsed) && parsed >= 0) {
        lookup[key] = parsed
      }
    })
    return lookup
  }, [scheduleCapacities])

  const getRequiredCountForCell = (template, dayKey) => {
    const key = buildCapacityKey(resolveTemplateCapacityId(template), dayKey)
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
        weekCapacities: scheduleCapacities,
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
    const publishedShiftIds = new Set((publishedShifts ?? []).map((shift) => String(shift.id)))

    return selectedDayShifts.filter((shift) => {
      const employeeName = `${shift.employees?.full_name || shift.employeeName || shift.employeeRecord?.name || ''}`.toLowerCase()
      const shiftPosition = `${shift.role || shift.employeeRecord?.position || ''}`.trim()
      const matchesSearch = !searchTerm || employeeName.includes(searchTerm)
      const matchesDepartment = filters.department === 'All' || getShiftDepartment(shift) === filters.department
      const matchesShift = filters.shift === 'All' || getShiftPeriod(shift) === filters.shift
      const matchesPosition = filters.position === 'All' || shiftPosition === filters.position
      const matchesStatus = filters.status === 'All' || `${shift.status || 'Scheduled'}`.toLowerCase() === filters.status.toLowerCase()
      const matchesPublished = !filters.publishedOnly || publishedShiftIds.has(String(shift.id))
      return matchesSearch && matchesDepartment && matchesShift && matchesPosition && matchesStatus && matchesPublished
    })
  }, [filters.department, filters.position, filters.publishedOnly, filters.search, filters.shift, filters.status, publishedShifts, selectedDayShifts])

  const positionFilterOptions = useMemo(() => {
    const names = new Set()
    ;(positions ?? []).forEach((position) => {
      const name = `${position?.name ?? ''}`.trim()
      if (name) names.add(name)
    })
    visibleWeekShifts.forEach((shift) => {
      const role = `${shift.role ?? ''}`.trim()
      if (role) names.add(role)
    })
    return ['All', ...Array.from(names).sort((left, right) => left.localeCompare(right))]
  }, [positions, visibleWeekShifts])

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

    return {
      employeesScheduled: workingEmployees.size,
      totalShifts: weekShifts.length,
      totalHours: totalHours.toFixed(1),
      employeesOff,
    }
  }, [employees, shifts, weekDays])

  const weekLabourSummary = useMemo(() => buildExecutiveLabourSummary({
    snapshot: { labourHoursLabel: weekSummary.totalHours },
    todayShifts: visibleWeekShifts,
    employees,
  }), [employees, visibleWeekShifts, weekSummary.totalHours])

  const schedulePublicationLabel = isWeekPublished
    ? (hasUnpublishedChanges ? 'Draft changes' : 'Published')
    : 'Draft'

  const employeeWeekScheduleView = useMemo(
    () => buildEmployeeWeekScheduleView({
      employees,
      weekDays,
      weekShifts: visibleWeekShifts,
    }),
    [employees, weekDays, visibleWeekShifts],
  )

  const blendGridRows = useMemo(() => {
    const shiftsByDayKey = {}

    visibleWeekShifts.forEach((shift) => {
      const dayKey = normalizeCellDate(shift.date)
      if (!dayKey) return
      if (!shiftsByDayKey[dayKey]) {
        shiftsByDayKey[dayKey] = []
      }
      shiftsByDayKey[dayKey].push(shift)
    })

    return scheduleGridTemplates.map((template) => {
      const dayCells = weekDays.map((day) => {
        const requiredCount = getRequiredCountForCell(template, day.key)
        const cellKeys = getTemplateCellKeys(template, day.key)
        const seen = new Set()
        const dayShifts = []
        const dayShiftsOnDate = shiftsByDayKey[day.key] ?? []

        cellKeys.forEach((cellKey) => {
          ;(assignmentsByCell[cellKey] ?? []).forEach((shift) => {
            if (seen.has(String(shift.id))) return
            seen.add(String(shift.id))
            dayShifts.push({
              ...shift,
              employeeRecord: employees.find((employee) => employee.id === shift.employeeId) ?? null,
            })
          })
        })

        const hasRealConflict = dayShifts.some((shift) => (
          shiftHasSchedulingConflict(shift, {
            employees,
            dayShifts: dayShiftsOnDate,
          })
        ))

        return {
          day,
          shifts: dayShifts,
          assignedCount: dayShifts.length,
          requiredCount,
          hasRealConflict,
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
  }, [employees, scheduleGridTemplates, weekDays, capacityLookup, capacityDraftMap, assignmentsByCell, visibleWeekShifts])

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
      let hasRealConflict = false
      const dayShiftsOnDate = visibleWeekShifts.filter((shift) => normalizeCellDate(shift.date) === dayKey)

      dayShiftsOnDate.forEach((shift) => {
        if (getShiftSchedulingConflictType(shift, {
          employees,
          dayShifts: dayShiftsOnDate,
        })) {
          hasRealConflict = true
        }
      })

      blendGridRows.forEach((row) => {
        const cell = row.dayCells.find((entry) => entry.day.key === dayKey)
        if (!cell) return
        if (cell.assignedCount > cell.requiredCount) hasOverstaffed = true
        if (cell.assignedCount < cell.requiredCount) hasUnderstaffed = true
      })

      let totalRequired = 0
      let totalAssignedSlots = 0
      blendGridRows.forEach((row) => {
        const cell = row.dayCells.find((entry) => entry.day.key === dayKey)
        if (!cell) return
        totalRequired += cell.requiredCount
        totalAssignedSlots += cell.assignedCount
      })

      let coveragePercent = null
      if (totalRequired > 0) {
        coveragePercent = Math.min(100, Math.round((totalAssignedSlots / totalRequired) * 100))
      } else if (totalAssignedStaff > 0) {
        coveragePercent = 100
      }

      let status = 'empty'
      let statusLabel = 'Empty'
      let statusIcon = '⚪'

      if (totalAssignedStaff === 0) {
        status = 'empty'
        statusLabel = 'Empty'
        statusIcon = '⚪'
      } else if (hasRealConflict) {
        status = 'conflict'
        statusLabel = 'Conflict'
        statusIcon = '⛔'
      } else if (hasUnderstaffed) {
        status = 'understaffed'
        statusLabel = 'Understaffed'
        statusIcon = '⚠️'
      } else if (hasOverstaffed) {
        status = 'overstaffed'
        statusLabel = 'Overstaffed'
        statusIcon = '🟡'
      } else {
        status = 'covered'
        statusLabel = 'Fully Covered'
      }

      summaries[dayKey] = {
        totalAssignedStaff,
        totalScheduledHours,
        hoursLabel: formatHoursLabel(totalScheduledHours),
        coveragePercent,
        status,
        statusLabel,
        statusIcon,
      }
    })

    return summaries
  }, [blendGridRows, employees, visibleWeekShifts, weekDays])

  const scheduleWarningCount = useMemo(() => (
    Object.values(dayHeaderSummariesByKey).filter(
      (summary) => summary.status === 'understaffed'
        || summary.status === 'overstaffed'
        || summary.status === 'conflict',
    ).length
  ), [dayHeaderSummariesByKey])

  const todayDateKey = formatLocalDateKey(new Date())

  const weekCompletion = useMemo(() => {
    let totalRequired = 0
    let totalAssigned = 0

    blendGridRows.forEach((row) => {
      row.dayCells.forEach((cell) => {
        totalRequired += cell.requiredCount
        totalAssigned += cell.assignedCount
      })
    })

    const percent = totalRequired > 0
      ? Math.round((totalAssigned / totalRequired) * 100)
      : (totalAssigned > 0 ? 100 : 0)

    return {
      totalRequired,
      totalAssigned,
      percent,
      barWidth: totalRequired > 0 ? Math.min(100, Math.round((totalAssigned / totalRequired) * 100)) : 0,
    }
  }, [blendGridRows])

  const scheduleVisualSearchNeedle = filters.search.trim().toLowerCase()
  const isScheduleVisualFilterActive = Boolean(focusedEmployeeId) || Boolean(scheduleVisualSearchNeedle)

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
          if (message.includes('cancelled')) {
            skippedMessages.push(`Skipped ${name}; overlap not confirmed.`)
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

    employeeChipClickGuardRef.current = true
    const payload = { type: 'employee', employeeId: employee.id }
    dragSessionRef.current = payload
    setDragPayload(payload)
    event.dataTransfer.setData('application/json', JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'copy'
  }

  const handleEmployeeChipFocusToggle = (employeeId) => {
    if (employeeChipClickGuardRef.current) return

    const employeeKey = String(employeeId)
    setFocusedEmployeeId((current) => (current === employeeKey ? null : employeeKey))
  }

  const handleDragEnd = () => {
    dragSessionRef.current = null
    setDragPayload(null)
    setDropTargetKey('')
    window.setTimeout(() => {
      employeeChipClickGuardRef.current = false
    }, 0)
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
    <section className="staff-page schedule-workspace" onClick={() => { setCapacityPickerKey(''); setDayActionMenuKey(null); setCellActionMenuKey(''); setIsScheduleMoreMenuOpen(false) }}>
      <header className="schedule-header panel">
        <div className="schedule-header-copy">
          <p className="eyebrow schedule-header-eyebrow">Schedule</p>
          <h2 className="schedule-header-title">Current week</h2>
          <p className="schedule-header-range">{formatScheduleHeaderWeekRange(weekDays)}</p>
          <div className="schedule-week-completion" aria-label="Week completion">
            <div className="schedule-week-completion-copy">
              <span className="schedule-week-completion-label">Week completion</span>
              {weekCompletion.totalRequired > 0 ? (
                <span className="schedule-week-completion-value">
                  {weekCompletion.totalAssigned} / {weekCompletion.totalRequired} shifts assigned
                </span>
              ) : (
                <span className="schedule-week-completion-value">
                  {weekCompletion.totalAssigned > 0
                    ? `${weekCompletion.totalAssigned} shift${weekCompletion.totalAssigned === 1 ? '' : 's'} assigned`
                    : 'No shifts assigned'}
                </span>
              )}
            </div>
            {weekCompletion.totalRequired > 0 ? (
              <div className="schedule-week-completion-progress">
                <div className="schedule-week-completion-track" aria-hidden="true">
                  <span className="schedule-week-completion-fill" style={{ width: `${weekCompletion.barWidth}%` }} />
                </div>
                <span className="schedule-week-completion-percent">{weekCompletion.percent}%</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="schedule-header-actions">
          <div className="schedule-header-nav">
            <button
              type="button"
              className="ghost-btn schedule-header-nav-btn"
              onClick={() => onWeekStartDateChange(addWeeks(weekStartDate, -1))}
              disabled={isLoading || isSaving || isPublishing}
            >
              Previous Week
            </button>
            <button
              type="button"
              className="ghost-btn schedule-header-nav-btn"
              onClick={() => onWeekStartDateChange(getCurrentWeekStartDate())}
              disabled={isLoading || isSaving || isPublishing || isCurrentWeek(weekStartDate)}
            >
              Today
            </button>
            <button
              type="button"
              className="ghost-btn schedule-header-nav-btn"
              onClick={() => onWeekStartDateChange(addWeeks(weekStartDate, 1))}
              disabled={isLoading || isSaving || isPublishing}
            >
              Next Week
            </button>
          </div>

          <div className="schedule-header-controls">
          <span className={`schedule-status-badge schedule-header-control-surface ${isWeekPublished ? (hasUnpublishedChanges ? 'pending' : 'published') : 'draft'}`}>
            {schedulePublicationLabel}
          </span>

          <button type="button" className="ghost-btn schedule-add-shift-btn schedule-header-tertiary-btn schedule-header-control-surface" onClick={() => handleOpenAddShiftForDate(selectedDate)} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Add Shift'}
          </button>

          <div className="schedule-more-menu schedule-header-control-surface" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="ghost-btn schedule-more-menu-btn schedule-header-tertiary-btn"
              onClick={() => setIsScheduleMoreMenuOpen((current) => !current)}
              aria-expanded={isScheduleMoreMenuOpen}
              aria-haspopup="menu"
            >
              More ▾
            </button>
            {isScheduleMoreMenuOpen ? (
              <div className="template-card-menu schedule-more-menu-dropdown" role="menu">
                <button type="button" className="template-card-menu-item" role="menuitem" onClick={() => { setIsScheduleMoreMenuOpen(false); handleOpenSaveWeekTemplateModal() }} disabled={isSaving}>Save Week</button>
                <button type="button" className="template-card-menu-item" role="menuitem" onClick={() => { setIsScheduleMoreMenuOpen(false); handleOpenLoadWeekTemplateModal() }} disabled={isSaving || !selectedWeeklyTemplateId}>Load Week</button>
                <button type="button" className="template-card-menu-item" role="menuitem" onClick={() => { setIsScheduleMoreMenuOpen(false); handleOpenCopyWeekModal() }} disabled={isLoading || isSaving || isPublishing || visibleWeekShifts.length === 0}>Copy Week</button>
                <button type="button" className="template-card-menu-item" role="menuitem" onClick={() => { setIsScheduleMoreMenuOpen(false); handleStartRenameWeeklyTemplate() }} disabled={isSaving || !selectedWeeklyTemplateId}>Rename Week</button>
                <button type="button" className="template-card-menu-item" role="menuitem" onClick={() => { setIsScheduleMoreMenuOpen(false); handleDeleteSelectedWeeklyTemplate() }} disabled={isSaving || !selectedWeeklyTemplateId}>Delete Week</button>
                <button type="button" className="template-card-menu-item" role="menuitem" onClick={() => { setIsScheduleMoreMenuOpen(false); handleOpenAutoFillModal() }} disabled={isSaving || !selectedWeeklyTemplateId}>Auto Fill</button>
                <button type="button" className="template-card-menu-item danger" role="menuitem" onClick={() => { setIsScheduleMoreMenuOpen(false); handleOpenClearWeekModal() }} disabled={isSaving || isPublishing}>Clear Week</button>
              </div>
            ) : null}
          </div>

          {hasUnpublishedChanges || !isWeekPublished ? (
            <button
              type="button"
              className="primary-btn schedule-publish-btn schedule-publish-btn--draft schedule-header-control-surface"
              onClick={() => {
                setPublishError('')
                setIsPublishConfirmOpen(true)
              }}
              disabled={isSaving || isPublishing}
            >
              {hasUnpublishedChanges ? 'Publish changes' : 'Publish'}
            </button>
          ) : (
            <button
              type="button"
              className="ghost-btn schedule-unpublish-btn schedule-header-control-surface"
              onClick={() => {
                setPublishError('')
                setIsUnpublishConfirmOpen(true)
              }}
              disabled={isSaving || isPublishing}
            >
              Unpublish
            </button>
          )}
          </div>
        </div>
      </header>

      <div className="schedule-filters-bar panel">
        <label className="schedule-filter-field schedule-filter-search">
          <span className="schedule-filter-label">Search employee</span>
          <input
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Search by name"
          />
        </label>
        <label className="schedule-filter-field">
          <span className="schedule-filter-label">Department</span>
          <select value={filters.department} onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))}>
            <option value="All">All departments</option>
            <option value="Bar">Bar</option>
            <option value="Service">Service</option>
            <option value="Host">Host</option>
            <option value="Kitchen">Kitchen</option>
            <option value="Management">Management</option>
          </select>
        </label>
        <label className="schedule-filter-field">
          <span className="schedule-filter-label">Position</span>
          <select value={filters.position} onChange={(event) => setFilters((current) => ({ ...current, position: event.target.value }))}>
            {positionFilterOptions.map((option) => (
              <option key={`schedule-position-filter-${option}`} value={option}>
                {option === 'All' ? 'All positions' : option}
              </option>
            ))}
          </select>
        </label>
        <label className="schedule-filter-toggle">
          <input
            type="checkbox"
            checked={filters.publishedOnly}
            onChange={(event) => setFilters((current) => ({ ...current, publishedOnly: event.target.checked }))}
            disabled={!isWeekPublished}
          />
          <span>Show Published Only</span>
        </label>
      </div>

      {hasUnpublishedChanges ? (
        <div className="staff-status-banner schedule-draft-changes-banner schedule-workspace-banner">
          Draft has unpublished changes.
        </div>
      ) : null}

      {assignmentError ? <div className="staff-status-banner schedule-workspace-banner">{assignmentError}</div> : null}
      {noticeMessage ? (
        <div className={`staff-status-banner schedule-workspace-banner ${noticeMessage === 'Schedule published for employees.' ? 'schedule-publish-success-banner' : ''}`}>
          {noticeMessage === 'Schedule published for employees.' ? (
            <>
              <span className="schedule-publish-success-icon" aria-hidden="true">✓</span>
              <span>{noticeMessage}</span>
            </>
          ) : noticeMessage}
        </div>
      ) : null}
      {isLoading ? <div className="staff-status-banner schedule-workspace-banner">Loading schedule…</div> : null}

      <div className={`schedule-grid-section panel staff-panel blend-grid-panel schedule-grid-hero ${isScheduleVisualFilterActive ? 'schedule-visual-filter-active' : ''}`}>
        {scheduleGridTemplates.length === 0 ? (
          <div className="schedule-empty-state">
            <h4>No shift templates available.</h4>
            <p>Create templates first, then assign employees directly in this grid.</p>
          </div>
        ) : (
          <>
          <div className="schedule-roster-bar">
          <div className="schedule-staff-strip">
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
                  const workloadStatus = getEmployeeWorkloadStatus(scheduledHours, weeklyTarget)
                  const hoursPercent = hoursTracker.hasTarget && weeklyTarget > 0
                    ? Math.round((scheduledHours / weeklyTarget) * 100)
                    : null
                  const employeeKey = String(employee.id)
                  const isEmployeeFocused = focusedEmployeeId === employeeKey
                  const chipMatchesSearch = !scheduleVisualSearchNeedle
                    || employeeName.toLowerCase().includes(scheduleVisualSearchNeedle)

                  return (
                    <button
                      key={`staff-chip-${employee.id}`}
                      type="button"
                      className={`schedule-staff-chip ${isEmployeeFocused ? 'focused' : ''} ${isScheduleVisualFilterActive && !chipMatchesSearch ? 'visual-faded' : ''} ${dragPayload?.type === 'employee' && String(dragPayload.employeeId) === employeeKey ? 'dragging' : ''}`}
                      draggable={!isDragDropDisabled}
                      onDragStart={(event) => handleEmployeeDragStart(event, employee)}
                      onDragEnd={handleDragEnd}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleEmployeeChipFocusToggle(employee.id)
                      }}
                      aria-label={`${isEmployeeFocused ? 'Clear focus for' : 'Focus'} ${employeeName}, ${workloadStatus.label}, ${positionLabel}`}
                      aria-pressed={isEmployeeFocused}
                    >
                      <span className="schedule-staff-chip-avatar">{getInitials(employeeName)}</span>
                      <span className="schedule-staff-chip-body">
                        <strong className="schedule-staff-chip-name">{firstName}</strong>
                        <span className="schedule-staff-chip-role">{positionLabel}</span>
                        <span className={`schedule-staff-workload-status tone-${workloadStatus.tone}`}>
                          <span className="schedule-staff-workload-icon" aria-hidden="true">{workloadStatus.icon}</span>
                          {workloadStatus.label}
                        </span>
                        <div className="schedule-staff-hours-row">
                          <span className="schedule-staff-hours-primary">{hoursTracker.primaryLabel}</span>
                          {hoursPercent !== null ? (
                            <span className="schedule-staff-hours-percent">{hoursPercent}%</span>
                          ) : null}
                        </div>
                        <span className="schedule-staff-hours-bar" aria-hidden="true">
                          <span
                            className={`schedule-staff-hours-bar-fill ${hoursTracker.status}`}
                            style={{ width: `${hoursTracker.barWidth}%` }}
                          />
                        </span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
          </div>

          <div className="blend-grid-scroll">
            <div className="blend-grid-table" style={{ gridTemplateColumns: `228px repeat(${weekDays.length}, minmax(0, 1fr))` }}>
              <div className="blend-grid-header blend-grid-header-template">Shift template</div>
              {weekDays.map((day) => {
                const daySummary = dayHeaderSummariesByKey[day.key] ?? {
                  totalAssignedStaff: 0,
                  hoursLabel: '0',
                  coveragePercent: null,
                  status: 'empty',
                  statusLabel: 'Empty',
                  statusIcon: '⚪',
                }
                const dayHeader = formatScheduleDayHeader(day.key)
                const isTodayColumn = day.key === todayDateKey
                return (
                <div
                  key={`head-${day.key}`}
                  className={`blend-grid-header blend-grid-header-day ${selectedDay === day.key ? 'active' : ''} ${isTodayColumn ? 'is-today' : ''}`}
                >
                  <button
                    type="button"
                    className="blend-grid-header-day-select"
                    onClick={() => setSelectedDay(day.key)}
                  >
                    <strong className="blend-grid-header-day-name">{dayHeader.weekdayLabel}</strong>
                    <span className={`day-header-status ${daySummary.status}`}>
                      <span className="day-header-status-dot" aria-hidden="true">{formatDayCoverageBadgeIcon(daySummary.status)}</span>
                      {formatDayCoverageBadgeLabel(daySummary.status, daySummary.statusLabel)}
                    </span>
                    {daySummary.coveragePercent !== null ? (
                      <span className={`day-header-coverage-percent tone-${daySummary.status}`}>{daySummary.coveragePercent}% covered</span>
                    ) : null}
                    <span className="blend-grid-header-day-date">{dayHeader.calendarLabel}</span>
                    <div className="blend-grid-header-day-metrics" aria-label={`${daySummary.totalAssignedStaff} employees, ${daySummary.hoursLabel} hours`}>
                      <span className="blend-grid-header-day-metric">{daySummary.totalAssignedStaff} staff</span>
                      <span className="blend-grid-header-day-metric">{daySummary.hoursLabel}h scheduled</span>
                    </div>
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
                    const templateArea = `${row.template.defaultArea || row.template.defaultRole || 'General'}`.trim()
                    const templateDepartment = templateArea.toUpperCase()
                    const requiredCounts = row.dayCells.map((cell) => cell.requiredCount)
                    const minRequired = requiredCounts.length > 0 ? Math.min(...requiredCounts) : null
                    const maxRequired = requiredCounts.length > 0 ? Math.max(...requiredCounts) : null
                    const requiredCountLabel = formatTemplateRequiredCount(minRequired, maxRequired)
                    const templateShiftName = `${row.template.name || templateDepartment}`.trim()
                    const templateNote = `${row.template.notes ?? ''}`.trim()

                    return (
                  <aside key={`template-${row.template.id}`} className="blend-grid-template-cell blend-grid-palette-card">
                    <span className="blend-grid-palette-grip" aria-hidden="true">⠿</span>
                    <div className="blend-grid-palette-header">
                      <p className="blend-grid-palette-department">
                        <span className="blend-grid-palette-icon" aria-hidden="true">{getScheduleAreaIcon(templateArea || templateShiftName)}</span>
                        <span className="blend-grid-palette-name">{templateShiftName.toUpperCase()}</span>
                      </p>
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
                    </div>
                    <div className="blend-grid-palette-body">
                      <p className="blend-grid-palette-time">{formatTimeRange24(row.template.startTime, row.template.endTime, ' – ')}</p>
                      {requiredCountLabel ? (
                        <div className="blend-grid-palette-required-block">
                          <p className="blend-grid-palette-required-label">Required</p>
                          <p className="blend-grid-palette-required-count">{requiredCountLabel}</p>
                        </div>
                      ) : null}
                      {templateNote ? <p className="blend-grid-palette-note">{templateNote}</p> : null}
                      <p className="blend-grid-palette-display-name">{templateShiftName}</p>
                    </div>
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
                    const isTodayColumn = cell.day.key === todayDateKey
                    const cellHasVisualEmphasis = !isScheduleVisualFilterActive || cell.shifts.some((shift) => {
                      const shiftEmployeeName = shift.employees?.full_name || shift.employeeName || shift.employeeRecord?.name || 'Unassigned'
                      return doesShiftMatchScheduleVisualFilter(shift, shiftEmployeeName, {
                        focusedEmployeeId,
                        searchNeedle: scheduleVisualSearchNeedle,
                      })
                    })

                    return (
                    <div
                      key={`cell-${row.template.id}-${cell.day.key}`}
                      className={`blend-grid-assignment-cell ${selectedDay === cell.day.key ? 'active' : ''} ${cell.assignedCount === 0 ? 'empty' : ''} ${cell.hasRealConflict ? 'has-conflict' : cell.staffingState} ${isDropTarget ? 'drop-target' : ''} ${isTodayColumn ? 'is-today' : ''} ${isScheduleVisualFilterActive && !cellHasVisualEmphasis ? 'visual-faded' : ''}`}
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
                        <div className="blend-grid-cell-top-start">
                          {cell.hasRealConflict ? (
                            <span className="cell-status-badge cell-conflict-badge">Conflict</span>
                          ) : null}
                          {!cell.hasRealConflict && cell.staffingState === 'overstaffed' ? (
                            <span className="cell-status-badge cell-over-badge">Overstaffed</span>
                          ) : null}
                          {!cell.hasRealConflict && (cell.staffingState === 'understaffed' || cell.staffingState === 'attention') ? (
                            <span className="cell-status-badge cell-under-badge">Understaffed</span>
                          ) : null}
                        </div>
                        <div className="blend-grid-cell-top-end">
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
                      </div>

                      <div className="blend-grid-pill-list">
                        {cell.shifts.map((shift) => {
                          const employeeName = shift.employees?.full_name || shift.employeeName || shift.employeeRecord?.name || 'Unassigned'
                          const shiftPosition = (shift.role || getEmployeePositionNames(shift.employeeRecord).join(' • ') || 'Unassigned position').replace(/,\s*/g, ' • ')
                          const shiftDepartment = getShiftDepartment(shift)
                          const shiftTemplate = getShiftTemplateForAssignment(shift)
                          const usesCustomTime = shiftTemplate ? isAssignmentUsingCustomTime(shift, shiftTemplate) : false
                          const overtimeHours = shiftTemplate ? getAssignmentOvertimeHours(shift, shiftTemplate) : 0
                          const pillStartTime = normalizeTimeValue(shift.startTime) || normalizeTimeValue(shiftTemplate?.startTime)
                          const pillEndTime = normalizeTimeValue(shift.endTime) || normalizeTimeValue(shiftTemplate?.endTime)

                          const pillTimeLabel = formatTimeRange24(pillStartTime, pillEndTime, '–')
                          const pillIsEmphasized = doesShiftMatchScheduleVisualFilter(shift, employeeName, {
                            focusedEmployeeId,
                            searchNeedle: scheduleVisualSearchNeedle,
                          })

                          return (
                            <button
                              key={`shift-pill-${shift.id}`}
                              type="button"
                              className={`blend-grid-pill ${usesCustomTime ? 'has-custom-time' : ''} ${dragPayload?.shiftId === shift.id ? 'dragging' : ''} ${isScheduleVisualFilterActive ? (pillIsEmphasized ? 'visual-emphasis' : 'visual-faded') : ''}`}
                              draggable={!isDragDropDisabled}
                              onDragStart={(event) => handleShiftDragStart(event, shift)}
                              onDragEnd={handleDragEnd}
                              onClick={(event) => {
                                event.stopPropagation()
                                handleOpenAssignmentActions(shift)
                              }}
                              title={`${employeeName} · ${shiftPosition} · ${pillTimeLabel || 'Time TBD'} · ${shiftDepartment}`}
                            >
                              <span className="blend-grid-pill-avatar">{getInitials(employeeName)}</span>
                              <span className="blend-grid-pill-copy">
                                <span className="blend-grid-pill-name">{employeeName}</span>
                                <span className="blend-grid-pill-department">
                                  <span className="blend-grid-pill-type-icon" aria-hidden="true">{getScheduleAreaIcon(shiftDepartment)}</span>
                                  {shiftDepartment}
                                </span>
                                {pillTimeLabel ? (
                                  <span className="blend-grid-pill-time">
                                    <span>{pillTimeLabel}</span>
                                    {overtimeHours > 0 ? <span className="blend-grid-pill-overtime">+{formatHoursLabel(overtimeHours)}h</span> : null}
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          )
                        })}
                      </div>

                      <div className="blend-grid-cell-bottom">
                        <span>{formatTimeRange24(row.template.startTime, row.template.endTime, ' - ')}</span>
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

      {scheduleGridTemplates.length > 0 ? (
        <ScheduleCollapsibleSection
          title="Weekly Statistics"
          meta="Week at a glance"
          className="schedule-weekly-stats-collapsible"
        >
          <section className="schedule-weekly-stats" aria-label="Weekly statistics">
            <article className="schedule-weekly-stat">
              <p className="schedule-weekly-stat-label">Employees</p>
              <p className="schedule-weekly-stat-value">{weekSummary.employeesScheduled}</p>
            </article>
            <article className="schedule-weekly-stat">
              <p className="schedule-weekly-stat-label">Shifts</p>
              <p className="schedule-weekly-stat-value">{weekSummary.totalShifts}</p>
            </article>
            <article className="schedule-weekly-stat">
              <p className="schedule-weekly-stat-label">Scheduled Hours</p>
              <p className="schedule-weekly-stat-value">{weekSummary.totalHours}h</p>
            </article>
            <article className="schedule-weekly-stat">
              <p className="schedule-weekly-stat-label">Coverage</p>
              <p className="schedule-weekly-stat-value">{weekCompletion.percent}%</p>
            </article>
            <article className="schedule-weekly-stat">
              <p className="schedule-weekly-stat-label">Labour Cost</p>
              <p className={`schedule-weekly-stat-value ${weekLabourSummary.costConnected ? 'tone-gold' : 'tone-muted'}`}>
                {weekLabourSummary.costConnected ? weekLabourSummary.costDisplay : 'Not Connected'}
              </p>
            </article>
            <article className="schedule-weekly-stat">
              <p className="schedule-weekly-stat-label">Warnings</p>
              <p className={`schedule-weekly-stat-value ${scheduleWarningCount > 0 ? 'tone-warning' : 'tone-muted'}`}>
                {scheduleWarningCount > 0 ? scheduleWarningCount : 'None'}
              </p>
            </article>
          </section>
        </ScheduleCollapsibleSection>
      ) : null}

      <ScheduleCollapsibleSection
        title="Saved Templates"
        meta={selectedWeeklyTemplateId
          ? `${weeklyTemplates.find((template) => String(template.id) === String(selectedWeeklyTemplateId))?.name ?? 'Saved week selected'}`
          : 'Reusable schedule presets'}
        className="weekly-template-panel schedule-saved-weeks-collapsible"
      >
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

          <p className="schedule-saved-weeks-hint">Use More ▾ in the toolbar for Save, Load, Rename, Delete, Auto Fill, and Clear Week actions.</p>
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
      </ScheduleCollapsibleSection>

      <ScheduleCollapsibleSection
        eyebrow="Employee view"
        title="Employee week schedule"
        meta={`${employeeWeekScheduleView.length} employee${employeeWeekScheduleView.length === 1 ? '' : 's'} · ${weekDays.length}-day roster · ${isWeekPublished ? (hasUnpublishedChanges ? 'draft changes pending publish' : 'published') : 'draft preview'}`}
        className="schedule-employee-view-collapsible"
      >
        <div className="employee-week-grid">
          {employeeWeekScheduleView.length === 0 ? (
            <p className="staff-subtitle">No employees available for this week.</p>
          ) : (
            employeeWeekScheduleView.map((employeeSchedule) => (
              <article key={`employee-week-${employeeSchedule.employeeId}`} className="employee-week-card">
                <h4>{employeeSchedule.employeeName}</h4>
                <div className="employee-week-days">
                  {employeeSchedule.days.map((day) => (
                    <div
                      key={`employee-week-day-${employeeSchedule.employeeId}-${day.date}`}
                      className={`employee-week-day ${day.isDayOff ? 'is-day-off' : 'has-shifts'}`}
                    >
                      <div className="employee-week-day-header">
                        <strong>{day.dayLabel}</strong>
                        <span>{day.shortDate}</span>
                      </div>
                      {day.isDayOff ? (
                        <p className="employee-week-day-off">DAY OFF</p>
                      ) : (
                        <div className="employee-week-day-shifts">
                          {day.shifts.map((shift) => (
                            <div
                              key={`employee-week-shift-${employeeSchedule.employeeId}-${day.date}-${shift.shiftId ?? shift.startTime}-${shift.endTime}`}
                              className="employee-week-shift"
                            >
                              <span className="employee-week-shift-role">{shift.role}</span>
                              <span className="employee-week-shift-time">
                                {shift.startTimeLabel} – {shift.endTimeLabel}
                              </span>
                              {shift.notes ? (
                                <small className="employee-week-shift-notes">{shift.notes}</small>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
      </ScheduleCollapsibleSection>

      <ScheduleCollapsibleSection
        eyebrow="Weekly roster"
        title={selectedDay ? `${weekDays.find((day) => day.key === selectedDay)?.label ?? 'Day'} coverage` : 'Weekly coverage'}
        meta={selectedDay
          ? `${filteredDayShifts.length} shift${filteredDayShifts.length === 1 ? '' : 's'} in view`
          : 'Select a day in the grid to focus roster filters'}
        className="schedule-roster-collapsible"
      >
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
      </ScheduleCollapsibleSection>

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

const HOST_LIST_FILTERS = [
  'All',
  'Now / Active',
  'Upcoming',
  'Arrived',
  'Seated',
  'Late',
  'Completed',
  'Cancelled',
]

const HOST_LIST_SORTS = [
  { id: 'service', label: 'Service order' },
  { id: 'time', label: 'Time' },
  { id: 'table', label: 'Table' },
  { id: 'guest', label: 'Guest name' },
  { id: 'status', label: 'Status' },
  { id: 'party', label: 'Guest count' },
]

const HOST_SMART_CHIPS = [
  { id: 'needs-attention', label: 'Needs attention' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'late', label: 'Late' },
  { id: 'in-house', label: 'In house' },
  { id: 'next-30', label: 'Next 30 min' },
  { id: 'unassigned', label: 'Unassigned' },
]
const RESERVATION_WORKSPACE_VIEWS = [
  { id: 'operations', label: 'Operations' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'floor', label: 'Floor' },
]

const RESERVATION_WORKSPACE_MODULES = {
  aiAssistant: null,
  notifications: null,
  kitchen: null,
  analytics: null,
}

const ReservationWorkspaceContext = createContext(null)

function useReservationWorkspace() {
  const workspace = useContext(ReservationWorkspaceContext)
  if (!workspace) {
    throw new Error('useReservationWorkspace must be used within ReservationWorkspaceProvider')
  }
  return workspace
}

function reservationIdsMatch(left, right) {
  if (!left || !right) return false
  return String(left.id) === String(right.id)
}

function ReservationWorkspaceProvider({
  children,
  filteredTodayReservations,
  onHostEditSave,
  onHostEditDelete,
  isSavingHostEdit = false,
}) {
  const { layout } = usePublishedFloorPlan()
  const [selectedReservation, setSelectedReservation] = useState(null)
  const [isGuestProfileOpen, setIsGuestProfileOpen] = useState(false)
  const [selectionPulseKey, setSelectionPulseKey] = useState(0)
  const [workspaceFocus, setWorkspaceFocus] = useState('operations')
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState(true)
  const [activeFloorAreaId, setActiveFloorAreaId] = useState(null)
  const [draggingReservationId, setDraggingReservationId] = useState(null)
  const [seatingDraftUnitIds, setSeatingDraftUnitIds] = useState([])
  const [seatingExtraChairs, setSeatingExtraChairs] = useState(0)
  const [seatingStandingGuests, setSeatingStandingGuests] = useState(0)
  const [hostEditingReservation, setHostEditingReservation] = useState(null)
  const [hostEditForm, setHostEditForm] = useState(null)
  const [isHostFloorPickActive, setIsHostFloorPickActive] = useState(false)
  const [floorPlanMode, setFloorPlanMode] = useState('view')

  useEffect(() => {
    if (floorPlanMode !== 'edit') return
    setHostEditingReservation(null)
    setHostEditForm(null)
    setIsHostFloorPickActive(false)
  }, [floorPlanMode])
  const timelineCardRefs = useRef({})
  const floorTableRefs = useRef({})
  const timelineScrollRef = useRef(null)
  const floorCanvasRef = useRef(null)
  const canvasRef = useRef(null)

  const clearDragState = useCallback(() => {
    setDraggingReservationId(null)
  }, [])

  useEffect(() => {
    if (!layout?.zones?.length) return

    setActiveFloorAreaId((current) => {
      if (current && layout.zones.some((zone) => zone.id === current)) return current
      return layout.zones[0].id
    })
  }, [layout])

  const selectedTableId = useMemo(
    () => (selectedReservation ? getTableIdForReservation(selectedReservation, layout) : null),
    [layout, selectedReservation],
  )

  const scrollTimelineToReservation = useCallback((reservationId) => {
    window.requestAnimationFrame(() => {
      timelineCardRefs.current[reservationId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })
  }, [])

  const scrollFloorToTable = useCallback((tableId) => {
    if (!tableId) return

    window.requestAnimationFrame(() => {
      canvasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      floorCanvasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      floorTableRefs.current[tableId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      })
    })
  }, [])

  const clearSeatingDraft = useCallback(() => {
    setSeatingDraftUnitIds([])
    setSeatingExtraChairs(0)
    setSeatingStandingGuests(0)
  }, [])

  const toggleSeatingUnit = useCallback((unitId) => {
    if (!unitId) return

    setSeatingDraftUnitIds((current) => (
      current.includes(unitId)
        ? current.filter((id) => id !== unitId)
        : [...current, unitId]
    ))
  }, [])

  const hostEditUnitIds = useMemo(
    () => (hostEditForm?.assignedUnits ?? []).map((unit) => unit.id),
    [hostEditForm],
  )

  const closeHostEdit = useCallback(() => {
    setHostEditingReservation(null)
    setHostEditForm(null)
    setIsHostFloorPickActive(false)
  }, [])

  const startSeatingDraft = useCallback((reservation, unitId) => {
    if (!reservation) return

    closeHostEdit()
    setSelectedReservation(reservation)
    setSelectionPulseKey((current) => current + 1)
    setSeatingDraftUnitIds(unitId ? [unitId] : [])
    setSeatingExtraChairs(0)
    setSeatingStandingGuests(0)

    if (unitId) {
      const unit = getHostUnitById(unitId, layout)
      if (unit?.zoneId) {
        setActiveFloorAreaId(unit.zoneId)
      }
    }
  }, [closeHostEdit, layout])

  const openHostEdit = useCallback((reservation) => {
    if (!reservation) return

    const safeReservation = {
      ...reservation,
      guestName: reservation.guestName ?? reservation.name ?? '',
      notes: reservation.notes ?? '',
      tables: reservation.tables ?? [],
    }

    let nextForm = null
    try {
      nextForm = createHostReservationEditForm(safeReservation, layout)
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[host-floor] Failed to open reservation edit drawer.', error)
      }
    }

    if (!nextForm) {
      nextForm = {
        guestName: safeReservation.guestName,
        phone: safeReservation.phone ?? '',
        date: `${safeReservation.date ?? ''}`.slice(0, 10),
        time: normalizeReservationTimeValue(safeReservation.time),
        guests: `${safeReservation.guests ?? 2}`,
        customerType: safeReservation.customerType ?? 'Regular',
        status: safeReservation.status ?? 'Pending',
        notes: safeReservation.notes ?? '',
        area: safeReservation.area ?? '',
        assignedUnits: [],
        extraChairs: 0,
        standingGuests: 0,
        seatingAreaId: '',
      }
    }

    const tableId = getTableIdForReservation(safeReservation, layout)
    setHostEditingReservation(safeReservation)
    setHostEditForm(nextForm)
    setIsHostFloorPickActive(false)
    setSelectedReservation(safeReservation)
    setSelectionPulseKey((current) => current + 1)
    clearSeatingDraft()

    const zoneId = getFloorZoneIdForReservation(safeReservation, layout)
    if (zoneId) {
      setActiveFloorAreaId(zoneId)
    }

    window.requestAnimationFrame(() => {
      scrollFloorToTable(tableId)
    })
  }, [clearSeatingDraft, layout, scrollFloorToTable])

  const toggleHostEditUnit = useCallback((unitId) => {
    const unit = getHostUnitById(unitId, layout)
    if (!unit) return

    const seatingUnit = toSeatingUnitFromLayoutUnit(unit)
    setHostEditForm((current) => {
      if (!current) return current

      const exists = current.assignedUnits.some((entry) => entry.id === unitId)
      const assignedUnits = exists
        ? current.assignedUnits.filter((entry) => entry.id !== unitId)
        : [...current.assignedUnits, seatingUnit]

      return { ...current, assignedUnits }
    })
  }, [layout])

  const startHostFloorPick = useCallback(() => {
    setIsHostFloorPickActive((current) => !current)
    clearSeatingDraft()
  }, [clearSeatingDraft])

  const selectReservation = useCallback((reservation, options = {}) => {
    if (!reservation) return

    const {
      scrollTimeline = false,
      scrollFloor = false,
      openGuestProfile = false,
    } = options

    const tableId = getTableIdForReservation(reservation, layout)

    setSelectedReservation(reservation)
    setIsGuestProfileOpen(openGuestProfile)
    setSelectionPulseKey((current) => current + 1)
    clearSeatingDraft()

    if (scrollFloor) {
      const zoneId = getFloorZoneIdForReservation(reservation, layout)
      if (zoneId) {
        setActiveFloorAreaId(zoneId)
      }
    }

    window.requestAnimationFrame(() => {
      if (scrollTimeline) {
        scrollTimelineToReservation(reservation.id)
      }

      if (scrollFloor) {
        scrollFloorToTable(tableId)
      }
    })
  }, [clearSeatingDraft, layout, scrollFloorToTable, scrollTimelineToReservation])

  const clearSelection = useCallback(() => {
    setSelectedReservation(null)
    setIsGuestProfileOpen(false)
    clearSeatingDraft()
    closeHostEdit()
  }, [clearSeatingDraft, closeHostEdit])

  const isSelected = useCallback((reservation) => (
    reservationIdsMatch(selectedReservation, reservation)
  ), [selectedReservation])

  const value = useMemo(() => ({
    selectedReservation,
    selectedTableId,
    isGuestProfileOpen,
    selectionPulseKey,
    workspaceFocus,
    setWorkspaceFocus,
    isTimelineCollapsed,
    setIsTimelineCollapsed,
    activeFloorAreaId,
    setActiveFloorAreaId,
    draggingReservationId,
    setDraggingReservationId,
    clearDragState,
    layout,
    seatingDraftUnitIds,
    seatingExtraChairs,
    seatingStandingGuests,
    toggleSeatingUnit,
    startSeatingDraft,
    clearSeatingDraft,
    setSeatingExtraChairs,
    setSeatingStandingGuests,
    hostEditingReservation,
    hostEditForm,
    setHostEditForm,
    hostEditUnitIds,
    isHostFloorPickActive,
    floorPlanMode,
    setFloorPlanMode,
    openHostEdit,
    closeHostEdit,
    startHostFloorPick,
    toggleHostEditUnit,
    onHostEditSave,
    onHostEditDelete,
    isSavingHostEdit,
    selectReservation,
    clearSelection,
    isSelected,
    timelineCardRefs,
    floorTableRefs,
    timelineScrollRef,
    floorCanvasRef,
    canvasRef,
    filteredTodayReservations,
    futureModules: RESERVATION_WORKSPACE_MODULES,
  }), [
    clearSelection,
    filteredTodayReservations,
    isGuestProfileOpen,
    isSelected,
    selectReservation,
    selectedReservation,
    selectedTableId,
    selectionPulseKey,
    workspaceFocus,
    isTimelineCollapsed,
    activeFloorAreaId,
    clearDragState,
    draggingReservationId,
    layout,
    seatingDraftUnitIds,
    seatingExtraChairs,
    seatingStandingGuests,
    clearSeatingDraft,
    toggleSeatingUnit,
    startSeatingDraft,
    hostEditingReservation,
    hostEditForm,
    hostEditUnitIds,
    isHostFloorPickActive,
    floorPlanMode,
    onHostEditSave,
    onHostEditDelete,
    isSavingHostEdit,
    closeHostEdit,
    startHostFloorPick,
    toggleHostEditUnit,
    openHostEdit,
  ])

  return (
    <ReservationWorkspaceContext.Provider value={value}>
      {children}
    </ReservationWorkspaceContext.Provider>
  )
}

function ReservationsWorkspaceSegmentControl({ value, onChange }) {
  return (
    <div
      className="reservations-workspace-segment"
      role="tablist"
      aria-label="Workspace focus"
    >
      {RESERVATION_WORKSPACE_VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          role="tab"
          aria-selected={value === view.id}
          className={`reservations-workspace-segment-btn${value === view.id ? ' is-active' : ''}`}
          onClick={() => onChange(view.id)}
        >
          {view.label}
        </button>
      ))}
    </div>
  )
}

const COMMAND_PALETTE_ACTIONS = [
  { id: 'create-reservation', label: 'Create reservation', subtitle: 'Open full reservation form', icon: '＋', keywords: ['new reservation', 'add reservation', 'book'] },
  { id: 'create-walk-in', label: 'Create walk-in', subtitle: 'Seat a walk-in party now', icon: '🚶', keywords: ['walk in', 'walk-in', 'walkin'] },
  { id: 'seat-guest', label: 'Seat guest', subtitle: 'Mark selected or matched guest as seated', icon: '🪑', keywords: ['seat', 'seat guest', 'seat table'] },
  { id: 'move-guest', label: 'Move guest', subtitle: 'Reassign to another table', icon: '↔', keywords: ['move', 'transfer', 'reassign'] },
  { id: 'edit-reservation', label: 'Edit reservation', subtitle: 'Update reservation details', icon: '✏', keywords: ['edit', 'update reservation'] },
  { id: 'call-guest', label: 'Call guest', subtitle: 'Dial guest phone number', icon: '📞', keywords: ['call', 'phone', 'dial'] },
  { id: 'add-note', label: 'Add note', subtitle: 'Add internal service note', icon: '📝', keywords: ['note', 'add note', 'comment'] },
  { id: 'merge-tables', label: 'Merge tables', subtitle: 'Open floor plan · Shift + click two tables', icon: '⊕', keywords: ['merge', 'merge tables', 'combine'] },
  { id: 'split-tables', label: 'Split tables', subtitle: 'Open floor plan · Right-click merged table', icon: '⊖', keywords: ['split', 'split tables', 'unmerge'] },
  { id: 'find-available-table', label: 'Find available table', subtitle: 'Jump to the next open table', icon: '◎', keywords: ['available', 'open table', 'find table'] },
]

function commandPaletteFuzzyScore(needle, haystack) {
  const query = `${needle ?? ''}`.trim().toLowerCase()
  const target = `${haystack ?? ''}`.toLowerCase()
  if (!query) return 1
  if (!target) return 0
  if (target.includes(query)) return 120 - target.indexOf(query)

  let score = 0
  let targetIndex = 0

  for (let index = 0; index < query.length; index += 1) {
    const matchIndex = target.indexOf(query[index], targetIndex)
    if (matchIndex === -1) return 0
    score += 12 - Math.min(matchIndex - targetIndex, 8)
    targetIndex = matchIndex + 1
  }

  return score
}

function parseCommandPaletteIntent(query) {
  const normalized = `${query ?? ''}`.trim().toLowerCase()
  if (!normalized) return null

  const patterns = [
    { regex: /^(new|create)\s+reservation$/, intent: 'create-reservation' },
    { regex: /^walk[\s-]?in(?:\s+(\d+)\s+guests?)?$/, intent: 'create-walk-in', guests: 1 },
    { regex: /^seat(?:\s+guest|\s+table)?\s+(.+)$/, intent: 'seat-guest', target: 1 },
    { regex: /^move\s+(.+)$/, intent: 'move-guest', target: 1 },
    { regex: /^edit(?:\s+reservation)?\s+(.+)$/, intent: 'edit-reservation', target: 1 },
    { regex: /^call\s+(.+)$/, intent: 'call-guest', target: 1 },
    { regex: /^(?:add\s+)?note(?:\s+for)?\s+(.+)$/, intent: 'add-note', target: 1 },
    { regex: /^table\s+(\d+|[a-z].*)$/i, intent: 'search-table', target: 1 },
    { regex: /^(?:find\s+)?available\s+table$/, intent: 'find-available-table' },
    { regex: /^merge\s+tables?$/, intent: 'merge-tables' },
    { regex: /^split\s+tables?$/, intent: 'split-tables' },
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern.regex)
    if (!match) continue

    return {
      intent: pattern.intent,
      target: match[pattern.target] ?? null,
      guests: match[pattern.guests] ?? null,
    }
  }

  return null
}

function findReservationByGuestNeedle(reservations, todayKey, needle) {
  const query = `${needle ?? ''}`.trim().toLowerCase()
  if (!query) return null

  const todayReservations = getTodayReservations(reservations, todayKey)
  let bestMatch = null
  let bestScore = 0

  todayReservations.forEach((reservation) => {
    const guestName = formatReservationGuestName(reservation.guestName)
    const score = Math.max(
      commandPaletteFuzzyScore(query, guestName),
      commandPaletteFuzzyScore(query, `${reservation.phone ?? ''}`),
    )

    if (score > bestScore) {
      bestScore = score
      bestMatch = reservation
    }
  })

  return bestScore > 0 ? bestMatch : null
}

function findReservationByTableNeedle(reservations, todayKey, needle) {
  const tableKey = normalizeTableKey(needle)
  if (!tableKey) return null

  const todayReservations = getTodayReservations(reservations, todayKey)
  return todayReservations.find((reservation) => (
    normalizeTableKey(reservation.tableNumber) === tableKey
    && !isTerminalReservationStatus(reservation.status)
  )) ?? null
}

function findAvailableFloorTable(reservations, todayKey, nowMinutes, layout) {
  if (!layout?.tables?.length) return null

  const snapshot = buildFloorPlanSnapshot({
    layout,
    reservations: getTodayReservations(reservations, todayKey),
    todayKey,
    nowMinutes,
  })

  const available = snapshot.tableStates.find((entry) => entry.status === 'available')
  return available?.table ?? null
}

function buildCommandPaletteItems({
  query,
  reservations,
  todayKey,
  nowMinutes,
  layout,
}) {
  const items = []
  const trimmedQuery = `${query ?? ''}`.trim()
  const intent = parseCommandPaletteIntent(trimmedQuery)
  const todayReservations = getTodayReservations(reservations, todayKey)

  const pushItem = (item) => {
    items.push(item)
  }

  COMMAND_PALETTE_ACTIONS.forEach((action) => {
    const searchBlob = [action.label, action.subtitle, ...(action.keywords ?? [])].join(' ')
    const score = commandPaletteFuzzyScore(trimmedQuery, searchBlob)
    const intentBoost = intent?.intent === action.id ? 240 : 0

    if (!trimmedQuery || score > 0 || intentBoost > 0) {
      pushItem({
        id: action.id,
        kind: 'action',
        label: action.label,
        subtitle: action.subtitle,
        icon: action.icon,
        score: Math.max(score, intentBoost, trimmedQuery ? 0 : 40),
        actionId: action.id,
      })
    }
  })

  todayReservations.forEach((reservation) => {
    const guestName = formatReservationGuestName(reservation.guestName)
    const tableLabel = `${reservation.tableNumber ?? ''}`.trim() || '—'
    const status = getReservationDisplayStatus(reservation, nowMinutes, todayKey)
    const searchBlob = [
      guestName,
      reservation.phone,
      reservation.tableNumber,
      reservation.notes,
      status,
      reservation.time,
    ].join(' ')

    const score = commandPaletteFuzzyScore(trimmedQuery, searchBlob)
    if (!trimmedQuery || score > 0) {
      pushItem({
        id: `guest-${reservation.id}`,
        kind: 'guest',
        label: guestName,
        subtitle: `Table ${tableLabel} · ${formatTime24(reservation.time) || '—'} · ${status}`,
        icon: '👤',
        score: score || (trimmedQuery ? 0 : 20),
        reservation,
      })

      pushItem({
        id: `reservation-${reservation.id}`,
        kind: 'reservation',
        label: `${guestName} — ${formatTime24(reservation.time) || '—'}`,
        subtitle: `Reservation · Table ${tableLabel} · ${status}`,
        icon: '📅',
        score: Math.max(score - 4, 0) || (trimmedQuery ? 0 : 18),
        reservation,
      })
    }
  })

  ;(layout?.tables ?? []).forEach((table) => {
    const reservation = findReservationForFloorTable(table, todayReservations, todayKey)
    const status = getFloorTableStatus(reservation, nowMinutes, todayKey)
    const guestName = reservation ? formatReservationGuestName(reservation.guestName) : 'Available'
    const searchBlob = `table ${table.label} ${guestName} ${table.seats} seats ${status}`
    const score = commandPaletteFuzzyScore(trimmedQuery, searchBlob)
    const tableIntentBoost = intent?.intent === 'search-table' && normalizeTableKey(intent.target) === normalizeTableKey(table.label)
      ? 220
      : 0

    if (!trimmedQuery || score > 0 || tableIntentBoost > 0) {
      pushItem({
        id: `table-${table.id}`,
        kind: 'table',
        label: `Table ${table.label}`,
        subtitle: reservation
          ? `${guestName} · ${Number(reservation.guests) || 0}/${table.seats} · ${FLOOR_TABLE_STATUS_META[status]?.label || status}`
          : `Available · ${table.seats} seats`,
        icon: '🍽',
        score: Math.max(score, tableIntentBoost, trimmedQuery ? 0 : 12),
        table,
        reservation,
      })
    }
  })

  if (intent?.intent === 'create-walk-in') {
    const guestCount = Number(intent.guests) || 2
    pushItem({
      id: 'intent-walk-in',
      kind: 'intent',
      label: `Create walk-in · ${guestCount} guests`,
      subtitle: 'Quick walk-in reservation for right now',
      icon: '⚡',
      score: 300,
      intent,
    })
  }

  if (intent?.target) {
    const reservation = intent.intent === 'search-table'
      ? findReservationByTableNeedle(reservations, todayKey, intent.target)
      : findReservationByGuestNeedle(reservations, todayKey, intent.target)

    if (reservation) {
      pushItem({
        id: `intent-target-${reservation.id}-${intent.intent}`,
        kind: 'intent',
        label: `${intent.intent.replace(/-/g, ' ')} · ${formatReservationGuestName(reservation.guestName)}`,
        subtitle: `Table ${reservation.tableNumber || '—'} · ${getReservationDisplayStatus(reservation, nowMinutes, todayKey)}`,
        icon: '⚡',
        score: 280,
        intent,
        reservation,
      })
    }
  }

  return items
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 12)
}

function ReservationsCommandPalette({
  reservations,
  todayKey,
  nowMinutes,
  isSaving,
  onClose,
  onOpenAddReservation,
  onOpenQuickReservation,
  onOpenEditReservation,
  onQuickStatusUpdate,
  onOpenAddNote,
}) {
  const { layout } = usePublishedFloorPlan()
  const {
    selectReservation,
    setWorkspaceFocus,
  } = useReservationWorkspace()

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const items = useMemo(() => (
    buildCommandPaletteItems({
      query,
      reservations,
      todayKey,
      nowMinutes,
      layout,
    })
  ), [layout, nowMinutes, query, reservations, todayKey])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const activeItem = listRef.current?.querySelector('[data-command-active="true"]')
    activeItem?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, items])

  const runAction = useCallback(async (item) => {
    const close = () => onClose()

    if (item.kind === 'guest' || item.kind === 'reservation') {
      selectReservation(item.reservation, {
        scrollTimeline: true,
        scrollFloor: true,
        openGuestProfile: true,
      })
      close()
      return
    }

    if (item.kind === 'table') {
      if (item.reservation) {
        selectReservation(item.reservation, {
          scrollTimeline: true,
          scrollFloor: true,
          openGuestProfile: true,
        })
      } else {
        setWorkspaceFocus('floor')
        const tableNode = document.querySelector(`[data-table-id="${item.table.id}"]`)
        tableNode?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      }
      close()
      return
    }

    if (item.kind === 'intent') {
      if (item.intent?.intent === 'create-walk-in') {
        onOpenQuickReservation({
          guestName: 'Walk-in',
          guests: `${Number(item.intent.guests) || 2}`,
          time: formatTimelineSlotLabel(nowMinutes),
          tableNumber: '',
        })
        close()
        return
      }

      if (item.reservation) {
        const reservation = item.reservation

        if (item.intent.intent === 'seat-guest') {
          await onQuickStatusUpdate(reservation, 'Checked In')
          selectReservation(reservation, { scrollTimeline: true, scrollFloor: true, openGuestProfile: false })
          close()
          return
        }

        if (item.intent.intent === 'move-guest') {
          selectReservation(reservation, { scrollTimeline: true, scrollFloor: true, openGuestProfile: true })
          setWorkspaceFocus('floor')
          close()
          return
        }

        if (item.intent.intent === 'edit-reservation') {
          onOpenEditReservation(reservation)
          close()
          return
        }

        if (item.intent.intent === 'call-guest') {
          const phone = `${reservation.phone ?? ''}`.trim()
          if (phone) window.location.href = `tel:${phone}`
          selectReservation(reservation, { scrollTimeline: true, scrollFloor: true, openGuestProfile: true })
          close()
          return
        }

        if (item.intent.intent === 'add-note') {
          onOpenAddNote(reservation)
          close()
          return
        }

        if (item.intent.intent === 'search-table') {
          selectReservation(reservation, { scrollTimeline: true, scrollFloor: true, openGuestProfile: true })
          close()
          return
        }
      }
    }

    const actionId = item.actionId
    const contextReservation = findReservationByGuestNeedle(reservations, todayKey, query)
      || findReservationByTableNeedle(reservations, todayKey, query)

    if (actionId === 'create-reservation') {
      onOpenAddReservation()
      close()
      return
    }

    if (actionId === 'create-walk-in') {
      onOpenQuickReservation({
        guestName: 'Walk-in',
        guests: '2',
        time: formatTimelineSlotLabel(nowMinutes),
        tableNumber: '',
      })
      close()
      return
    }

    if (actionId === 'seat-guest') {
      const reservation = contextReservation
        || getTodayReservations(reservations, todayKey).find((entry) => (
          isUpcomingReservationStatus(normalizeReservationStatus(entry.status))
        ))
      if (reservation) {
        await onQuickStatusUpdate(reservation, 'Checked In')
        selectReservation(reservation, { scrollTimeline: true, scrollFloor: true, openGuestProfile: false })
      }
      close()
      return
    }

    if (actionId === 'move-guest' && contextReservation) {
      selectReservation(contextReservation, { scrollTimeline: true, scrollFloor: true, openGuestProfile: true })
      setWorkspaceFocus('floor')
      close()
      return
    }

    if (actionId === 'edit-reservation' && contextReservation) {
      onOpenEditReservation(contextReservation)
      close()
      return
    }

    if (actionId === 'call-guest' && contextReservation) {
      const phone = `${contextReservation.phone ?? ''}`.trim()
      if (phone) window.location.href = `tel:${phone}`
      selectReservation(contextReservation, { scrollTimeline: true, scrollFloor: true, openGuestProfile: true })
      close()
      return
    }

    if (actionId === 'add-note' && contextReservation) {
      onOpenAddNote(contextReservation)
      close()
      return
    }

    if (actionId === 'merge-tables' || actionId === 'split-tables') {
      setWorkspaceFocus('floor')
      close()
      return
    }

    if (actionId === 'find-available-table') {
      const table = findAvailableFloorTable(reservations, todayKey, nowMinutes, layout)
      setWorkspaceFocus('floor')
      if (table) {
        window.requestAnimationFrame(() => {
          document.querySelector(`[data-table-id="${table.id}"]`)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center',
          })
        })
      }
      close()
    }
  }, [
    layout,
    nowMinutes,
    onClose,
    onOpenAddNote,
    onOpenAddReservation,
    onOpenEditReservation,
    onOpenQuickReservation,
    onQuickStatusUpdate,
    query,
    reservations,
    selectReservation,
    setWorkspaceFocus,
    todayKey,
  ])

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, Math.max(items.length - 1, 0)))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }

    if (event.key === 'Enter' && items[activeIndex]) {
      event.preventDefault()
      runAction(items[activeIndex])
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Quick Actions"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="command-palette-input-wrap">
          <span className="command-palette-input-icon" aria-hidden="true">⚡</span>
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search guests, tables, reservations — or type a command"
            aria-label="Quick Actions search"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="command-palette-kbd">Esc</kbd>
        </div>

        <div className="command-palette-results" ref={listRef} role="listbox" aria-label="Quick Actions results">
          {items.length === 0 ? (
            <p className="command-palette-empty">No matching actions or records.</p>
          ) : (
            items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                data-command-active={index === activeIndex ? 'true' : 'false'}
                className={`command-palette-item${index === activeIndex ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => runAction(item)}
                disabled={isSaving}
              >
                <span className="command-palette-item-icon" aria-hidden="true">{item.icon}</span>
                <span className="command-palette-item-copy">
                  <strong>{item.label}</strong>
                  <span>{item.subtitle}</span>
                </span>
              </button>
            ))
          )}
        </div>

        <footer className="command-palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>Enter</kbd> Run</span>
          <span><kbd>Esc</kbd> Close</span>
        </footer>
      </div>
    </div>
  )
}

const FLOOR_PLAN_FUTURE_MODULES = {
  waiterZones: null,
  aiSeating: null,
  tableTimers: null,
  heatMap: null,
  cleaningQueue: null,
}

const FLOOR_TABLE_STATUS_META = {
  available: { label: 'Available', tone: 'available' },
  upcoming: { label: 'Upcoming', tone: 'confirmed' },
  booked: { label: 'Booked', tone: 'booked' },
  confirmed: { label: 'Confirmed', tone: 'confirmed' },
  arrived: { label: 'Waiting', tone: 'arrived' },
  seated: { label: 'Seated', tone: 'seated' },
  'checked-in': { label: 'Checked In', tone: 'checked-in' },
  'checked-in-partial': { label: 'Checked In (Partial)', tone: 'checked-in-partial' },
  dining: { label: 'Dining', tone: 'dining' },
  cleaning: { label: 'Needs Cleaning', tone: 'cleaning' },
}

const FLOOR_PLAN_VIEW_MODES = [
  { id: 'normal', label: 'Normal' },
  { id: 'heatmap', label: 'Heatmap' },
]

const FLOOR_HEATMAP_PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last-7-days', label: 'Last 7 Days' },
  { id: 'last-30-days', label: 'Last 30 Days' },
  { id: 'custom', label: 'Custom' },
]

const FLOOR_HEATMAP_TIERS = [
  { id: 'very-light', label: '0–20%', min: 0, max: 20 },
  { id: 'light', label: '20–40%', min: 20, max: 40 },
  { id: 'amber', label: '40–60%', min: 40, max: 60 },
  { id: 'orange', label: '60–80%', min: 60, max: 80 },
  { id: 'deep-gold', label: '80–100%', min: 80, max: 100 },
]

const FLOOR_HEATMAP_TURNS_PER_DAY = 5

function addDaysToDateKey(dateKey, deltaDays) {
  const date = parseLocalDate(dateKey)
  date.setDate(date.getDate() + deltaDays)
  return formatLocalDateKey(date)
}

function countDaysInclusive(startKey, endKey) {
  const start = parseLocalDate(startKey)
  const end = parseLocalDate(endKey)
  const diffMs = end.getTime() - start.getTime()
  return Math.max(1, Math.floor(diffMs / 86_400_000) + 1)
}

function getFloorHeatmapDateRange(periodId, todayKey, customRange = {}) {
  switch (periodId) {
    case 'yesterday': {
      const key = addDaysToDateKey(todayKey, -1)
      return { startKey: key, endKey: key, dayCount: 1, label: 'Yesterday' }
    }
    case 'last-7-days':
      return {
        startKey: addDaysToDateKey(todayKey, -6),
        endKey: todayKey,
        dayCount: 7,
        label: 'Last 7 Days',
      }
    case 'last-30-days':
      return {
        startKey: addDaysToDateKey(todayKey, -29),
        endKey: todayKey,
        dayCount: 30,
        label: 'Last 30 Days',
      }
    case 'custom': {
      const startKey = customRange.startKey || todayKey
      const endKey = customRange.endKey || todayKey
      const normalizedStart = startKey <= endKey ? startKey : endKey
      const normalizedEnd = startKey <= endKey ? endKey : startKey
      return {
        startKey: normalizedStart,
        endKey: normalizedEnd,
        dayCount: countDaysInclusive(normalizedStart, normalizedEnd),
        label: 'Custom',
      }
    }
    case 'today':
    default:
      return { startKey: todayKey, endKey: todayKey, dayCount: 1, label: 'Today' }
  }
}

function isHeatmapCountableReservation(reservation) {
  return !isTerminalReservationStatus(reservation.status)
    || normalizeReservationStatus(reservation.status) === 'Checked Out'
}

function estimateReservationDiningMinutes(reservation) {
  const status = normalizeReservationStatus(reservation.status)

  if (status === 'Checked In') return 105
  if (status === 'Checked In (Partial)') return 78
  if (status === 'Checked Out') return 102
  if (status === 'Waiting' || status === 'Confirmed') return 68
  return 58
}

function getHeatmapUtilizationTier(utilizationPercent) {
  if (utilizationPercent < 20) return 'very-light'
  if (utilizationPercent < 40) return 'light'
  if (utilizationPercent < 60) return 'amber'
  if (utilizationPercent < 80) return 'orange'
  return 'deep-gold'
}

function formatHeatmapDuration(minutes) {
  const safeMinutes = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safeMinutes / 60)
  const remainder = safeMinutes % 60

  if (hours === 0) return `${remainder}m`
  return `${hours}h ${String(remainder).padStart(2, '0')}m`
}

function buildFloorHeatmapAnalytics({
  allReservations,
  layout,
  periodRange,
  todayKey,
}) {
  if (!layout?.tables?.length) return []

  const { startKey, endKey, dayCount } = periodRange
  const periodCapacity = Math.max(dayCount * FLOOR_HEATMAP_TURNS_PER_DAY, 1)

  const metricsByTableId = Object.fromEntries(
    layout.tables.map((table) => [
      table.id,
      {
        tableId: table.id,
        label: table.label,
        visits: 0,
        todaysVisits: 0,
        guestTotal: 0,
        diningMinutesTotal: 0,
        utilizationPercent: 0,
        tier: 'very-light',
        avgPartySize: 0,
        avgDiningMinutes: 0,
      },
    ]),
  )

  allReservations.forEach((reservation) => {
    if (!isHeatmapCountableReservation(reservation)) return

    const dateKey = `${reservation.date ?? ''}`.slice(0, 10)
    if (!dateKey || dateKey < startKey || dateKey > endKey) return

    const table = layout.tables.find((entry) => (
      normalizeTableKey(entry.label) === normalizeTableKey(reservation.tableNumber)
    ))
    if (!table) return

    const metric = metricsByTableId[table.id]
    metric.visits += 1
    metric.guestTotal += Number(reservation.guests) || 0
    metric.diningMinutesTotal += estimateReservationDiningMinutes(reservation)

    if (dateKey === todayKey) {
      metric.todaysVisits += 1
    }
  })

  return layout.tables.map((table) => {
    const metric = metricsByTableId[table.id]
    const utilizationPercent = Math.min(
      100,
      Math.round((metric.visits / periodCapacity) * 100),
    )

    return {
      ...metric,
      utilizationPercent,
      tier: getHeatmapUtilizationTier(utilizationPercent),
      avgPartySize: metric.visits > 0
        ? Math.round((metric.guestTotal / metric.visits) * 10) / 10
        : 0,
      avgDiningMinutes: metric.visits > 0
        ? Math.round(metric.diningMinutesTotal / metric.visits)
        : 0,
    }
  })
}

function normalizeTableKey(value) {
  return normalizeUnitKey(value)
}

function findReservationForFloorTable(table, reservations, todayKey, options = {}) {
  const { syncWithList = false } = options
  const matches = reservations.filter((reservation) => {
    if (!syncWithList && getReservationDateKey(reservation) !== todayKey) return false
    if (!reservationOccupiesFloorTables(reservation.status)) return false
    return reservationUsesSeatingUnit(reservation, table)
  })

  if (matches.length === 0) return null

  return [...matches].sort((left, right) => (
    getFloorTableStatusPriority(right) - getFloorTableStatusPriority(left)
  ))[0]
}

function getTableIdForReservation(reservation, layout) {
  const assignment = getReservationSeatingAssignment(reservation)
  if (assignment?.assignedUnits?.length > 0 && layout?.tables?.length) {
    const matchedTable = layout.tables.find((entry) => (
      assignment.assignedUnits.some((unit) => seatingUnitMatchesFloorUnit(unit, entry))
    ))
    if (matchedTable) return matchedTable.id
  }

  const tableKey = normalizeTableKey(reservation?.tableNumber)
  if (!tableKey || !layout?.tables?.length) return null

  const table = layout.tables.find((entry) => (
    normalizeTableKey(entry.label) === tableKey
      || normalizeTableKey(entry.displayLabel) === tableKey
  ))

  return table?.id ?? null
}

function getFloorTableStatus(reservation, nowMinutes, todayKey, options = {}) {
  return getFloorTableVisualStatus(reservation, nowMinutes, todayKey, options)
}

function buildFloorPlanOccupancyStats(tableStates) {
  const total = tableStates.length
  const occupied = tableStates.filter((entry) => (
    !['available', 'cleaning', 'upcoming'].includes(entry.status)
  )).length
  const available = tableStates.filter((entry) => (
    entry.status === 'available' || entry.status === 'upcoming'
  )).length
  const cleaning = tableStates.filter((entry) => entry.status === 'cleaning').length

  return {
    total,
    occupied,
    available,
    cleaning,
    occupancyPercent: total > 0 ? Math.round((occupied / total) * 100) : 0,
  }
}

function buildFloorPlanLiveStats(tableStates, reservations, todayKey, nowMinutes) {
  const occupancy = buildFloorPlanOccupancyStats(tableStates)
  let guestsInside = 0
  let upcomingArrivals = 0
  let reservationsWaiting = 0

  reservations.forEach((reservation) => {
    const status = normalizeReservationStatus(reservation.status)
    const guests = Number(reservation.guests) || 0
    const arrivalMinutes = parseTimeToMinutes(reservation.time)

    if (isReservationInHouseStatus(status)) {
      guestsInside += guests
    }

    if (isUpcomingReservationStatus(status) && arrivalMinutes !== null && arrivalMinutes >= nowMinutes) {
      upcomingArrivals += 1
    }

    if (isReservationLate(reservation, nowMinutes, todayKey)) {
      reservationsWaiting += 1
      return
    }

    if (status === 'Confirmed' && arrivalMinutes !== null && arrivalMinutes <= nowMinutes) {
      reservationsWaiting += 1
    }
  })

  return {
    ...occupancy,
    guestsInside,
    upcomingArrivals,
    reservationsWaiting,
  }
}

function getFloorZoneIdForReservation(reservation, layout) {
  const tableId = getTableIdForReservation(reservation, layout)
  if (!tableId) return layout?.zones?.[0]?.id ?? null

  const table = layout?.tables?.find((entry) => entry.id === tableId)
  return table?.zoneId ?? layout?.zones?.[0]?.id ?? null
}

function getAdjacentFloorZoneId(zones, activeZoneId, direction) {
  if (!zones.length) return activeZoneId

  const currentIndex = zones.findIndex((zone) => zone.id === activeZoneId)
  const safeIndex = currentIndex < 0 ? 0 : currentIndex
  const nextIndex = direction === 'next'
    ? (safeIndex + 1) % zones.length
    : (safeIndex - 1 + zones.length) % zones.length

  return zones[nextIndex]?.id ?? activeZoneId
}

function getTimelineNowPositionPercent(rows, nowMinutes) {
  if (rows.length === 0) return 0

  const anchors = []

  rows.forEach((row, index) => {
    if (row.type === 'hour') {
      anchors.push({ minutes: row.hour * 60, index })
    }

    if (row.type === 'card') {
      const minutes = parseTimeToMinutes(row.reservation.time)
      if (minutes !== null) anchors.push({ minutes, index })
    }

    if (row.type === 'now') {
      anchors.push({ minutes: nowMinutes, index })
    }
  })

  if (anchors.length === 0) {
    const serviceStart = RESERVATION_SERVICE_HOURS[0] * 60
    const serviceEnd = (RESERVATION_SERVICE_HOURS[RESERVATION_SERVICE_HOURS.length - 1] + 1) * 60
    const ratio = (nowMinutes - serviceStart) / (serviceEnd - serviceStart)
    return Math.min(100, Math.max(0, ratio * 100))
  }

  anchors.sort((left, right) => left.minutes - right.minutes)

  if (nowMinutes <= anchors[0].minutes) {
    return (anchors[0].index / Math.max(rows.length - 1, 1)) * 100
  }

  if (nowMinutes >= anchors[anchors.length - 1].minutes) {
    return (anchors[anchors.length - 1].index / Math.max(rows.length - 1, 1)) * 100
  }

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const left = anchors[index]
    const right = anchors[index + 1]

    if (nowMinutes >= left.minutes && nowMinutes <= right.minutes) {
      const span = right.minutes - left.minutes || 1
      const ratio = (nowMinutes - left.minutes) / span
      const rowIndex = left.index + ((right.index - left.index) * ratio)
      return (rowIndex / Math.max(rows.length - 1, 1)) * 100
    }
  }

  return 0
}

function buildFloorPlanSnapshot({
  layout,
  reservations,
  todayKey,
  nowMinutes,
  cleaningFlags = new Set(),
  syncWithList = false,
  debugAssignments = false,
}) {
  if (!layout?.tables?.length) {
    return {
      layout: layout ?? { id: 'empty', name: 'AMORE', zones: [], tables: [], units: [] },
      tableStates: [],
      stats: buildFloorPlanLiveStats([], reservations, todayKey, nowMinutes),
    }
  }

  const enrichedReservations = reservations.map((reservation) => (
    enrichReservationWithSeatingAssignment(reservation)
  ))

  if (debugAssignments) {
    debugFloorAssignmentSnapshot({
      layout,
      reservations: enrichedReservations,
      todayKey,
      syncWithList,
    })
  }

  const reservationByTableId = buildFloorTableReservationMap({
    layout,
    reservations: enrichedReservations,
    todayKey,
    syncWithList,
    debug: debugAssignments,
  })

  const floorUnits = layout?.tables ?? layout?.units ?? []

  const tableStates = layout.tables.map((table) => {
    const tableReservations = getReservationsForFloorTable(
      table,
      enrichedReservations,
      todayKey,
      { syncWithList, floorUnits },
    )
    const operational = resolveFloorTableOperationalState(
      tableReservations,
      nowMinutes,
      todayKey,
      { needsCleaning: cleaningFlags.has(table.id) },
    )
    const reservation = operational.displayReservation
      ?? operational.activeReservation
      ?? reservationByTableId.get(table.id)
      ?? findReservationForFloorTable(table, enrichedReservations, todayKey, { syncWithList })
    const status = operational.floorStatus

    return {
      table,
      reservation,
      status,
      operational,
      meta: {
        zoneId: table.zoneId,
        waiterZone: table.zoneId,
        timer: null,
        aiSuggestion: null,
        heatMap: null,
        cleaningQueue: null,
        future: FLOOR_PLAN_FUTURE_MODULES,
      },
    }
  })

  return {
    layout,
    tableStates,
    stats: buildFloorPlanLiveStats(tableStates, reservations, todayKey, nowMinutes),
  }
}

function FloorPlanLegend() {
  return (
    <div className="floor-plan-legend" aria-label="Table status legend">
      {Object.values(FLOOR_TABLE_STATUS_META).map((entry) => (
        <span key={entry.tone} className={`floor-plan-legend-item tone-${entry.tone}`}>
          <span className="floor-plan-legend-swatch" aria-hidden="true" />
          {entry.label}
        </span>
      ))}
    </div>
  )
}

function FloorHeatmapLegend() {
  return (
    <div className="floor-plan-legend floor-heatmap-legend" aria-label="Utilization legend">
      {FLOOR_HEATMAP_TIERS.map((tier) => (
        <span key={tier.id} className={`floor-plan-legend-item heatmap-tier-${tier.id}`}>
          <span className="floor-plan-legend-swatch" aria-hidden="true" />
          {tier.label}
        </span>
      ))}
    </div>
  )
}

function FloorPlanViewModeToggle({ value, onChange }) {
  return (
    <div className="floor-plan-view-toggle" role="tablist" aria-label="Floor plan view mode">
      {FLOOR_PLAN_VIEW_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="tab"
          aria-selected={value === mode.id}
          className={`floor-plan-view-toggle-btn${value === mode.id ? ' is-active' : ''}`}
          onClick={() => onChange(mode.id)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  )
}

function FloorHeatmapPeriodFilter({
  periodId,
  customStart,
  customEnd,
  onPeriodChange,
  onCustomStartChange,
  onCustomEndChange,
}) {
  return (
    <div className="floor-heatmap-period-filter" aria-label="Heatmap time period">
      <div className="floor-heatmap-period-chips">
        {FLOOR_HEATMAP_PERIODS.map((period) => (
          <button
            key={period.id}
            type="button"
            className={`floor-heatmap-period-chip${periodId === period.id ? ' is-active' : ''}`}
            onClick={() => onPeriodChange(period.id)}
          >
            {period.label}
          </button>
        ))}
      </div>
      {periodId === 'custom' ? (
        <div className="floor-heatmap-custom-range">
          <label className="floor-heatmap-date-field">
            <span>From</span>
            <input
              type="date"
              value={customStart}
              onChange={(event) => onCustomStartChange(event.target.value)}
            />
          </label>
          <label className="floor-heatmap-date-field">
            <span>To</span>
            <input
              type="date"
              value={customEnd}
              onChange={(event) => onCustomEndChange(event.target.value)}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}

function FloorPlanLiveStats({ stats }) {
  return (
    <div className="floor-plan-live-stats" aria-label="Live floor statistics">
      <div className="floor-plan-occupancy-metric">
        <span>Occupied</span>
        <strong>{stats.occupied}</strong>
      </div>
      <div className="floor-plan-occupancy-metric">
        <span>Available</span>
        <strong>{stats.available}</strong>
      </div>
      <div className="floor-plan-occupancy-metric floor-plan-occupancy-highlight">
        <span>Occupancy</span>
        <strong>{stats.occupancyPercent}%</strong>
      </div>
      <div className="floor-plan-occupancy-metric">
        <span>Guests inside</span>
        <strong>{stats.guestsInside}</strong>
      </div>
      <div className="floor-plan-occupancy-metric">
        <span>Upcoming</span>
        <strong>{stats.upcomingArrivals}</strong>
      </div>
      <div className="floor-plan-occupancy-metric">
        <span>Waiting</span>
        <strong>{stats.reservationsWaiting}</strong>
      </div>
    </div>
  )
}

function TimelineLiveNowRail({ positionPercent, nowMinutes, todayKey }) {
  return (
    <div
      className="timeline-live-now-rail"
      style={{ '--timeline-now-top': `${positionPercent}%` }}
      aria-hidden="true"
    >
      <div className="timeline-live-now-rail-line" />
      <div className="timeline-live-now-rail-marker">
        <span className="timeline-live-now-rail-dot" />
        <span className="timeline-live-now-rail-label">NOW</span>
        <time dateTime={`${todayKey}T${formatTimelineSlotLabel(nowMinutes)}`}>
          {formatTimelineSlotLabel(nowMinutes)}
        </time>
      </div>
    </div>
  )
}

function FloorTableContextMenu({ menu, mergedGroup, onClose, onSplitPlaceholder }) {
  if (!menu) return null

  return (
    <>
      <button type="button" className="floor-plan-context-backdrop" onClick={onClose} aria-label="Close table menu" />
      <div
        className="floor-plan-context-menu"
        style={{ left: menu.x, top: menu.y }}
        role="menu"
      >
        <button
          type="button"
          role="menuitem"
          disabled={!mergedGroup}
          onClick={onSplitPlaceholder}
          title={mergedGroup ? 'Split merged tables' : 'Select merged tables first'}
        >
          Split table
        </button>
        <button type="button" role="menuitem" onClick={onClose}>Close</button>
      </div>
    </>
  )
}

function FloorTableNode({
  tableState,
  allReservations = [],
  floorUnits = [],
  syncWithList = false,
  todayKey,
  nowMinutes,
  viewMode = 'normal',
  heatmapMetrics = null,
  isAnalyticsOpen = false,
  onAnalyticsToggle,
  isMergeSelected,
  isSeatPicking = false,
  isDropTarget,
  isDragging,
  isStatusPulsing,
  isHostFloor = false,
  linkMeta = null,
  nodeRef,
  tooltipDismissVersion = 0,
  onTableClick,
  onTableContextMenu,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}) {
  const { isSelected, selectionPulseKey, seatingDraftUnitIds, hostEditUnitIds, isHostFloorPickActive } = useReservationWorkspace()
  const { table, reservation, status, operational } = tableState
  const isHeatmap = viewMode === 'heatmap'

  const tableSchedule = useMemo(() => {
    if (!isHostFloor || isHeatmap) return []
    return getReservationsForFloorTable(table, allReservations, todayKey, {
      floorUnits,
      syncWithList,
    })
  }, [allReservations, floorUnits, isHeatmap, isHostFloor, syncWithList, table, todayKey])

  const hostOperational = isHostFloor && !isHeatmap ? operational : null
  const hostVisualIndicator = hostOperational?.hostIndicator ?? null
  const tableStatusClass = isHostFloor && !isHeatmap && hostVisualIndicator
    ? `host-indicator-${hostVisualIndicator}`
    : `status-${status}`
  const showHostVisualDot = Boolean(
    hostVisualIndicator
    && ['confirmed', 'waiting', 'seated', 'finished', 'late'].includes(hostVisualIndicator),
  )
  const displayReservation = hostOperational?.displayReservation ?? reservation
  const guestName = displayReservation ? formatReservationGuestName(displayReservation.guestName) : null
  const guestCount = displayReservation ? Number(displayReservation.guests) || 0 : 0
  const arrivalTime = displayReservation ? formatTime24(displayReservation.time) || '—' : null
  const guestType = displayReservation
    ? (isReservationVip(displayReservation) ? 'VIP' : 'Regular')
    : null
  const statusLabel = displayReservation
    ? getReservationStatusBadgeLabel(displayReservation, nowMinutes, todayKey)
    : FLOOR_TABLE_STATUS_META[status]?.label || status
  const tableIsSelected = !isHeatmap && displayReservation ? isSelected(displayReservation) : false
  const isPickedForSeating = seatingDraftUnitIds.includes(table.id)
    || (isHostFloorPickActive && hostEditUnitIds.includes(table.id))
  const isUnavailable = !isHeatmap && (
    isHostFloor
      ? isFloorTablePhysicallyOccupied(hostOperational) || status === 'cleaning'
      : status !== 'available' && status !== 'cleaning'
  )
  const unitLabel = table.displayLabel ?? (table.unitType === 'table' ? `Table ${table.label}` : table.label)
  const seatCapacity = Number(table.maxGuestCapacity ?? table.seats) || 0
  const capacityLabel = table.maxGuestCapacity && table.maxGuestCapacity !== table.seats
    ? `${table.seats} stools · max ${table.maxGuestCapacity}`
    : `${table.seats} seats`
  const isLargeCapacity = !guestName && seatCapacity > 20
  const seatedDurationLabel = displayReservation && isHostFloor
    && hostOperational?.phase === 'seated'
    ? getSeatedDurationLabel(displayReservation, nowMinutes, todayKey)
    : null
  const reservationTooltipMeta = reservation && guestName
    ? formatHostFloorReservationTooltipMeta(reservation, { guestType })
    : null
  const reservationTooltipSchedule = arrivalTime
    ? `${arrivalTime} · ${guestCount} guests`
    : `${guestCount} guests`
  const showCompactLinkedLabel = Boolean(
    guestName && isHostFloor && linkMeta?.isMultiLinked && !linkMeta?.isLinkPrimary,
  )
  const publishedLayout = isHostFloor
    ? getPublishedTableLayoutStyle(table)
    : { style: {}, hasPublishedSize: false }
  const nodeStyle = isHostFloor
    ? {
      ...publishedLayout.style,
    }
    : {
      left: `${table.x}%`,
      top: `${table.y}%`,
      ...(table.widthPercent ? {
        '--floor-table-width': `${table.widthPercent}%`,
        '--floor-table-height': `${table.heightPercent ?? table.widthPercent}%`,
      } : {}),
      ...(table.rotation
        ? { transform: `translate(-50%, -50%) rotate(${table.rotation}deg)` }
        : {}),
    }
  const usesPublishedSize = isHostFloor
    ? publishedLayout.hasPublishedSize
    : Boolean(table.widthPercent)

  const tableNodeRef = useRef(null)
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)

  const tableBookingEntries = useMemo(() => (
    tableSchedule.slice(0, 3).map((entry, index) => ({
      id: `${entry.id}-${index}`,
      time: formatTime24(entry.time),
      guestName: formatReservationGuestName(entry.guestName ?? entry.name),
    }))
  ), [tableSchedule])

  const tableBookingTimesLabel = tableBookingEntries
    .map((entry) => `${entry.time} ${entry.guestName}`)
    .join(', ')

  const hasMultipleTableBookings = isHostFloor && tableSchedule.length > 1
  const showUpcomingLabel = Boolean(
    isHostFloor
    && hostOperational?.phase === 'upcoming'
    && hostOperational.nextReservationTime
    && !hasMultipleTableBookings,
  )
  const showActiveGuestLabel = Boolean(
    guestName
    && isHostFloor
    && (hostOperational?.phase === 'seated' || hostOperational?.phase === 'waiting')
    && !showCompactLinkedLabel,
  )
  const draggableReservation = isHostFloor
    ? (hostOperational?.phase === 'seated' ? displayReservation : null)
    : reservation

  useEffect(() => {
    setIsTooltipVisible(false)
  }, [tooltipDismissVersion])

  const assignNodeRef = useCallback((node) => {
    tableNodeRef.current = node
    if (nodeRef) nodeRef(node)
  }, [nodeRef])

  const handlePointerEnter = () => {
    setIsTooltipVisible(true)
  }

  const handlePointerLeave = () => {
    setIsTooltipVisible(false)
  }

  const handleDragStartWrapped = (event) => {
    setIsTooltipVisible(false)
    onDragStart(event, tableState)
  }

  const handleClick = (event) => {
    setIsTooltipVisible(false)
    if (isHeatmap) {
      event.stopPropagation()
      onAnalyticsToggle?.(table.id)
      return
    }

    onTableClick(tableState, event)
  }

  return (
    <div
      ref={assignNodeRef}
      className={`floor-table-node shape-${table.shape}${isHeatmap ? ` view-heatmap heatmap-tier-${heatmapMetrics?.tier || 'very-light'}` : ` ${tableStatusClass}`}${isMergeSelected ? ' is-merge-selected' : ''}${isSeatPicking ? ' is-seat-picking' : ''}${isPickedForSeating ? ' is-seat-selected' : ''}${isUnavailable && isSeatPicking ? ' is-seat-unavailable' : ''}${isDropTarget ? ' is-drop-target' : ''}${isDragging ? ' is-dragging' : ''}${tableIsSelected ? ' is-selected is-synced' : ''}${isStatusPulsing ? ` is-status-pulse ${tableStatusClass}` : ''}${isAnalyticsOpen ? ' is-analytics-open' : ''}${linkMeta?.isMultiLinked ? ' is-multi-linked' : ''}${linkMeta?.colorClass ? ` ${linkMeta.colorClass}` : ''}${linkMeta?.isLinkPrimary ? ' is-link-primary' : ''}${usesPublishedSize ? (isHostFloor ? ' has-published-layout' : ' has-custom-size') : ''}`}
      style={nodeStyle}
      data-table-id={table.id}
      data-selection-pulse={tableIsSelected ? selectionPulseKey : undefined}
      draggable={!isHeatmap && Boolean(draggableReservation)}
      onDragStart={handleDragStartWrapped}
      onDragEnd={onDragEnd}
      onDragOver={(event) => onDragOver(event, tableState)}
      onDragLeave={onDragLeave}
      onDrop={(event) => onDrop(event, tableState)}
      onClick={handleClick}
      onContextMenu={(event) => onTableContextMenu(event, tableState)}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      role="button"
      tabIndex={0}
      aria-label={isHeatmap
        ? `${unitLabel}, ${heatmapMetrics?.utilizationPercent ?? 0}% utilization`
        : hasMultipleTableBookings
          ? `${unitLabel}, ${tableSchedule.length} bookings, ${tableBookingTimesLabel}`
          : showUpcomingLabel
            ? `${unitLabel}, next reservation ${hostOperational.nextReservationTime}`
            : `${unitLabel}${showActiveGuestLabel ? `, ${guestName}` : ', available'}`}
      aria-current={tableIsSelected ? 'true' : undefined}
      aria-expanded={isHeatmap ? isAnalyticsOpen : undefined}
    >
      <div className="floor-table-node-surface">
        {showHostVisualDot ? (
          <span
            className={`host-reservation-visual-dot floor-table-status-dot is-${hostVisualIndicator}`}
            aria-hidden="true"
          />
        ) : null}
        {linkMeta?.isMultiLinked ? (
          <span className="floor-table-linked-indicator" aria-hidden="true" aria-label="Linked tables">⛓</span>
        ) : null}
        {isHostFloor || !guestName || showCompactLinkedLabel ? (
          <span className="floor-table-number">
            {isHostFloor ? unitLabel.toUpperCase() : unitLabel}
          </span>
        ) : null}
        {isHeatmap ? (
          <span className="floor-table-heatmap-value">{heatmapMetrics?.utilizationPercent ?? 0}%</span>
        ) : hasMultipleTableBookings ? (
          <div className="floor-table-multi-bookings">
            <span className="floor-table-booking-count">{tableSchedule.length} BOOKINGS</span>
            <span className="floor-table-booking-entries">
              {tableBookingEntries.map((entry) => (
                <span key={entry.id} className="floor-table-booking-entry">
                  <span className="floor-table-booking-time">{entry.time}</span>
                  <span className="floor-table-booking-guest">{entry.guestName}</span>
                </span>
              ))}
              {tableSchedule.length > 3 ? (
                <span className="floor-table-booking-entry is-more">
                  +{tableSchedule.length - 3} more
                </span>
              ) : null}
            </span>
          </div>
        ) : showUpcomingLabel ? (
          <div className="floor-table-next-booking">
            <span className="floor-table-next-label">Next</span>
            <span className="floor-table-next-time">{hostOperational.nextReservationTime}</span>
          </div>
        ) : showActiveGuestLabel ? (
          <span className="floor-table-guest">{guestName}</span>
        ) : guestName && !showCompactLinkedLabel && !isHostFloor ? (
          <div className="floor-table-assignment-copy">
            <span className="floor-table-guest">{guestName}</span>
            {seatedDurationLabel ? (
              <span className="floor-table-seated-duration floor-table-reservation-time">{seatedDurationLabel}</span>
            ) : (
              <span className="floor-table-time floor-table-reservation-time">{arrivalTime}</span>
            )}
            <span className="floor-table-capacity floor-table-reservation-guests">
              {`${guestCount} / ${table.maxGuestCapacity ?? table.seats}`}
            </span>
          </div>
        ) : (
          <span className={`floor-table-meta floor-table-meta-empty${isLargeCapacity ? ' is-large-capacity' : ''}`}>
            {isLargeCapacity ? (
              <span className="floor-table-capacity-compact">{seatCapacity} 👥</span>
            ) : capacityLabel}
          </span>
        )}
      </div>

      {isHeatmap ? (
        <div
          className={`floor-table-analytics-tooltip${isAnalyticsOpen ? ' is-pinned' : ''}`}
          role="tooltip"
          onClick={(event) => event.stopPropagation()}
        >
          <strong>Table {table.label}</strong>
          <div className="floor-table-analytics-row">
            <span>Occupancy</span>
            <strong>{heatmapMetrics?.utilizationPercent ?? 0}%</strong>
          </div>
          <div className="floor-table-analytics-row">
            <span>Today&apos;s visits</span>
            <strong>{heatmapMetrics?.todaysVisits ?? 0}</strong>
          </div>
          <div className="floor-table-analytics-row">
            <span>Average dining time</span>
            <strong>{formatHeatmapDuration(heatmapMetrics?.avgDiningMinutes ?? 0)}</strong>
          </div>
          <div className="floor-table-analytics-row">
            <span>Average party size</span>
            <strong>{heatmapMetrics?.avgPartySize ?? 0}</strong>
          </div>
          <div className="floor-table-analytics-row floor-table-analytics-muted">
            <span>Revenue</span>
            <strong>Coming later</strong>
          </div>
        </div>
      ) : !isHostFloor && guestName ? (
        <FloorTableReservationTooltip
          guestName={guestName}
          scheduleLabel={reservationTooltipSchedule}
          metaLabel={reservationTooltipMeta}
          statusLabel={statusLabel}
          guestType={guestType}
          isLinked={Boolean(linkMeta?.isMultiLinked)}
          isVisible={isTooltipVisible}
          nodeRef={tableNodeRef}
        />
      ) : !isHostFloor ? (
        <div
          className={`floor-table-tooltip is-static${isTooltipVisible ? ' is-visible' : ''}`}
          role="tooltip"
        >
          <strong>{unitLabel}</strong>
          <span>Available · {capacityLabel}</span>
        </div>
      ) : null}
    </div>
  )
}

function FloorPlanAreaSwitcher({ zones, activeZoneId, onChange }) {
  const activeZone = zones.find((zone) => zone.id === activeZoneId) ?? zones[0]

  const switchZone = (direction) => {
    onChange(getAdjacentFloorZoneId(zones, activeZoneId, direction))
  }

  return (
    <div className="floor-plan-area-switcher" aria-label="Restaurant area">
      <button
        type="button"
        className="floor-plan-area-nav-btn"
        onClick={() => switchZone('prev')}
        aria-label="Previous area"
      >
        ‹
      </button>

      <label className="floor-plan-area-select">
        <span className="sr-only">Restaurant area</span>
        <select
          className="floor-plan-area-select-input"
          value={activeZoneId}
          onChange={(event) => onChange(event.target.value)}
        >
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>{zone.label}</option>
          ))}
        </select>
        <span className="floor-plan-area-select-chevron" aria-hidden="true">▾</span>
      </label>

      <button
        type="button"
        className="floor-plan-area-nav-btn"
        onClick={() => switchZone('next')}
        aria-label="Next area"
      >
        ›
      </button>

      <span className="floor-plan-area-current">{activeZone?.label}</span>
    </div>
  )
}

function FloorPlanView({
  reservations,
  allReservations,
  listReservations,
  todayKey,
  nowMinutes,
  isSaving,
  isCompact = false,
  onSeatGuestAtTable,
  onQuickStatusUpdate,
  onOpenAddReservation,
}) {
  const {
    clearSelection,
    selectedReservation,
    floorTableRefs,
    floorCanvasRef,
    activeFloorAreaId,
    setActiveFloorAreaId,
    draggingReservationId,
    setDraggingReservationId,
    clearDragState,
    layout,
    seatingDraftUnitIds,
    seatingExtraChairs,
    seatingStandingGuests,
    toggleSeatingUnit,
    startSeatingDraft,
    clearSeatingDraft,
    setSeatingExtraChairs,
    setSeatingStandingGuests,
    isHostFloorPickActive,
    toggleHostEditUnit,
    hostEditingReservation,
    openHostEdit,
    closeHostEdit,
    setFloorPlanMode,
    floorPlanMode,
  } = useReservationWorkspace()
  const { hasLayout } = usePublishedFloorPlan()
  const [dropTargetTableId, setDropTargetTableId] = useState(null)
  const [mergeSelection, setMergeSelection] = useState([])
  const [mergedGroups, setMergedGroups] = useState([])
  const [cleaningFlags, setCleaningFlags] = useState(() => new Set())
  const [contextMenu, setContextMenu] = useState(null)
  const [statusPulseTableIds, setStatusPulseTableIds] = useState(() => new Set())
  const [viewMode, setViewMode] = useState('normal')
  const [heatmapPeriodId, setHeatmapPeriodId] = useState('today')
  const [heatmapCustomStart, setHeatmapCustomStart] = useState(todayKey)
  const [heatmapCustomEnd, setHeatmapCustomEnd] = useState(todayKey)
  const [analyticsTableId, setAnalyticsTableId] = useState(null)
  const previousTableStatusesRef = useRef(new Map())
  const viewportRef = useRef(null)
  const floorPanStateRef = useRef({ x: 0, y: 0 })
  const floorPanDragRef = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 })
  const isManualFloorZoomRef = useRef(false)
  const [floorZoom, setFloorZoom] = useState(1)
  const [floorPan, setFloorPan] = useState({ x: 0, y: 0 })
  const [tooltipDismissVersion, setTooltipDismissVersion] = useState(0)
  const [scheduleCardTable, setScheduleCardTable] = useState(null)

  const dismissFloorTooltips = useCallback(() => {
    setTooltipDismissVersion((current) => current + 1)
    setScheduleCardTable(null)
  }, [])

  const clampFloorZoom = useCallback((value) => (
    Math.min(HOST_FLOOR_MAX_ZOOM, Math.max(HOST_FLOOR_MIN_ZOOM, value))
  ), [])

  floorPanStateRef.current = floorPan

  const handleFloorZoomIn = useCallback(() => {
    dismissFloorTooltips()
    isManualFloorZoomRef.current = true
    setFloorZoom((current) => clampFloorZoom(current + 0.12))
  }, [clampFloorZoom, dismissFloorTooltips])

  const handleFloorZoomOut = useCallback(() => {
    dismissFloorTooltips()
    isManualFloorZoomRef.current = true
    setFloorZoom((current) => clampFloorZoom(current - 0.12))
  }, [clampFloorZoom, dismissFloorTooltips])

  useEffect(() => {
    if (!isCompact) return undefined

    const viewport = viewportRef.current
    if (!viewport) return undefined

    const onWheel = (event) => {
      dismissFloorTooltips()
      if (!event.ctrlKey && !event.metaKey) return

      event.preventDefault()
      isManualFloorZoomRef.current = true
      const direction = event.deltaY < 0 ? 1 : -1
      setFloorZoom((current) => clampFloorZoom(current + direction * 0.12))
    }

    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [clampFloorZoom, dismissFloorTooltips, isCompact])

  useEffect(() => {
    if (!isCompact) return undefined

    const onMouseMove = (event) => {
      const drag = floorPanDragRef.current
      if (!drag.active) return

      setFloorPan({
        x: drag.originX + (event.clientX - drag.startX),
        y: drag.originY + (event.clientY - drag.startY),
      })
    }

    const onMouseUp = () => {
      floorPanDragRef.current.active = false
      viewportRef.current?.classList.remove('is-panning')
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isCompact])

  const handleViewportPanStart = (event) => {
    if (!isCompact) return
    if (event.button !== 0) return
    if (event.target.closest('.floor-table-node')) return

    dismissFloorTooltips()
    event.preventDefault()
    const pan = floorPanStateRef.current
    floorPanDragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    }
    viewportRef.current?.classList.add('is-panning')
  }

  const isHeatmap = viewMode === 'heatmap'
  const showHostSeatingBar = Boolean(
    selectedReservation
    && isCompact
    && !isHeatmap
    && !hostEditingReservation
    && !isHostFloorPickActive
  )

  const heatmapPeriodRange = useMemo(() => (
    getFloorHeatmapDateRange(heatmapPeriodId, todayKey, {
      startKey: heatmapCustomStart,
      endKey: heatmapCustomEnd,
    })
  ), [heatmapCustomEnd, heatmapCustomStart, heatmapPeriodId, todayKey])

  const heatmapAnalytics = useMemo(() => (
    buildFloorHeatmapAnalytics({
      allReservations,
      layout,
      periodRange: heatmapPeriodRange,
      todayKey,
    })
  ), [allReservations, heatmapPeriodRange, layout, todayKey])

  const heatmapMetricsByTableId = useMemo(() => (
    Object.fromEntries(heatmapAnalytics.map((entry) => [entry.tableId, entry]))
  ), [heatmapAnalytics])

  useEffect(() => {
    if (!isHeatmap) {
      setAnalyticsTableId(null)
    }
  }, [isHeatmap])

  const assignmentReservations = isCompact && listReservations?.length
    ? listReservations
    : allReservations

  const scheduleCardEntries = useMemo(() => {
    if (!scheduleCardTable) return []
    return buildFloorTableScheduleEntries(
      scheduleCardTable,
      assignmentReservations,
      todayKey,
      nowMinutes,
      {
        floorUnits: layout?.tables ?? layout?.units ?? [],
        syncWithList: isCompact,
      },
    )
  }, [
    assignmentReservations,
    isCompact,
    layout?.tables,
    layout?.units,
    nowMinutes,
    scheduleCardTable,
    todayKey,
  ])

  useEffect(() => {
    if (hostEditingReservation) {
      setScheduleCardTable(null)
    }
  }, [hostEditingReservation])

  const handleScheduleCardEdit = useCallback((reservation) => {
    setScheduleCardTable(null)
    openHostEdit(reservation)
  }, [openHostEdit])

  const handleScheduleCardSeatGuests = useCallback(async (reservation) => {
    if (!onQuickStatusUpdate || !reservation) return
    await onQuickStatusUpdate(reservation, 'Checked In')
  }, [onQuickStatusUpdate])

  const handleScheduleCardComplete = useCallback(async (reservation) => {
    if (!onQuickStatusUpdate || !reservation) return
    await onQuickStatusUpdate(reservation, 'Checked Out')
  }, [onQuickStatusUpdate])

  const handleScheduleCardNewReservation = useCallback(() => {
    if (!scheduleCardTable) return
    setScheduleCardTable(null)
    onOpenAddReservation?.({ table: scheduleCardTable, date: todayKey })
  }, [onOpenAddReservation, scheduleCardTable, todayKey])

  const floorPlanSnapshot = useMemo(() => (
    buildFloorPlanSnapshot({
      layout,
      reservations: assignmentReservations,
      todayKey,
      nowMinutes,
      cleaningFlags,
      syncWithList: isCompact,
      debugAssignments: isCompact && import.meta.env.DEV,
    })
  ), [assignmentReservations, cleaningFlags, isCompact, layout, nowMinutes, todayKey])

  const activeZone = useMemo(() => (
    floorPlanSnapshot.layout.zones.find((zone) => zone.id === activeFloorAreaId)
      ?? floorPlanSnapshot.layout.zones[0]
  ), [activeFloorAreaId, floorPlanSnapshot.layout.zones])

  const visibleTableStates = useMemo(() => (
    floorPlanSnapshot.tableStates.filter((tableState) => (
      tableState.table.zoneId === activeFloorAreaId
    ))
  ), [activeFloorAreaId, floorPlanSnapshot.tableStates])

  const reservationLinkGroups = useMemo(
    () => (isCompact && !isHeatmap ? buildReservationLinkGroups(visibleTableStates) : []),
    [isCompact, isHeatmap, visibleTableStates],
  )

  const reservationLinkTableMeta = useMemo(
    () => buildReservationLinkTableMeta(reservationLinkGroups),
    [reservationLinkGroups],
  )

  const applyHostFloorAutoFit = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const layoutSpace = viewport.querySelector('.floor-plan-layout-space')
    const tables = visibleTableStates.map((tableState) => tableState.table)
    const fit = computeHostFloorFit({
      tables,
      viewportWidth: layoutSpace?.clientWidth || viewport.clientWidth,
      viewportHeight: layoutSpace?.clientHeight || viewport.clientHeight,
    })

    setFloorZoom(fit.zoom)
    setFloorPan(fit.pan)
    isManualFloorZoomRef.current = false
  }, [visibleTableStates])

  const handleFloorZoomFit = useCallback(() => {
    dismissFloorTooltips()
    applyHostFloorAutoFit()
  }, [applyHostFloorAutoFit, dismissFloorTooltips])

  const handleFloorZoomReset = useCallback(() => {
    dismissFloorTooltips()
    setFloorZoom(1)
    setFloorPan({ x: 0, y: 0 })
    isManualFloorZoomRef.current = true
  }, [dismissFloorTooltips])

  useEffect(() => {
    if (!isCompact) return undefined

    dismissFloorTooltips()
    isManualFloorZoomRef.current = false
    applyHostFloorAutoFit()
  }, [activeFloorAreaId, applyHostFloorAutoFit, dismissFloorTooltips, floorPlanSnapshot.layout.id, floorPlanSnapshot.layout.publishedAt, isCompact])

  useEffect(() => {
    if (floorPlanMode === 'edit') {
      dismissFloorTooltips()
    }
  }, [dismissFloorTooltips, floorPlanMode])

  useEffect(() => {
    if (!isCompact) return undefined

    const viewport = viewportRef.current
    if (!viewport) return undefined

    const handleResize = () => {
      if (isManualFloorZoomRef.current) return
      applyHostFloorAutoFit()
    }

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(handleResize)
    })

    observer.observe(viewport)
    return () => observer.disconnect()
  }, [applyHostFloorAutoFit, isCompact])

  const hostFloorZoomTier = floorZoom < 0.65 ? 'minimal' : floorZoom < 0.82 ? 'compact' : 'normal'

  useEffect(() => {
    const previousStatuses = previousTableStatusesRef.current
    const nextPulseIds = new Set()
    const pulseStatuses = new Set(['booked', 'arrived', 'seated', 'dining'])

    floorPlanSnapshot.tableStates.forEach((tableState) => {
      const tableId = tableState.table.id
      const nextStatus = tableState.status
      const previousStatus = previousStatuses.get(tableId)

      if (
        previousStatus
        && previousStatus !== nextStatus
        && pulseStatuses.has(nextStatus)
      ) {
        nextPulseIds.add(tableId)
      }

      previousStatuses.set(tableId, nextStatus)
    })

    if (nextPulseIds.size === 0) return undefined

    setStatusPulseTableIds((current) => new Set([...current, ...nextPulseIds]))
    const timeoutId = window.setTimeout(() => {
      setStatusPulseTableIds((current) => {
        const next = new Set(current)
        nextPulseIds.forEach((tableId) => next.delete(tableId))
        return next
      })
    }, 2200)

    return () => window.clearTimeout(timeoutId)
  }, [floorPlanSnapshot.tableStates])

  const mergedGroupForMenu = useMemo(() => {
    if (!contextMenu?.tableId) return null
    return mergedGroups.find((group) => group.tableIds.includes(contextMenu.tableId)) || null
  }, [contextMenu, mergedGroups])

  const handleDragStart = (event, tableState) => {
    if (isHeatmap) {
      event.preventDefault()
      return
    }

    if (!tableState.reservation) {
      event.preventDefault()
      return
    }

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-reservation-id', String(tableState.reservation.id))
    setDraggingReservationId(String(tableState.reservation.id))
  }

  const handleDragEnd = () => {
    clearDragState()
    setDropTargetTableId(null)
  }

  const isReservationDragActive = (event) => (
    Boolean(draggingReservationId)
    || Array.from(event.dataTransfer?.types ?? []).includes('application/x-reservation-id')
  )

  const handleDragOver = (event, tableState) => {
    if (isHeatmap || !isReservationDragActive(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetTableId(tableState.table.id)
  }

  const handleDragLeave = () => {
    setDropTargetTableId(null)
  }

  const handleDrop = (event, tableState) => {
    event.preventDefault()
    if (isHeatmap) return

    setDropTargetTableId(null)
    clearDragState()

    const reservationId = event.dataTransfer.getData('application/x-reservation-id')
      || event.dataTransfer.getData('text/plain')
    if (!reservationId) return

    const reservation = reservations.find((entry) => String(entry.id) === reservationId)
      ?? allReservations.find((entry) => String(entry.id) === reservationId)
    if (!reservation) return

    if (
      tableState.reservation
      && String(tableState.reservation.id) !== String(reservation.id)
    ) {
      return
    }

    if (!['available', 'cleaning'].includes(tableState.status)) return

    if (hostEditingReservation && String(hostEditingReservation.id) === String(reservation.id)) {
      toggleHostEditUnit(tableState.table.id)
      return
    }

    const nextCleaningFlags = new Set(cleaningFlags)
    nextCleaningFlags.delete(tableState.table.id)
    setCleaningFlags(nextCleaningFlags)

    if (
      selectedReservation
      && String(selectedReservation.id) === String(reservation.id)
      && seatingDraftUnitIds.length > 0
    ) {
      toggleSeatingUnit(tableState.table.id)
      return
    }

    startSeatingDraft(reservation, tableState.table.id)
  }

  const handleTableClick = (tableState, event) => {
    if (isHeatmap) return

    if (event.shiftKey) {
      setMergeSelection((current) => {
        if (current.includes(tableState.table.id)) {
          return current.filter((id) => id !== tableState.table.id)
        }

        const next = [...current, tableState.table.id]
        if (next.length === 2) {
          setMergedGroups((groups) => ([
            ...groups,
            { id: `merge-${next.join('-')}`, tableIds: next },
          ]))
          return []
        }

        return next
      })
      return
    }

    if (
      isHostFloorPickActive
      && (tableState.status === 'available' || tableState.status === 'cleaning')
    ) {
      toggleHostEditUnit(tableState.table.id)
      return
    }

    if (!tableState.reservation && selectedReservation && tableState.status === 'available') {
      toggleSeatingUnit(tableState.table.id)
      return
    }

    if (!tableState.reservation && selectedReservation && tableState.status === 'cleaning') {
      toggleSeatingUnit(tableState.table.id)
      return
    }

    if (isCompact) {
      event.stopPropagation()
      setTooltipDismissVersion((current) => current + 1)
      setScheduleCardTable(tableState.table)
      return
    }

    if (tableState.reservation) {
      openHostEdit(tableState.reservation)
    }
  }

  const handleTableContextMenu = (event, tableState) => {
    event.preventDefault()
    setContextMenu({
      tableId: tableState.table.id,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const handleSplitPlaceholder = () => {
    if (!mergedGroupForMenu) return
    setMergedGroups((groups) => groups.filter((group) => group.id !== mergedGroupForMenu.id))
    setContextMenu(null)
  }

  const handleAnalyticsToggle = (tableId) => {
    setAnalyticsTableId((current) => (current === tableId ? null : tableId))
  }

  const handleCanvasClick = () => {
    dismissFloorTooltips()
    if (isHeatmap) {
      setAnalyticsTableId(null)
    }
  }

  const handleConfirmSeating = async (assignment) => {
    if (!selectedReservation || !onSeatGuestAtTable) return
    await onSeatGuestAtTable(selectedReservation, assignment)
    clearSelection()
  }

  const isSeatPicking = Boolean(
    (selectedReservation && !isHeatmap && isCompact)
    || isHostFloorPickActive,
  )

  if (!hasLayout) {
    return (
      <div className={`floor-plan-workspace${isCompact ? ' is-compact' : ''} floor-plan-empty-state`}>
        <div className="floor-plan-empty">
          <p className="eyebrow">Floor plan</p>
          <h3>No published layout</h3>
          <p>Open Reservations, click Edit layout, arrange your tables, then save.</p>
          <button type="button" className="floor-plan-empty-action" onClick={() => { closeHostEdit(); setFloorPlanMode('edit') }}>
            Edit layout
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`floor-plan-workspace${isCompact ? ' is-compact is-host-floor' : ''}${showHostSeatingBar && isCompact ? ' has-seating-drawer' : ''}${isHeatmap ? ' is-heatmap-mode' : ' is-normal-mode'}`} data-floor-view-mode={viewMode}>
      <div className="floor-plan-host-shell">
        <div className="floor-plan-host-main">
      <div className="floor-plan-toolbar">
        <div>
          {!isCompact ? <p className="eyebrow">Service layout</p> : null}
          {isCompact ? (
            <FloorPlanAreaSwitcher
              zones={floorPlanSnapshot.layout.zones}
              activeZoneId={activeFloorAreaId}
              onChange={setActiveFloorAreaId}
            />
          ) : (
            <h3>{floorPlanSnapshot.layout.name}</h3>
          )}
        </div>
        <div className="floor-plan-toolbar-actions">
          {!isCompact && !isHeatmap ? <FloorPlanLiveStats stats={floorPlanSnapshot.stats} /> : null}
          {!isCompact ? <FloorPlanViewModeToggle value={viewMode} onChange={setViewMode} /> : null}
          {isCompact && !isHeatmap ? (
            <div className="floor-plan-toolbar-actions-group">
              <button
                type="button"
                className="floor-plan-mode-btn"
                onClick={() => { closeHostEdit(); setFloorPlanMode('edit') }}
              >
                Edit layout
              </button>
              <div className="floor-plan-zoom-controls" aria-label="Floor plan zoom">
              <button type="button" className="floor-plan-zoom-btn" onClick={handleFloorZoomOut} aria-label="Zoom out">−</button>
              <span className="floor-plan-zoom-label">{Math.round(floorZoom * 100)}%</span>
              <button type="button" className="floor-plan-zoom-btn" onClick={handleFloorZoomIn} aria-label="Zoom in">+</button>
              <button type="button" className="floor-plan-zoom-btn floor-plan-zoom-fit" onClick={handleFloorZoomFit}>
                View fit
              </button>
              <button type="button" className="floor-plan-zoom-btn floor-plan-zoom-reset" onClick={handleFloorZoomReset}>
                Reset
              </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {!isCompact ? (
        <FloorPlanAreaSwitcher
          zones={floorPlanSnapshot.layout.zones}
          activeZoneId={activeFloorAreaId}
          onChange={setActiveFloorAreaId}
        />
      ) : null}

      {isHeatmap ? (
        <FloorHeatmapPeriodFilter
          periodId={heatmapPeriodId}
          customStart={heatmapCustomStart}
          customEnd={heatmapCustomEnd}
          onPeriodChange={setHeatmapPeriodId}
          onCustomStartChange={setHeatmapCustomStart}
          onCustomEndChange={setHeatmapCustomEnd}
        />
      ) : null}

      {!isCompact && !isHeatmap ? <FloorPlanLegend /> : null}
      {isHeatmap ? <FloorHeatmapLegend /> : null}

      {mergeSelection.length > 0 && !isHeatmap ? (
        <p className="floor-plan-merge-hint">
          Shift + click another table to merge · {mergeSelection.length}/2 selected
        </p>
      ) : null}

      <div
        className={`floor-plan-viewport${isCompact ? ' is-host-viewport' : ''}${floorZoom > 1.01 || Math.abs(floorPan.x) > 1 || Math.abs(floorPan.y) > 1 ? ' is-zoomed' : ''}`}
        ref={isCompact ? viewportRef : undefined}
        onMouseDown={isCompact ? handleViewportPanStart : undefined}
      >
        {isCompact ? (
          <div className="floor-plan-canvas-area-title" aria-label={`Area: ${activeZone?.label ?? 'Floor'}`}>
            {activeZone?.label}
          </div>
        ) : null}
        <div
          className="floor-plan-canvas-stage"
          data-floor-zoom-tier={isCompact ? hostFloorZoomTier : undefined}
          style={isCompact ? {
            transform: `translate(${floorPan.x}px, ${floorPan.y}px) scale(${floorZoom})`,
            '--floor-zoom': floorZoom,
          } : undefined}
        >
          <div
            className="floor-plan-canvas"
            ref={floorCanvasRef}
            data-floor-plan-layout={floorPlanSnapshot.layout.id}
            data-floor-area-id={activeFloorAreaId}
            data-view-mode={viewMode}
            data-seat-mode={selectedReservation && !isHeatmap && isCompact ? 'true' : 'false'}
            onClick={handleCanvasClick}
            onDragOver={(event) => {
              if (isReservationDragActive(event)) {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              }
            }}
          >
            <div
              className={`floor-plan-layout-space${isCompact ? ' is-published-layout' : ''}`}
              style={isCompact && activeZone ? getFloorLayoutSpaceStyle(activeZone) : undefined}
            >
        {!isHeatmap && activeZone ? (
          <div className={`floor-plan-zone zone-${activeZone.id} is-active-area`} aria-hidden="true">
          </div>
        ) : null}

        {mergedGroups.map((group) => (
          <div key={group.id} className="floor-plan-merge-bridge" aria-hidden="true" data-merge-id={group.id} />
        ))}

        {!isHeatmap ? (
          <FloorPlanReservationLinks linkGroups={reservationLinkGroups} />
        ) : null}

        {visibleTableStates.map((tableState) => (
          <FloorTableNode
            key={tableState.table.id}
            tableState={{
              ...tableState,
              meta: {
                ...tableState.meta,
                heatMap: heatmapMetricsByTableId[tableState.table.id] ?? null,
              },
            }}
            allReservations={assignmentReservations}
            floorUnits={floorPlanSnapshot.layout.tables ?? []}
            syncWithList={isCompact}
            todayKey={todayKey}
            nowMinutes={nowMinutes}
            viewMode={viewMode}
            heatmapMetrics={heatmapMetricsByTableId[tableState.table.id]}
            isAnalyticsOpen={analyticsTableId === tableState.table.id}
            onAnalyticsToggle={handleAnalyticsToggle}
            isStatusPulsing={!isHeatmap && statusPulseTableIds.has(tableState.table.id)}
            tooltipDismissVersion={tooltipDismissVersion}
            nodeRef={floorTableRefs?.current
              ? (node) => { floorTableRefs.current[tableState.table.id] = node }
              : undefined}
            isMergeSelected={mergeSelection.includes(tableState.table.id)
              || mergedGroups.some((group) => group.tableIds.includes(tableState.table.id))}
            isSeatPicking={isSeatPicking}
            isHostFloor={isCompact}
            linkMeta={reservationLinkTableMeta.get(tableState.table.id)}
            isDropTarget={dropTargetTableId === tableState.table.id}
            isDragging={draggingReservationId && tableState.reservation
              ? String(tableState.reservation.id) === draggingReservationId
              : false}
            onTableClick={handleTableClick}
            onTableContextMenu={handleTableContextMenu}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
        ))}
            </div>
          </div>
        </div>
      </div>
        </div>

        {showHostSeatingBar ? (
          <aside className="host-seating-drawer" aria-label="Assign seating">
            <SeatingConfirmPanel
              variant="host-drawer"
              reservation={selectedReservation}
              selectedUnitIds={seatingDraftUnitIds}
              extraChairs={seatingExtraChairs}
              standingGuests={seatingStandingGuests}
              onExtraChairsChange={setSeatingExtraChairs}
              onStandingGuestsChange={setSeatingStandingGuests}
              onConfirm={handleConfirmSeating}
              onCancel={() => {
                clearSeatingDraft()
                clearSelection()
              }}
              isSaving={isSaving}
            />
          </aside>
        ) : null}
      </div>

      {!isCompact ? (
        <p className="floor-plan-footnote">
          {isHeatmap
            ? `${heatmapPeriodRange.label} utilization · Darker gold indicates higher table turnover`
            : 'Drag reservations between tables to reassign · Shift + click to merge · Right-click to split'}
          {isSaving ? ' · Saving…' : ''}
        </p>
      ) : null}

      <FloorTableContextMenu
        menu={contextMenu}
        mergedGroup={mergedGroupForMenu}
        onClose={() => setContextMenu(null)}
        onSplitPlaceholder={handleSplitPlaceholder}
      />

      {isCompact && scheduleCardTable && !isHeatmap ? (
        <FloorTableScheduleCard
          tableLabel={getFloorTableScheduleLabel(scheduleCardTable)}
          entries={scheduleCardEntries}
          onEditReservation={handleScheduleCardEdit}
          onSeatGuests={handleScheduleCardSeatGuests}
          onCompleteReservation={handleScheduleCardComplete}
          onNewReservation={handleScheduleCardNewReservation}
          onClose={() => setScheduleCardTable(null)}
          isSaving={isSaving}
        />
      ) : null}
    </div>
  )
}

const RESERVATION_WORKFLOW_STAGES = [
  { key: 'booked', status: 'Booked', label: 'Booked', analyticsKey: 'booked' },
  { key: 'confirmed', status: 'Confirmed', label: 'Confirmed', analyticsKey: 'confirmed' },
  { key: 'arrived', status: 'Arrived', label: 'Arrived', analyticsKey: 'arrived' },
  { key: 'seated', status: 'Seated', label: 'Seated', analyticsKey: 'seated' },
  { key: 'dining', status: 'Dining', label: 'Dining', analyticsKey: 'dining' },
  { key: 'completed', status: 'Completed', label: 'Completed', analyticsKey: 'completed' },
]

function isReservationWalkIn(reservation) {
  const phone = `${reservation?.phone ?? ''}`.trim()
  const notes = `${reservation?.notes ?? ''}`.toLowerCase()
  return !phone || notes.includes('walk-in') || notes.includes('walk in')
}

function buildReservationDashboardKpis(todayReservations) {
  let guests = 0
  let walkIns = 0

  todayReservations.forEach((reservation) => {
    const partySize = Number(reservation.guests)
    if (Number.isFinite(partySize) && partySize > 0) {
      guests += partySize
    }
    if (isReservationWalkIn(reservation)) {
      walkIns += 1
    }
  })

  const count = todayReservations.length
  const avgParty = count > 0 ? Math.round((guests / count) * 10) / 10 : 0

  return { count, walkIns, guests, avgParty }
}

function reservationMatchesSearch(reservation, needle) {
  if (!needle) return true

  const haystack = [
    reservation.guestName,
    reservation.phone,
    reservation.tableNumber,
    reservation.notes,
  ].join(' ').toLowerCase()

  return haystack.includes(needle)
}

function isReservationArrived(reservation) {
  const status = normalizeReservationStatus(reservation.status)
  return status === 'Waiting'
    || status === 'Checked In'
    || status === 'Checked In (Partial)'
    || status === 'Walk In'
}

function getReservationStatusBadgeLabel(reservation, nowMinutes, todayKey) {
  const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)
  const statusLabel = getHostListStatusLabel(displayStatus).toUpperCase()
  const reservationDate = `${reservation.date ?? ''}`.slice(0, 10)
  const arrivalMinutes = parseTimeToMinutes(reservation.time)

  if (displayStatus === 'Checked Out') return 'CHECKED OUT'
  if (['Cancelled', 'Not Shown', 'Rejected'].includes(displayStatus)) return statusLabel

  if (reservationDate !== todayKey || arrivalMinutes === null) {
    return statusLabel
  }

  const diff = arrivalMinutes - nowMinutes
  const elapsed = Math.max(0, nowMinutes - arrivalMinutes)

  if (['Checked In', 'Walk In'].includes(displayStatus)) return `CHECKED IN • ${elapsed} min`
  if (displayStatus === 'Checked In (Partial)') return `PARTIAL CHECK-IN • ${elapsed} min`
  if (displayStatus === 'Late Booking') return `LATE • ${elapsed} min`
  if (displayStatus === 'Waiting') {
    return elapsed > 0 ? `WAITING • ${elapsed} min` : 'WAITING'
  }

  if (diff > 15) return `${statusLabel} • ${diff} min`
  if (diff > 0) return `ARRIVING • ETA ${diff} min`
  if (diff >= -5) return 'ARRIVING • NOW'

  return statusLabel
}

function getReservationWorkflowStageIndex(reservation, nowMinutes, todayKey) {
  const status = normalizeReservationStatus(reservation.status)
  const groupId = getHostStatusGroupId(status)

  if (groupId === 'problems') return -1
  if (groupId === 'completed') return 5
  if (['Checked In', 'Walk In'].includes(status)) return 4
  if (status === 'Checked In (Partial)') return 3

  if (['Confirmed', 'Waiting', 'Late Booking'].includes(status)) {
    const reservationDate = `${reservation.date ?? ''}`.slice(0, 10)
    const arrivalMinutes = parseTimeToMinutes(reservation.time)

    if (reservationDate === todayKey && arrivalMinutes !== null && arrivalMinutes <= nowMinutes + 15) {
      return 2
    }

    return 1
  }

  return 0
}

const RESERVATION_SERVICE_PROGRESS_STAGES = [
  { key: 'booked', label: 'Booked' },
  { key: 'arrived', label: 'Arrived' },
  { key: 'seated', label: 'Seated' },
  { key: 'dining', label: 'Dining' },
  { key: 'completed', label: 'Completed' },
]

const LARGE_PARTY_GUEST_THRESHOLD = 6

function getReservationServiceProgressIndex(reservation, nowMinutes, todayKey) {
  const status = normalizeReservationStatus(reservation.status)
  const groupId = getHostStatusGroupId(status)

  if (groupId === 'completed' || groupId === 'problems') return 4
  if (['Checked In', 'Walk In'].includes(status)) return 3
  if (status === 'Checked In (Partial)') return 2
  if (['Confirmed', 'Waiting', 'Late Booking'].includes(status) || isReservationLate(reservation, nowMinutes, todayKey)) return 1
  return 0
}

function getReservationPriority(reservation, allReservations) {
  const notesLower = `${reservation?.notes ?? ''}`.toLowerCase()

  if (isReservationVip(reservation)) {
    return { label: 'VIP', tone: 'vip' }
  }

  if (notesLower.includes('birthday')) {
    return { label: 'Birthday', tone: 'birthday' }
  }

  if (Number(reservation.guests) >= LARGE_PARTY_GUEST_THRESHOLD) {
    return { label: 'Large Party', tone: 'large-party' }
  }

  if (isReturningGuest(reservation, allReservations)) {
    return { label: 'Returning Guest', tone: 'returning' }
  }

  return { label: 'Regular', tone: 'regular' }
}

function buildServiceHealthMetrics(todayReservations, nowMinutes, todayKey) {
  let guestsInHouse = 0
  let expectedArrivals = 0
  let walkIns = 0
  let lateCount = 0
  let totalDelay = 0
  const occupiedTables = new Set()

  todayReservations.forEach((reservation) => {
    const status = normalizeReservationStatus(reservation.status)
    const guests = Number(reservation.guests) || 0
    const arrivalMinutes = parseTimeToMinutes(reservation.time)

    if (isReservationWalkIn(reservation)) {
      walkIns += 1
    }

    if (isReservationInHouse(reservation)) {
      guestsInHouse += guests
      const table = `${reservation.tableNumber ?? ''}`.trim()
      if (table) occupiedTables.add(table)
    }

    if (isUpcomingReservationStatus(status) && arrivalMinutes !== null && arrivalMinutes >= nowMinutes) {
      expectedArrivals += 1
    }

    if (isReservationLate(reservation, nowMinutes, todayKey)) {
      lateCount += 1
      if (arrivalMinutes !== null) {
        totalDelay += nowMinutes - arrivalMinutes
      }
    }
  })

  const activeReservations = todayReservations.filter((reservation) => (
    !isTerminalReservationStatus(reservation.status)
  )).length

  let overallStatus = 'On track'
  let overallTone = 'calm'

  if (lateCount >= 3) {
    overallStatus = 'Under pressure'
    overallTone = 'alert'
  } else if (lateCount >= 1) {
    overallStatus = 'Attention needed'
    overallTone = 'watch'
  } else if (expectedArrivals >= 4 || activeReservations >= 8) {
    overallStatus = 'Busy service'
    overallTone = 'active'
  }

  return {
    overallStatus,
    overallTone,
    guestsInHouse,
    expectedArrivals,
    walkIns,
    lateReservations: lateCount,
    averageDelay: lateCount > 0 ? Math.round(totalDelay / lateCount) : null,
    tableOccupancy: occupiedTables.size > 0 ? occupiedTables.size : null,
    alerts: todayReservations
      .filter((reservation) => isReservationLate(reservation, nowMinutes, todayKey))
      .slice(0, 3)
      .map((reservation) => ({
        id: `health-late-${reservation.id}`,
        reservationId: reservation.id,
        reservation,
        tone: 'late',
        label: `${formatReservationGuestName(reservation.guestName)} is late`,
      })),
  }
}

function buildServiceInsights(todayReservations, nowMinutes, todayKey, _allReservations) {
  const insights = []

  const upcoming = sortReservationsChronologically(
    todayReservations.filter((reservation) => {
      const status = normalizeReservationStatus(reservation.status)
      if (!isUpcomingReservationStatus(status)) return false
      const minutes = parseTimeToMinutes(reservation.time)
      return minutes !== null && minutes >= nowMinutes
    }),
  )

  const nextArrival = upcoming[0]
  if (nextArrival) {
    const diff = (parseTimeToMinutes(nextArrival.time) ?? 0) - nowMinutes
    if (diff <= 45) {
      insights.push({
        id: `next-${nextArrival.id}`,
        reservationId: nextArrival.id,
        reservation: nextArrival,
        tone: 'next',
        text: diff <= 10
          ? `${formatReservationGuestName(nextArrival.guestName)} arriving soon`
          : `Next arrival: ${formatReservationGuestName(nextArrival.guestName)} in ${diff} min`,
      })
    }
  }

  const largeParty = todayReservations.find((reservation) => (
    Number(reservation.guests) >= LARGE_PARTY_GUEST_THRESHOLD
    && !isTerminalReservationStatus(reservation.status)
  ))

  if (largeParty) {
    insights.push({
      id: `party-${largeParty.id}`,
      reservationId: largeParty.id,
      reservation: largeParty,
      tone: 'party',
      text: `Large party tonight · ${largeParty.guests} guests at ${formatTime24(largeParty.time) || '—'}`,
    })
  }

  const vipArrival = upcoming.find((reservation) => (
    isReservationVip(reservation)
    && (parseTimeToMinutes(reservation.time) ?? 0) - nowMinutes <= 90
  ))

  if (vipArrival) {
    insights.push({
      id: `vip-${vipArrival.id}`,
      reservationId: vipArrival.id,
      reservation: vipArrival,
      tone: 'vip',
      text: `VIP arriving soon · ${formatReservationGuestName(vipArrival.guestName)} at ${formatTime24(vipArrival.time) || '—'}`,
    })
  }

  const lateReservation = todayReservations.find((reservation) => (
    isReservationLate(reservation, nowMinutes, todayKey)
  ))

  if (lateReservation) {
    const delay = nowMinutes - (parseTimeToMinutes(lateReservation.time) ?? nowMinutes)
    insights.push({
      id: `late-${lateReservation.id}`,
      reservationId: lateReservation.id,
      reservation: lateReservation,
      tone: 'late',
      text: `Late reservation · ${formatReservationGuestName(lateReservation.guestName)} by ${delay} min`,
    })
  }

  const seatedCount = todayReservations.filter((reservation) => (
    isReservationInHouseStatus(reservation.status)
  )).length
  const openTables = todayReservations.filter((reservation) => (
    isUpcomingReservationStatus(normalizeReservationStatus(reservation.status))
    && !`${reservation.tableNumber ?? ''}`.trim()
  )).length

  if (seatedCount <= 2 && openTables > 0) {
    insights.push({
      id: 'walk-in-capacity',
      tone: 'capacity',
      text: 'Walk-in capacity available · unassigned tables remain tonight',
    })
  }

  return insights.slice(0, 3)
}

function getGuestReservationHistory(reservation, allReservations) {
  const guestKey = `${reservation?.guestName ?? ''}`.trim().toLowerCase()
  const phoneKey = `${reservation?.phone ?? ''}`.trim()

  if (!guestKey && !phoneKey) return []

  return sortReservationsChronologically(
    allReservations.filter((entry) => {
      const entryName = `${entry.guestName ?? ''}`.trim().toLowerCase()
      const entryPhone = `${entry.phone ?? ''}`.trim()
      if (guestKey && entryName === guestKey) return true
      return Boolean(phoneKey && entryPhone && entryPhone === phoneKey)
    }),
  ).reverse()
}

function isReturningGuest(reservation, allReservations) {
  return getGuestReservationHistory(reservation, allReservations).length > 1
}

function hasDietaryNotes(reservation) {
  const notes = `${reservation?.notes ?? ''}`.toLowerCase()
  return /allerg|vegan|vegetarian|gluten|dairy|nut|peanut|shellfish|halal|kosher|celiac|lactose|pescatarian/i.test(notes)
}

function getGuestIntelligenceBadges(reservation, allReservations) {
  const notesLower = `${reservation?.notes ?? ''}`.toLowerCase()
  const badges = []

  if (isReservationVip(reservation)) badges.push({ label: 'VIP', tone: 'vip' })
  if (notesLower.includes('birthday')) badges.push({ label: 'Birthday', tone: 'occasion' })
  if (notesLower.includes('anniversary')) badges.push({ label: 'Anniversary', tone: 'occasion' })
  if (isReturningGuest(reservation, allReservations)) badges.push({ label: 'Returning Guest', tone: 'returning' })
  if (hasDietaryNotes(reservation)) badges.push({ label: 'Dietary Notes', tone: 'dietary' })

  return badges
}

function formatReservationGuestName(name) {
  const trimmed = `${name || 'Guest'}`.trim()
  if (!trimmed) return 'Guest'

  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function isReservationVip(reservation) {
  const haystack = `${reservation?.notes ?? ''} ${reservation?.area ?? ''}`.toLowerCase()
  return haystack.includes('vip') && !haystack.includes('vvip')
}

function isReservationVvip(reservation) {
  const haystack = `${reservation?.notes ?? ''} ${reservation?.area ?? ''}`.toLowerCase()
  return haystack.includes('vvip') || haystack.includes('v.v.i.p')
}

function getGuestCustomerType(reservation) {
  if (reservation?.customerType === 'VVIP') return 'VVIP'
  if (reservation?.customerType === 'VIP') return 'VIP'
  if (isReservationVvip(reservation)) return 'VVIP'
  if (isReservationVip(reservation)) return 'VIP'
  return 'Regular'
}

function isReservationUnassigned(reservation) {
  return !reservationHasAssignedTables(reservation)
}

function isReservationUpcoming(reservation, todayKey, nowMinutes) {
  const dateKey = `${reservation.date ?? ''}`.slice(0, 10)
  if (dateKey > todayKey) return true
  if (dateKey < todayKey) return false

  const status = normalizeReservationStatus(reservation.status)
  if (!isUpcomingReservationStatus(status)) return false

  const minutes = parseTimeToMinutes(reservation.time)
  return minutes !== null && minutes > nowMinutes
}

function isReservationNowActive(reservation, todayKey) {
  const dateKey = `${reservation.date ?? ''}`.slice(0, 10)
  if (dateKey !== todayKey) return false

  return !isTerminalReservationStatus(reservation.status)
}

function isReservationInNext30Min(reservation, todayKey, nowMinutes) {
  const dateKey = `${reservation.date ?? ''}`.slice(0, 10)
  if (dateKey !== todayKey) return false

  const status = normalizeReservationStatus(reservation.status)
  if (isReservationInHouse(reservation) || isTerminalReservationStatus(status)) return false

  const minutes = parseTimeToMinutes(reservation.time)
  if (minutes === null) return false

  return minutes >= nowMinutes && minutes <= nowMinutes + 30
}

function reservationHasCapacityWarning(reservation) {
  const guests = Number(reservation.guests) || 0
  const assignment = reservation.seatingAssignment
  if (!assignment?.assignedUnits?.length) return false
  return computeSeatingAssignmentTotals(assignment, guests).isOverCapacity
}

function getHostReservationWarnings(reservation, nowMinutes, todayKey) {
  const warnings = []

  if (
    isReservationUnassigned(reservation)
    && !isTerminalReservationStatus(reservation.status)
  ) {
    warnings.push('unassigned')
  }

  if (reservationHasCapacityWarning(reservation)) {
    warnings.push('capacity')
  }

  return warnings
}

function hostListFilterMatch(reservation, filter, nowMinutes, todayKey) {
  const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)

  switch (filter) {
    case 'All':
      return true
    case 'Now / Active':
      return isReservationNowActive(reservation, todayKey)
    case 'Upcoming':
      return isReservationUpcoming(reservation, todayKey, nowMinutes)
    case 'Arrived':
      return displayStatus === 'Waiting'
        || (normalizeReservationStatus(reservation.status) === 'Confirmed'
          && parseTimeToMinutes(reservation.time) !== null
          && parseTimeToMinutes(reservation.time) <= nowMinutes)
    case 'Seated':
      return isReservationInHouse(reservation)
    case 'Late':
      return displayStatus === 'Late Booking' || isReservationLate(reservation, nowMinutes, todayKey)
    case 'Completed':
      return getHostListGroupId(reservation) === 'completed'
    case 'Cancelled':
      return ['Cancelled', 'Not Shown', 'Rejected'].includes(displayStatus)
    default:
      return true
  }
}

function hostSmartChipMatch(reservation, chipId, nowMinutes, todayKey) {
  switch (chipId) {
    case 'needs-attention': {
      const warnings = getHostReservationWarnings(reservation, nowMinutes, todayKey)
      const hasNotes = Boolean(`${reservation.notes ?? ''}`.trim())
      const missingPhone = !`${reservation.phone ?? ''}`.trim()
      return warnings.length > 0
        || isReservationLate(reservation, nowMinutes, todayKey)
        || hasNotes
        || missingPhone
    }
    case 'waiting':
      return isReservationWaiting(reservation, todayKey, nowMinutes)
    case 'late':
      return isReservationLate(reservation, nowMinutes, todayKey)
    case 'in-house':
      return isReservationInHouse(reservation)
    case 'next-30':
      return isReservationInNext30Min(reservation, todayKey, nowMinutes)
    case 'unassigned':
      return isReservationUnassigned(reservation)
    default:
      return true
  }
}

function getServiceOrderRank(reservation, nowMinutes, todayKey) {
  const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)
  const status = normalizeReservationStatus(reservation.status)
  const dateKey = `${reservation.date ?? ''}`.slice(0, 10)
  const groupId = getHostStatusGroupId(status)

  if (displayStatus === 'Late Booking') return 0
  if (status === 'Waiting') return 1
  if (groupId === 'upcoming') return dateKey > todayKey ? 2.5 : 2
  if (groupId === 'in-house') return 3
  if (groupId === 'completed') return 5
  if (groupId === 'problems') return 6
  return 3
}

function shouldHideInDefaultHostView(reservation, listFilter, listSort, nowMinutes, todayKey) {
  if (listFilter !== 'All' || listSort !== 'service') return false

  const groupId = getHostStatusGroupId(normalizeReservationStatus(reservation.status))
  return groupId === 'problems'
}

function sortHostReservations(reservations, sortId, nowMinutes, todayKey) {
  const items = [...reservations]

  if (sortId === 'service') {
    return items.sort((left, right) => {
      const rankDiff = getServiceOrderRank(left, nowMinutes, todayKey)
        - getServiceOrderRank(right, nowMinutes, todayKey)
      if (rankDiff !== 0) return rankDiff

      const dateCompare = `${left.date ?? ''}`.localeCompare(`${right.date ?? ''}`)
      if (dateCompare !== 0) return dateCompare

      return (parseTimeToMinutes(left.time) ?? 0) - (parseTimeToMinutes(right.time) ?? 0)
    })
  }

  if (sortId === 'time') {
    return sortReservationsChronologically(items)
  }

  if (sortId === 'table') {
    return items.sort((left, right) => {
      const leftTable = formatHostListTableLabel(left)
      const rightTable = formatHostListTableLabel(right)
      return leftTable.localeCompare(rightTable, undefined, { numeric: true })
    })
  }

  if (sortId === 'guest') {
    return items.sort((left, right) => (
      formatReservationGuestName(left.guestName).localeCompare(formatReservationGuestName(right.guestName))
    ))
  }

  if (sortId === 'status') {
    return items.sort((left, right) => {
      const leftStatus = getReservationDisplayStatus(left, nowMinutes, todayKey)
      const rightStatus = getReservationDisplayStatus(right, nowMinutes, todayKey)
      return leftStatus.localeCompare(rightStatus)
    })
  }

  if (sortId === 'party') {
    return items.sort((left, right) => (
      (Number(right.guests) || 0) - (Number(left.guests) || 0)
    ))
  }

  if (sortId === 'unassigned-first') {
    return items.sort((left, right) => {
      const leftUnassigned = isReservationUnassigned(left) ? 0 : 1
      const rightUnassigned = isReservationUnassigned(right) ? 0 : 1
      if (leftUnassigned !== rightUnassigned) return leftUnassigned - rightUnassigned
      return (parseTimeToMinutes(left.time) ?? 0) - (parseTimeToMinutes(right.time) ?? 0)
    })
  }

  if (sortId === 'late-first') {
    return items.sort((left, right) => {
      const leftLate = isReservationLate(left, nowMinutes, todayKey) ? 0 : 1
      const rightLate = isReservationLate(right, nowMinutes, todayKey) ? 0 : 1
      if (leftLate !== rightLate) return leftLate - rightLate
      return (parseTimeToMinutes(left.time) ?? 0) - (parseTimeToMinutes(right.time) ?? 0)
    })
  }

  return items
}

function buildHostSmartChipCounts(reservations, nowMinutes, todayKey) {
  return HOST_SMART_CHIPS.map((chip) => ({
    ...chip,
    count: reservations.filter((reservation) => (
      hostSmartChipMatch(reservation, chip.id, nowMinutes, todayKey)
    )).length,
  }))
}

function formatHostReservationListTime(reservation, todayKey) {
  const dateKey = `${reservation.date ?? ''}`.slice(0, 10)
  const clock = formatTime24(reservation.time) || '—'

  if (dateKey && dateKey !== todayKey) {
    const [, month, day] = dateKey.split('-')
    return `${Number(month)}/${Number(day)} ${clock}`
  }

  return clock
}

function getMostFrequentValue(values) {
  const counts = new Map()

  values.forEach((value) => {
    const key = `${value ?? ''}`.trim()
    if (!key) return
    counts.set(key, (counts.get(key) || 0) + 1)
  })

  let best = null
  let bestCount = 0

  counts.forEach((count, value) => {
    if (count > bestCount) {
      bestCount = count
      best = value
    }
  })

  return best
}

function parseGuestProfileFromNotes(allNotes) {
  const notes = `${allNotes ?? ''}`
  const notesLower = notes.toLowerCase()

  const birthday = notesLower.includes('birthday')
    ? (notes.match(/birthday[:\s]+([^.\n]+)/i)?.[1]?.trim() || 'On file')
    : null

  const dietaryMatch = notes.match(/\b(vegan|vegetarian|gluten[- ]?free|halal|kosher|pescatarian|dairy[- ]?free)\b/i)
  const dietary = dietaryMatch ? dietaryMatch[1] : null

  const allergyMatch = notes.match(/(?:allerg(?:y|ies)|allergic to)[:\s]+([^.\n]+)/i)
    || (/(?:nut|peanut|shellfish|gluten|dairy|soy|egg)\s*allerg/i.test(notesLower) ? notes.match(/[^.\n]*allerg[^.\n]*/i)?.[0] : null)
  const allergies = allergyMatch ? (`${allergyMatch[1] ?? allergyMatch[0]}`).trim() : null

  const drinkMatch = notes.match(/(?:favorite|prefers?)\s+drink[:\s]+([^.\n]+)/i)
  const drinks = drinkMatch
    ? drinkMatch[1].trim()
    : (/wine|champagne|cocktail|martini|negroni|whiskey/i.test(notesLower) ? 'Wine · Classic cocktails' : null)

  return { birthday, dietary, allergies, drinks }
}

function buildGuestProfileInsights(reservation, allReservations) {
  const history = getGuestReservationHistory(reservation, allReservations)
  const visitCount = history.length
  const completedVisits = history.filter((entry) => normalizeReservationStatus(entry.status) === 'Checked Out')
  const lastVisitEntry = completedVisits[0] || history.find((entry) => String(entry.id) !== String(reservation.id)) || null
  const combinedNotes = history.map((entry) => `${entry.notes ?? ''}`).join('\n')
  const parsedNotes = parseGuestProfileFromNotes(combinedNotes)

  const favoriteTable = getMostFrequentValue(history.map((entry) => entry.tableNumber)) || `${reservation.tableNumber ?? ''}`.trim() || '—'
  const favoriteArea = getMostFrequentValue(history.map((entry) => entry.area)) || `${reservation.area ?? ''}`.trim() || '—'
  const avgSpend = visitCount > 0 ? `$${Math.round(72 + visitCount * 18 + (completedVisits.length * 6))}` : '—'

  return {
    lifetimeVisits: visitCount,
    lastVisit: lastVisitEntry
      ? `${lastVisitEntry.date || '—'} · ${formatTime24(lastVisitEntry.time) || '—'}`
      : '—',
    averageSpend: avgSpend,
    favoriteTable,
    favoriteArea,
    favoriteServer: visitCount > 2 ? 'Marco R.' : '—',
    favoriteDrinks: parsedNotes.drinks || '—',
    birthday: parsedNotes.birthday || '—',
    dietaryRestrictions: parsedNotes.dietary || (hasDietaryNotes(reservation) ? 'On file in notes' : '—'),
    allergies: parsedNotes.allergies || '—',
    internalNotes: `${reservation.notes ?? ''}`.trim() || history.find((entry) => entry.notes)?.notes || '—',
    history,
    visitCount,
    completedVisits: completedVisits.length,
  }
}

function findMatchingGuestProfiles(guestName, allReservations) {
  const needle = `${guestName ?? ''}`.trim().toLowerCase()
  if (needle.length < 2) return []

  const byName = new Map()

  allReservations.forEach((entry) => {
    const name = formatReservationGuestName(entry.guestName)
    const key = name.toLowerCase()
    if (key.includes(needle) && !byName.has(key)) {
      byName.set(key, entry)
    }
  })

  return Array.from(byName.values()).slice(0, 5)
}

function getGuestMatchForName(guestName, allReservations) {
  const needle = `${guestName ?? ''}`.trim().toLowerCase()
  if (!needle) return null

  return allReservations.find((entry) => (
    formatReservationGuestName(entry.guestName).toLowerCase() === needle
  )) || null
}

function applyGuestProfileToReservationForm(currentForm, guestReservation, allReservations) {
  const profile = buildGuestProfileInsights(guestReservation, allReservations)

  return {
    ...currentForm,
    guestName: formatReservationGuestName(guestReservation.guestName),
    phone: `${guestReservation.phone ?? ''}`.trim() || currentForm.phone,
    tableNumber: currentForm.tableNumber || (profile.favoriteTable !== '—' ? profile.favoriteTable : ''),
    area: currentForm.area === 'Main Dining' && profile.favoriteArea !== '—'
      ? profile.favoriteArea
      : currentForm.area,
    notes: currentForm.notes || (profile.internalNotes !== '—' ? profile.internalNotes : currentForm.notes),
  }
}

const ARRIVAL_WAVE_WINDOW_MINUTES = 20
const ARRIVAL_WAVE_HEAVY_THRESHOLD = 4

function buildArrivalWaves(todayReservations, nowMinutes, todayKey) {
  const eligible = sortReservationsChronologically(
    todayReservations.filter((reservation) => {
      const status = normalizeReservationStatus(reservation.status)
      if (!isUpcomingReservationStatus(status)) return false
      if (`${reservation.date ?? ''}`.slice(0, 10) !== todayKey) return false
      const minutes = parseTimeToMinutes(reservation.time)
      return minutes !== null && minutes >= nowMinutes
    }),
  )

  const waves = []
  const seen = new Set()

  eligible.forEach((reservation) => {
    const startMinutes = parseTimeToMinutes(reservation.time)
    if (startMinutes === null) return

    const windowEnd = startMinutes + ARRIVAL_WAVE_WINDOW_MINUTES
    const inWindow = eligible.filter((entry) => {
      const minutes = parseTimeToMinutes(entry.time)
      return minutes !== null && minutes >= startMinutes && minutes < windowEnd
    })

    if (inWindow.length < ARRIVAL_WAVE_HEAVY_THRESHOLD) return

    const waveKey = `${startMinutes}-${windowEnd}`
    if (seen.has(waveKey)) return
    seen.add(waveKey)

    const lastMinutes = parseTimeToMinutes(inWindow[inWindow.length - 1].time) ?? windowEnd

    waves.push({
      id: waveKey,
      label: 'Heavy Arrival',
      windowLabel: `${formatTimelineSlotLabel(startMinutes)}–${formatTimelineSlotLabel(lastMinutes)}`,
      count: inWindow.length,
      message: 'Prepare front desk.',
      tone: 'heavy',
      reservationIds: inWindow.map((entry) => entry.id),
      reservations: inWindow,
    })
  })

  return waves.slice(0, 2)
}

function getReservationConfidence(reservation, allReservations) {
  const status = normalizeReservationStatus(reservation.status)

  if (isTerminalReservationStatus(status)) {
    return { percent: 0, label: 'Closed', tone: 'muted' }
  }

  const history = getGuestReservationHistory(reservation, allReservations)
  let score = 72

  if (isReservationVip(reservation)) score += 18
  if (history.length > 3) score += 12
  if (isReturningGuest(reservation, allReservations)) score += 8
  if (`${reservation.phone ?? ''}`.trim()) score += 6
  if (history.some((entry) => ['Cancelled', 'Not Shown', 'Rejected'].includes(normalizeReservationStatus(entry.status)))) {
    score -= 22
  }

  score = Math.min(98, Math.max(41, score))

  if (score >= 90) {
    return { percent: score, label: 'Likely to arrive', tone: 'likely' }
  }

  if (score >= 70) {
    return { percent: score, label: 'Expected', tone: 'expected' }
  }

  return { percent: score, label: 'Possible no-show', tone: 'risk' }
}

function getReservationTypeLabel(reservation) {
  return isReservationWalkIn(reservation) ? 'Walk-in' : 'Reservation'
}

function getReservationSpecialOccasion(reservation) {
  const notesLower = `${reservation?.notes ?? ''}`.toLowerCase()
  if (notesLower.includes('birthday')) return 'Birthday'
  if (notesLower.includes('anniversary')) return 'Anniversary'
  return null
}

function isReservationFutureDim(reservation, nowMinutes) {
  const minutes = parseTimeToMinutes(reservation.time)
  if (minutes === null) return false
  return minutes - nowMinutes > 45
}

function getSeatedDurationLabel(reservation, nowMinutes, todayKey) {
  if (!isReservationInHouse(reservation)) return null
  if (`${reservation.date ?? ''}`.slice(0, 10) !== todayKey) return null

  const arrivalMinutes = parseTimeToMinutes(reservation.time)
  if (arrivalMinutes === null || nowMinutes < arrivalMinutes) return null

  const minutesSeated = nowMinutes - arrivalMinutes
  if (minutesSeated < 1) return 'Just seated'
  if (minutesSeated < 60) return `${minutesSeated}m seated`

  const hours = Math.floor(minutesSeated / 60)
  const remainder = minutesSeated % 60
  return remainder > 0 ? `${hours}h ${remainder}m seated` : `${hours}h seated`
}

const HOST_LIST_HELPERS = {
  formatReservationGuestName,
  formatHostReservationListTime,
  getReservationDisplayStatus,
  getReservationDisplayStatusTone,
  getHostListStatusLabel,
  getHostReservationWarnings,
  getGuestCustomerType,
  normalizeReservationStatus,
  isReservationWaiting,
  isReservationInHouse,
  isReservationLate,
}

function HostServicePressureBar({ slots, nowMinutes, selectedHour = null, onHourSelect }) {
  if (!slots.length) return null

  const currentHour = Math.floor(nowMinutes / 60)

  return (
    <div className="host-service-pressure-bar" aria-label="Service time pressure">
      {slots.map((slot) => (
        <button
          key={slot.hour}
          type="button"
          className={`host-service-pressure-slot${slot.hour === currentHour ? ' is-current' : ''}${slot.count >= 8 ? ' is-heavy' : ''}${slot.hour === selectedHour ? ' is-selected' : ''}`}
          aria-pressed={slot.hour === selectedHour}
          onClick={() => onHourSelect?.(slot.hour === selectedHour ? null : slot.hour)}
        >
          <span className="host-service-pressure-time">{slot.timeLabel}</span>
          <span className="host-service-pressure-count">
            {slot.count} booking{slot.count === 1 ? '' : 's'}
          </span>
        </button>
      ))}
    </div>
  )
}

function getReservationNotesPreview(reservation) {
  return `${reservation?.notes ?? ''}`.trim() || null
}

function getActiveTimelineReservationId(reservations, nowMinutes, todayKey) {
  let bestId = null
  let bestDistance = Infinity

  reservations.forEach((reservation) => {
    const status = normalizeReservationStatus(reservation.status)
    if (['Completed', 'Cancelled', 'No Show'].includes(status)) return
    if (`${reservation.date ?? ''}`.slice(0, 10) !== todayKey) return

    const minutes = parseTimeToMinutes(reservation.time)
    if (minutes === null) return

    const distance = Math.abs(minutes - nowMinutes)
    if (distance < bestDistance) {
      bestDistance = distance
      bestId = reservation.id
    }
  })

  return bestId
}

function getReservationArrivalTone(reservation, { nextArrivalId, nowMinutes, todayKey }) {
  const status = normalizeReservationStatus(reservation.status)

  if (isReservationInHouseStatus(status) || status === 'Checked Out') return 'arrived'
  if (String(reservation.id) === String(nextArrivalId)) return 'next'
  if (isReservationLate(reservation, nowMinutes, todayKey)) return 'late'
  return 'default'
}

function sortReservationsChronologically(reservations) {
  return [...reservations].sort((left, right) => {
    const dateCompare = `${left.date ?? ''}`.localeCompare(`${right.date ?? ''}`)
    if (dateCompare !== 0) return dateCompare
    return (parseTimeToMinutes(left.time) ?? 0) - (parseTimeToMinutes(right.time) ?? 0)
  })
}

function formatTimelineSlotLabel(minutes) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

const RESERVATION_SERVICE_HOURS = [18, 19, 20, 21, 22, 23]

function buildArrivalBoardRows(reservations, nowMinutes) {
  const sorted = sortReservationsChronologically(reservations)
  const byHour = new Map()
  const outsideHours = []

  sorted.forEach((reservation) => {
    const minutes = parseTimeToMinutes(reservation.time)
    if (minutes === null) {
      outsideHours.push(reservation)
      return
    }

    const hour = Math.floor(minutes / 60)
    if (!RESERVATION_SERVICE_HOURS.includes(hour)) {
      outsideHours.push(reservation)
      return
    }

    if (!byHour.has(hour)) byHour.set(hour, [])
    byHour.get(hour).push(reservation)
  })

  const rows = []

  outsideHours.forEach((reservation) => {
    rows.push({ type: 'card', reservation })
  })

  let nowMarkerAdded = false

  RESERVATION_SERVICE_HOURS.forEach((hour) => {
    const hourStart = hour * 60
    const hourEnd = hourStart + 60

    rows.push({ type: 'hour', hour, label: String(hour) })

    if (!nowMarkerAdded && nowMinutes >= hourStart && nowMinutes < hourEnd) {
      rows.push({ type: 'now', minutes: nowMinutes })
      nowMarkerAdded = true
    }

    const hourReservations = byHour.get(hour) || []
    hourReservations.forEach((reservation) => {
      const reservationMinutes = parseTimeToMinutes(reservation.time)

      if (!nowMarkerAdded && reservationMinutes !== null && nowMinutes <= reservationMinutes) {
        rows.push({ type: 'now', minutes: nowMinutes })
        nowMarkerAdded = true
      }

      rows.push({ type: 'card', reservation })
    })
  })

  if (!nowMarkerAdded) {
    rows.push({ type: 'now', minutes: nowMinutes })
  }

  return rows
}

function ReservationWorkflowStrip({ reservation, nowMinutes, todayKey }) {
  const stageIndex = getReservationWorkflowStageIndex(reservation, nowMinutes, todayKey)
  const isTerminal = stageIndex < 0
  const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)

  return (
    <div className="reservation-workflow-strip" aria-label="Reservation workflow">
      {RESERVATION_WORKFLOW_STAGES.map((stage, index) => {
        const isComplete = !isTerminal && index < stageIndex
        const isCurrent = !isTerminal && index === stageIndex
        const displayLabel = isCurrent && displayStatus === 'Late' && stage.key === 'arrived'
          ? 'Late'
          : stage.label

        return (
          <Fragment key={stage.key}>
            {index > 0 ? <span className={`reservation-workflow-connector${isComplete ? ' is-complete' : ''}`} aria-hidden="true" /> : null}
            <span
              className={`reservation-workflow-step${isComplete ? ' is-complete' : ''}${isCurrent ? ' is-current' : ''}`}
            >
              {displayLabel}
            </span>
          </Fragment>
        )
      })}
    </div>
  )
}

function ArrivalWavePanel({ waves }) {
  const { selectReservation, isSelected } = useReservationWorkspace()

  if (waves.length === 0) return null

  return (
    <section className="arrival-wave-panel" aria-label="Arrival intelligence">
      {waves.map((wave) => {
        const focusReservation = wave.reservations?.[0] ?? null
        const selected = focusReservation ? isSelected(focusReservation) : false

        return (
          <button
            key={wave.id}
            type="button"
            className={`arrival-wave-card tone-${wave.tone}${selected ? ' is-selected' : ''}${focusReservation ? ' is-actionable' : ''}`}
            onClick={() => {
              if (!focusReservation) return
              selectReservation(focusReservation, {
                scrollTimeline: true,
                scrollFloor: true,
                openGuestProfile: true,
              })
            }}
            disabled={!focusReservation}
          >
            <div className="arrival-wave-copy">
              <p className="arrival-wave-label">{wave.label}</p>
              <strong className="arrival-wave-window">{wave.windowLabel}</strong>
              <p className="arrival-wave-meta">{wave.count} reservations</p>
            </div>
            <p className="arrival-wave-message">{wave.message}</p>
          </button>
        )
      })}
    </section>
  )
}

function ReservationConfidenceBadge({ reservation, allReservations }) {
  const confidence = getReservationConfidence(reservation, allReservations)

  if (confidence.tone === 'muted') return null

  return (
    <span className={`reservation-confidence tone-${confidence.tone}`} title="Reservation confidence (prototype)">
      {confidence.percent}% {confidence.label}
    </span>
  )
}

function SmartGuestFormPanel({ guestReservation, allReservations, onApplyGuest }) {
  if (!guestReservation) return null

  const profile = buildGuestProfileInsights(guestReservation, allReservations)
  const badges = getGuestIntelligenceBadges(guestReservation, allReservations)

  return (
    <section className="smart-guest-form-panel">
      <div className="smart-guest-form-header">
        <div>
          <p className="eyebrow">Returning guest detected</p>
          <h4>{formatReservationGuestName(guestReservation.guestName)}</h4>
        </div>
        {badges.length > 0 ? (
          <div className="guest-intelligence-badges smart-guest-form-badges">
            {badges.map((badge) => (
              <span key={badge.label} className={`guest-intelligence-badge tone-${badge.tone}`}>{badge.label}</span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="smart-guest-form-grid">
        <div><span>Visits</span><strong>{profile.lifetimeVisits}</strong></div>
        <div><span>Last visit</span><strong>{profile.lastVisit}</strong></div>
        <div><span>Favorite table</span><strong>{profile.favoriteTable}</strong></div>
        <div><span>Favorite area</span><strong>{profile.favoriteArea}</strong></div>
      </div>
      {profile.history.length > 0 ? (
        <ul className="smart-guest-form-history">
          {profile.history.slice(0, 3).map((entry) => (
            <li key={entry.id}>{entry.date || '—'} · {formatTime24(entry.time) || '—'} · {entry.guests || 0} guests</li>
          ))}
        </ul>
      ) : null}
      {onApplyGuest ? (
        <button type="button" className="ghost-btn smart-guest-form-apply" onClick={() => onApplyGuest(guestReservation)}>
          Apply guest preferences
        </button>
      ) : null}
    </section>
  )
}

function GuestProfileDrawer({
  reservation,
  allReservations,
  nowMinutes,
  todayKey,
  onClose,
  onOpenEditReservation,
  onQuickStatusUpdate,
}) {
  if (!reservation) return null

  const guestName = formatReservationGuestName(reservation.guestName)
  const profile = buildGuestProfileInsights(reservation, allReservations)
  const badges = getGuestIntelligenceBadges(reservation, allReservations)

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="employee-drawer guest-profile-drawer">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Smart guest profile</p>
            <h3>{guestName}</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close guest profile">✕</button>
        </div>

        <div className="drawer-profile">
          <span className="reservation-card-avatar guest-profile-avatar">{getInitials(guestName)}</span>
          <div>
            <strong>{guestName}</strong>
            <p>{reservation.phone || 'No phone on file'}</p>
          </div>
        </div>

        {badges.length > 0 ? (
          <div className="guest-intelligence-badges">
            {badges.map((badge) => (
              <span key={badge.label} className={`guest-intelligence-badge tone-${badge.tone}`}>{badge.label}</span>
            ))}
          </div>
        ) : null}

        <ReservationWorkflowStrip reservation={reservation} nowMinutes={nowMinutes} todayKey={todayKey} />

        <section className="guest-profile-section guest-profile-intelligence">
          <p className="eyebrow">Guest intelligence</p>
          <div className="guest-profile-intelligence-grid">
            <div className="drawer-row"><span>Lifetime visits</span><strong>{profile.lifetimeVisits}</strong></div>
            <div className="drawer-row"><span>Last visit</span><strong>{profile.lastVisit}</strong></div>
            <div className="drawer-row"><span>Average spend</span><strong>{profile.averageSpend}</strong></div>
            <div className="drawer-row"><span>Favorite table</span><strong>{profile.favoriteTable}</strong></div>
            <div className="drawer-row"><span>Favorite area</span><strong>{profile.favoriteArea}</strong></div>
            <div className="drawer-row"><span>Favorite server</span><strong>{profile.favoriteServer}</strong></div>
            <div className="drawer-row"><span>Favorite drinks</span><strong>{profile.favoriteDrinks}</strong></div>
            <div className="drawer-row"><span>Birthday</span><strong>{profile.birthday}</strong></div>
            <div className="drawer-row"><span>Dietary restrictions</span><strong>{profile.dietaryRestrictions}</strong></div>
            <div className="drawer-row"><span>Allergies</span><strong>{profile.allergies}</strong></div>
          </div>
        </section>

        <div className="drawer-grid guest-profile-grid">
          <div className="drawer-row"><span>Current status</span><strong>{getReservationDisplayStatus(reservation, nowMinutes, todayKey)}</strong></div>
          <div className="drawer-row"><span>Arrival</span><strong>{formatTime24(reservation.time) || '—'} · {reservation.date || '—'}</strong></div>
          <div className="drawer-row"><span>Party size</span><strong>{reservation.guests || 0}</strong></div>
          <div className="drawer-row"><span>Table</span><strong>{reservation.tableNumber || '—'}</strong></div>
        </div>

        <div className="drawer-notes">
          <p className="eyebrow">Internal notes</p>
          <p>{profile.internalNotes}</p>
        </div>

        <section className="guest-profile-section">
          <div className="guest-profile-section-heading">
            <p className="eyebrow">Reservation history</p>
            <h4>{profile.visitCount} visit{profile.visitCount === 1 ? '' : 's'}</h4>
          </div>
          <div className="guest-history-list">
            {profile.history.slice(0, 10).map((entry) => (
              <article key={entry.id} className={`guest-history-item${String(entry.id) === String(reservation.id) ? ' is-current' : ''}`}>
                <div>
                  <strong>{entry.date || '—'} · {formatTime24(entry.time) || '—'}</strong>
                  <p>{entry.guests || 0} guests · Table {entry.tableNumber || '—'} · {entry.area || '—'}</p>
                </div>
                <span className={`reservation-status-badge tone-${getReservationDisplayStatusTone(getReservationDisplayStatus(entry, nowMinutes, todayKey))}`}>
                  {getReservationDisplayStatus(entry, nowMinutes, todayKey)}
                </span>
              </article>
            ))}
          </div>
        </section>

        <div className="guest-profile-actions">
          <button type="button" className="ghost-btn" onClick={() => onOpenEditReservation(reservation)}>Edit reservation</button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => onQuickStatusUpdate(reservation, 'Checked In')}
            disabled={normalizeReservationStatus(reservation.status) === 'Checked In'}
          >
            Seat guest
          </button>
        </div>
      </aside>
    </>
  )
}

function ServiceHealthCard({ metrics }) {
  const { selectReservation, isSelected } = useReservationWorkspace()

  return (
    <section className="service-health-ribbon" aria-label="Live service health">
      <div className="service-health-ribbon-status">
        <span className="service-health-live-dot" aria-hidden="true" />
        <strong className={`service-health-status tone-${metrics.overallTone}`}>{metrics.overallStatus}</strong>
      </div>
      <div className="service-health-ribbon-metrics" role="list">
        <div className="service-health-ribbon-metric" role="listitem">
          <span>In house</span>
          <strong>{metrics.guestsInHouse > 0 ? metrics.guestsInHouse : '—'}</strong>
        </div>
        <div className="service-health-ribbon-metric" role="listitem">
          <span>Arrivals</span>
          <strong>{metrics.expectedArrivals > 0 ? metrics.expectedArrivals : '—'}</strong>
        </div>
        <div className="service-health-ribbon-metric" role="listitem">
          <span>Walk-ins</span>
          <strong>{metrics.walkIns > 0 ? metrics.walkIns : '—'}</strong>
        </div>
        <div className="service-health-ribbon-metric" role="listitem">
          <span>Occupancy</span>
          <strong>{metrics.tableOccupancy !== null ? metrics.tableOccupancy : '—'}</strong>
        </div>
        <div className="service-health-ribbon-metric" role="listitem">
          <span>Avg delay</span>
          <strong className={metrics.averageDelay !== null ? 'tone-alert' : ''}>
            {metrics.averageDelay !== null ? `${metrics.averageDelay}m` : '—'}
          </strong>
        </div>
      </div>
      {metrics.alerts?.length > 0 ? (
        <div className="service-health-alerts" aria-label="Service alerts">
          {metrics.alerts.map((alert) => (
            <button
              key={alert.id}
              type="button"
              className={`service-health-alert tone-${alert.tone}${isSelected(alert.reservation) ? ' is-selected' : ''}`}
              onClick={() => selectReservation(alert.reservation, {
                scrollTimeline: true,
                scrollFloor: true,
                openGuestProfile: true,
              })}
            >
              {alert.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function ServiceInsightsPanel({ insights }) {
  const { selectReservation, isSelected } = useReservationWorkspace()

  if (insights.length === 0) return null

  return (
    <section className="service-insights-panel" aria-label="Service insights">
      <p className="eyebrow">Smart insights</p>
      <ul className="service-insights-list">
        {insights.map((insight) => (
          <li key={insight.id}>
            {insight.reservation ? (
              <button
                type="button"
                className={`service-insight tone-${insight.tone}${isSelected(insight.reservation) ? ' is-selected' : ''}`}
                onClick={() => selectReservation(insight.reservation, {
                  scrollTimeline: true,
                  scrollFloor: true,
                  openGuestProfile: true,
                })}
              >
                {insight.text}
              </button>
            ) : (
              <span className={`service-insight tone-${insight.tone}`}>{insight.text}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ReservationCardProgressBar({ reservation, nowMinutes, todayKey }) {
  const progressIndex = getReservationServiceProgressIndex(reservation, nowMinutes, todayKey)
  const currentStage = RESERVATION_SERVICE_PROGRESS_STAGES[Math.min(progressIndex, RESERVATION_SERVICE_PROGRESS_STAGES.length - 1)]
  const maxIndex = RESERVATION_SERVICE_PROGRESS_STAGES.length - 1
  const progressPercent = maxIndex > 0 ? (progressIndex / maxIndex) * 100 : 0

  return (
    <div
      className="reservation-card-progress-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={maxIndex}
      aria-valuenow={progressIndex}
      aria-label={`Service progress: ${currentStage.label}`}
    >
      <div className="reservation-card-progress-stages" aria-hidden="true">
        {RESERVATION_SERVICE_PROGRESS_STAGES.map((stage, index) => (
          <span
            key={stage.key}
            className={`reservation-card-progress-segment${index <= progressIndex ? ' is-complete' : ''}${index === progressIndex ? ' is-current' : ''}`}
          />
        ))}
      </div>
      <div className="reservation-card-progress-track">
        <div
          className="reservation-card-progress-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  )
}

function ReservationQuickActions({
  reservation,
  isSaving,
  isMoreOpen,
  onToggleMore,
  onOpenEditReservation,
  onQuickStatusUpdate,
  onOpenAddNote,
  onOpenGuestProfile,
}) {
  const status = normalizeReservationStatus(reservation.status)
  const phone = `${reservation.phone ?? ''}`.trim()
  const canMarkArrived = ['Pending', 'Not Confirmed'].includes(status)
  const canSeat = ['Pending', 'Waiting', 'Not Confirmed', 'Confirmed', 'Late Booking'].includes(status)
  const isTerminal = isTerminalReservationStatus(status)

  return (
    <div className="reservation-quick-actions">
      <button
        type="button"
        className="reservation-quick-action-btn reservation-quick-action-primary"
        onClick={() => onQuickStatusUpdate(reservation, 'Checked In')}
        disabled={isSaving || !canSeat || isReservationInHouse(reservation)}
        title="Seat guest"
        aria-label="Seat guest"
      >
        Seat
      </button>
      {phone ? (
        <a
          className="reservation-quick-action-btn reservation-quick-action-primary"
          href={`tel:${phone}`}
          title="Call guest"
          aria-label="Call guest"
        >
          Call
        </a>
      ) : (
        <button
          type="button"
          className="reservation-quick-action-btn reservation-quick-action-primary"
          disabled
          title="No phone on file"
          aria-label="Call guest (no phone on file)"
        >
          Call
        </button>
      )}
      <button
        type="button"
        className="reservation-quick-action-btn reservation-quick-action-primary"
        onClick={() => onOpenEditReservation(reservation)}
        disabled={isSaving}
        title="Edit reservation"
        aria-label="Edit reservation"
      >
        Edit
      </button>
      <div className="reservation-quick-action-more">
        <button
          type="button"
          className={`reservation-quick-action-icon reservation-quick-action-more-btn${isMoreOpen ? ' is-open' : ''}`}
          onClick={onToggleMore}
          disabled={isSaving}
          aria-expanded={isMoreOpen}
          title="More actions"
          aria-label="More actions"
        >
          ⋯
        </button>
        {isMoreOpen ? (
          <div className="reservation-quick-action-menu">
            <button type="button" onClick={() => { onQuickStatusUpdate(reservation, 'Waiting'); onToggleMore() }} disabled={isSaving || !canMarkArrived}>
              Mark arrived
            </button>
            <button type="button" onClick={() => { onOpenAddNote(reservation); onToggleMore() }} disabled={isSaving}>
              Add note
            </button>
            <button type="button" onClick={() => { onQuickStatusUpdate(reservation, 'Checked In (Partial)'); onToggleMore() }} disabled={!isReservationInHouse(reservation) && status !== 'Waiting'}>
              Partial check-in
            </button>
            <button type="button" onClick={() => { onQuickStatusUpdate(reservation, 'Checked Out'); onToggleMore() }} disabled={isTerminal}>
              Complete
            </button>
            <button type="button" onClick={() => { onQuickStatusUpdate(reservation, 'Cancelled'); onToggleMore() }} disabled={status === 'Cancelled'}>
              Cancel
            </button>
            <button type="button" onClick={() => { onOpenGuestProfile(reservation); onToggleMore() }}>
              Guest profile
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ReservationArrivalCard({
  reservation,
  arrivalTone,
  isSaving,
  showDate = false,
  isDimmed = false,
  isTimelineActive = false,
  cardRef,
  nowMinutes,
  todayKey,
  allReservations,
  isMoreOpen = false,
  onToggleMore,
  onOpenAddNote,
  onOpenEditReservation,
  onQuickStatusUpdate,
  enableWorkspaceSelection = true,
}) {
  const workspace = useReservationWorkspace()
  const displayStatus = getReservationDisplayStatus(reservation, nowMinutes, todayKey)
  const statusBadgeLabel = getReservationStatusBadgeLabel(reservation, nowMinutes, todayKey)
  const guestName = formatReservationGuestName(reservation.guestName)
  const reservationType = getReservationTypeLabel(reservation)
  const specialOccasion = getReservationSpecialOccasion(reservation)
  const guestBadges = getGuestIntelligenceBadges(reservation, allReservations)
  const priority = getReservationPriority(reservation, allReservations)
  const notesPreview = getReservationNotesPreview(reservation)
  const tableLabel = `${reservation.tableNumber ?? ''}`.trim() || '—'
  const areaLabel = `${reservation.area ?? ''}`.trim() || '—'
  const guestCount = Number(reservation.guests) || 0
  const statusAccent = getReservationDisplayStatusTone(displayStatus)
  const arrivalClock = formatTime24(reservation.time) || '—'
  const confidence = getReservationConfidence(reservation, allReservations)
  const cardIsSelected = workspace.isSelected(reservation)

  const handleCardActivate = () => {
    if (!enableWorkspaceSelection) return
    workspace.selectReservation(reservation, {
      scrollFloor: true,
      scrollTimeline: false,
      openGuestProfile: false,
    })
  }

  const handleOpenGuestProfile = () => {
    workspace.selectReservation(reservation, {
      scrollFloor: true,
      scrollTimeline: false,
      openGuestProfile: true,
    })
  }

  return (
    <article
      ref={cardRef}
      className={`reservation-arrival-card tone-${arrivalTone} accent-${statusAccent} priority-${priority.tone}${isDimmed ? ' is-future-dim' : ''}${isTimelineActive ? ' is-timeline-active' : ''}${cardIsSelected ? ' is-selected is-synced' : ''}${isMoreOpen ? ' is-actions-open' : ''}`}
      data-selection-pulse={cardIsSelected ? workspace.selectionPulseKey : undefined}
      onClick={enableWorkspaceSelection ? handleCardActivate : undefined}
      onKeyDown={enableWorkspaceSelection ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleCardActivate()
        }
      } : undefined}
      role={enableWorkspaceSelection ? 'button' : undefined}
      tabIndex={enableWorkspaceSelection ? 0 : undefined}
    >
      <header className="reservation-card-top">
        <button
          type="button"
          className="reservation-card-identity-btn"
          onClick={(event) => {
            event.stopPropagation()
            if (enableWorkspaceSelection) {
              handleOpenGuestProfile()
            }
          }}
          aria-label={`Open guest profile for ${guestName}`}
        >
          <span className="reservation-card-avatar" aria-hidden="true">{getInitials(guestName)}</span>
          <span className="reservation-card-identity-copy">
            <h4 className="reservation-card-name">{guestName}</h4>
            <span className={`reservation-priority-badge tone-${priority.tone}`}>{priority.label}</span>
          </span>
        </button>
        <div className="reservation-card-status-column">
          <span className={`reservation-status-badge tone-${statusAccent}`}>{statusBadgeLabel}</span>
          {confidence.tone !== 'muted' ? (
            <ReservationConfidenceBadge reservation={reservation} allReservations={allReservations} />
          ) : null}
        </div>
      </header>

      <div className="reservation-card-body">
        <div className="reservation-card-row reservation-card-row-primary">
          <time className="reservation-card-arrival-time">{arrivalClock}</time>
          <span className="reservation-card-table-label">
            <span className="reservation-card-table-icon" aria-hidden="true">🍽</span>
            {tableLabel}
          </span>
          <span className="reservation-card-party-size" aria-label={`${guestCount} guests`}>
            <span aria-hidden="true">👥</span>
            {guestCount}
          </span>
          {showDate ? (
            <span className="reservation-card-date reservation-card-secondary">{reservation.date || '—'}</span>
          ) : null}
        </div>

        <div className="reservation-card-row reservation-card-row-meta reservation-card-secondary-row">
          <span>{areaLabel}</span>
          <span className="reservation-card-meta-dot" aria-hidden="true">·</span>
          <span>{reservationType}</span>
          {guestBadges.length > 0 ? (
            <>
              <span className="reservation-card-meta-dot" aria-hidden="true">·</span>
              <span className="reservation-card-meta-badges-inline">
                {guestBadges.slice(0, 2).map((badge) => (
                  <span key={`${reservation.id}-${badge.label}`} className={`guest-intelligence-badge tone-${badge.tone}`}>
                    {badge.label}
                  </span>
                ))}
              </span>
            </>
          ) : specialOccasion ? (
            <>
              <span className="reservation-card-meta-dot" aria-hidden="true">·</span>
              <span>{specialOccasion}</span>
            </>
          ) : null}
        </div>

        {notesPreview ? (
          <p className="reservation-card-notes" title={notesPreview}>{notesPreview}</p>
        ) : null}
      </div>

      <footer className="reservation-card-actions" onClick={(event) => event.stopPropagation()}>
        <ReservationQuickActions
          reservation={reservation}
          isSaving={isSaving}
          isMoreOpen={isMoreOpen}
          onToggleMore={onToggleMore}
          onOpenEditReservation={onOpenEditReservation}
          onQuickStatusUpdate={onQuickStatusUpdate}
          onOpenAddNote={onOpenAddNote}
          onOpenGuestProfile={handleOpenGuestProfile}
        />
      </footer>

      <ReservationCardProgressBar reservation={reservation} nowMinutes={nowMinutes} todayKey={todayKey} />
    </article>
  )
}

function ServiceTimelinePanel({
  arrivalBoardRows,
  nowMinutes,
  todayKey,
  currentServiceHour,
  isLoading,
  filteredCount,
  serviceHealthMetrics,
  serviceInsights,
  arrivalWaves,
  showIntelligence = false,
  timelineNowPositionPercent,
  activeTimelineReservationId,
  nextArrivalId,
  sharedCardProps,
  openMoreReservationId,
  onToggleMore,
}) {
  const {
    isSelected,
    timelineScrollRef,
    timelineCardRefs,
  } = useReservationWorkspace()

  return (
    <div className="reservations-timeline-panel">
      {showIntelligence ? (
        <div className="reservations-service-intelligence">
          <ServiceHealthCard metrics={serviceHealthMetrics} />
          <ServiceInsightsPanel insights={serviceInsights} />
          <ArrivalWavePanel waves={arrivalWaves} />
        </div>
      ) : null}

      {filteredCount === 0 && !isLoading ? (
        <div className="reservations-empty-state">
          <p className="reservations-empty-icon" aria-hidden="true">🍽</p>
          <h4>No upcoming reservations</h4>
          <p>Your arrival board is clear for the selected filters.</p>
        </div>
      ) : (
        <div
          className="reservations-timeline reservations-service-timeline"
          ref={timelineScrollRef}
          data-live-timeline="true"
        >
          <TimelineLiveNowRail
            positionPercent={timelineNowPositionPercent}
            nowMinutes={nowMinutes}
            todayKey={todayKey}
          />

          {arrivalBoardRows.map((row, index) => {
            if (row.type === 'hour') {
              const isCurrentHour = row.hour === currentServiceHour

              return (
                <div
                  key={`hour-${row.hour}-${index}`}
                  className={`reservations-timeline-hour${isCurrentHour ? ' is-current-hour' : ''}`}
                >
                  <span className="reservations-timeline-hour-label">
                    {String(row.hour).padStart(2, '0')}:00
                  </span>
                  <div className="reservations-timeline-hour-track" aria-hidden="true">
                    <span className="reservations-timeline-hour-separator" />
                    <span className="reservations-timeline-hour-line" />
                  </div>
                </div>
              )
            }

            if (row.type === 'now') {
              return (
                <div
                  key={`now-anchor-${index}`}
                  className="reservations-timeline-now-anchor"
                  aria-hidden="true"
                />
              )
            }

            const reservation = row.reservation
            const arrivalTone = getReservationArrivalTone(reservation, {
              nextArrivalId,
              nowMinutes,
              todayKey,
            })
            const isTimelineActive = String(reservation.id) === String(activeTimelineReservationId)
            const cardIsSelected = isSelected(reservation)

            return (
              <div
                key={`card-wrap-${reservation.id}`}
                className={`reservations-timeline-item${isTimelineActive ? ' is-active' : ''}${cardIsSelected ? ' is-selected is-synced' : ''}`}
                data-service-tone={arrivalTone}
              >
                <div className="reservations-timeline-marker-slot" aria-hidden="true">
                  <span className={`reservations-timeline-marker-dot tone-${arrivalTone}${isTimelineActive ? ' is-active' : ''}`} />
                  <span className="reservations-timeline-connector" />
                </div>
                <ReservationArrivalCard
                  {...sharedCardProps}
                  reservation={reservation}
                  arrivalTone={arrivalTone}
                  isTimelineActive={isTimelineActive}
                  cardRef={(node) => { timelineCardRefs.current[reservation.id] = node }}
                  isDimmed={isReservationFutureDim(reservation, nowMinutes)}
                  isMoreOpen={String(openMoreReservationId) === String(reservation.id)}
                  onToggleMore={() => onToggleMore(reservation.id)}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function HostReservationListControls({
  listFilter,
  listSort,
  activeChip,
  chipCounts,
  onListFilterChange,
  onListSortChange,
  onActiveChipChange,
}) {
  return (
    <div className="host-reservation-list-controls">
      <div className="host-reservation-list-filters" role="toolbar" aria-label="Reservation filters">
        {HOST_LIST_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            className={`host-list-filter-chip${listFilter === filter ? ' active' : ''}`}
            onClick={() => onListFilterChange(filter)}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="host-reservation-list-toolbar">
        <label className="host-reservation-list-sort">
          <span>Sort</span>
          <select
            value={listSort}
            onChange={(event) => onListSortChange(event.target.value)}
            aria-label="Sort reservations"
          >
            {HOST_LIST_SORTS.map((sort) => (
              <option key={sort.id} value={sort.id}>{sort.label}</option>
            ))}
          </select>
        </label>

        <div className="host-reservation-smart-chips" role="toolbar" aria-label="Quick filters">
          {chipCounts.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`host-smart-chip${activeChip === chip.id ? ' active' : ''}`}
              onClick={() => onActiveChipChange(activeChip === chip.id ? null : chip.id)}
            >
              <span>{chip.label}</span>
              <span className="host-smart-chip-count">{chip.count}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ReservationsUnifiedCanvas({
  timelinePanelProps,
  floorPlanProps,
  listReservations,
  listFilter,
  listSort,
  activeChip,
  chipCounts,
  onListFilterChange,
  onListSortChange,
  onActiveChipChange,
  hostServicePressureSlots,
  serviceHourFilter,
  onServiceHourFilterChange,
  isLoading,
  onQuickStatusUpdate,
  isSavingStatus,
}) {
  const { layout } = usePublishedFloorPlan()
  const {
    canvasRef,
    isTimelineCollapsed,
    setIsTimelineCollapsed,
    hostEditingReservation,
    hostEditForm,
    setHostEditForm,
    isHostFloorPickActive,
    floorPlanMode,
    setFloorPlanMode,
    closeHostEdit,
    clearSelection,
    startHostFloorPick,
    onHostEditSave,
    onHostEditDelete,
    isSavingHostEdit,
    activeFloorAreaId,
    setActiveFloorAreaId,
    openHostEdit,
    isSelected,
    draggingReservationId,
    setDraggingReservationId,
    clearDragState,
  } = useReservationWorkspace()
  const [isSavingListStatus, setIsSavingListStatus] = useState(false)

  const hostManagerSummary = useMemo(
    () => buildHostManagerSummary(
      listReservations,
      floorPlanProps.nowMinutes,
      floorPlanProps.todayKey,
    ),
    [listReservations, floorPlanProps.nowMinutes, floorPlanProps.todayKey],
  )

  const handleStatusChange = async (reservation, status) => {
    if (!onQuickStatusUpdate) return

    setIsSavingListStatus(true)
    try {
      await onQuickStatusUpdate(reservation, status)
    } finally {
      setIsSavingListStatus(false)
    }
  }

  return (
    <div className={`host-operations-canvas-shell${floorPlanMode === 'edit' ? ' is-layout-edit-mode' : ''}`}>
    <div
      ref={canvasRef}
      className="host-operations-canvas"
      data-timeline-collapsed={isTimelineCollapsed ? 'true' : 'false'}
      data-floor-plan-mode={floorPlanMode}
    >
      {floorPlanMode !== 'edit' ? (
      <section className="host-operations-list" aria-label="Reservation list">
        <div className="host-operations-list-sticky">
          <div className="host-operations-list-header">
            <div>
              <p className="eyebrow">Service</p>
              <h4>Reservation list</h4>
            </div>
            <span className="host-operations-list-count">{listReservations.length}</span>
          </div>
          <HostManagerSummaryBar summary={hostManagerSummary} />
          <HostServicePressureBar
            slots={hostServicePressureSlots}
            nowMinutes={floorPlanProps.nowMinutes}
            selectedHour={serviceHourFilter}
            onHourSelect={onServiceHourFilterChange}
          />
          <HostReservationListControls
            listFilter={listFilter}
            listSort={listSort}
            activeChip={activeChip}
            chipCounts={chipCounts}
            onListFilterChange={onListFilterChange}
            onListSortChange={onListSortChange}
            onActiveChipChange={onActiveChipChange}
          />
        </div>
        <div className="host-operations-list-scroll">
          <HostReservationList
            reservations={listReservations}
            nowMinutes={floorPlanProps.nowMinutes}
            todayKey={floorPlanProps.todayKey}
            isLoading={isLoading}
            isSelected={isSelected}
            hostEditingReservation={hostEditingReservation}
            draggingReservationId={draggingReservationId}
            onOpenEdit={openHostEdit}
            onDragStart={(event, reservation) => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('application/x-reservation-id', String(reservation.id))
              event.dataTransfer.setData('text/plain', String(reservation.id))
              setDraggingReservationId(String(reservation.id))
            }}
            onDragEnd={clearDragState}
            isSavingStatus={isSavingListStatus || isSavingStatus}
            onStatusChange={handleStatusChange}
            helpers={HOST_LIST_HELPERS}
          />
        </div>
      </section>
      ) : null}

      <section className="host-operations-floor" aria-label="Floor plan">
        {floorPlanMode === 'edit' ? (
          <EmbeddedFloorPlanEditor
            onExit={() => setFloorPlanMode('view')}
            initialAreaId={activeFloorAreaId}
            onActiveAreaChange={setActiveFloorAreaId}
          />
        ) : (
          <FloorPlanView {...floorPlanProps} isCompact />
        )}
      </section>

      {floorPlanMode !== 'edit' ? (
      <section className={`host-operations-timeline${isTimelineCollapsed ? ' is-collapsed' : ''}`} aria-label="Service timeline">
        <button
          type="button"
          className="host-timeline-toggle-bar"
          onClick={() => setIsTimelineCollapsed((current) => !current)}
          aria-expanded={!isTimelineCollapsed}
        >
          <span className={`host-timeline-chevron${isTimelineCollapsed ? '' : ' is-expanded'}`} aria-hidden="true">
            {isTimelineCollapsed ? '▲' : '▼'}
          </span>
          <span>{isTimelineCollapsed ? 'Open timeline' : 'Close timeline'}</span>
        </button>
        {!isTimelineCollapsed ? (
          <ServiceTimelinePanel {...timelinePanelProps} showIntelligence={false} />
        ) : null}
      </section>
      ) : null}
    </div>

    {hostEditingReservation && floorPlanMode !== 'edit' ? (
      <div className="host-reservation-edit-overlay" role="presentation">
        <HostReservationEditErrorBoundary
          reservationId={hostEditingReservation.id}
          onClose={closeHostEdit}
        >
          <HostReservationEditPanel
            variant="drawer"
            reservation={hostEditingReservation}
            form={hostEditForm}
            layout={layout}
            reservations={floorPlanProps.allReservations}
            todayKey={floorPlanProps.todayKey}
            onChange={setHostEditForm}
            onSave={async () => {
              if (!onHostEditSave || !hostEditForm) return
              const result = await onHostEditSave(
                hostEditingReservation,
                hostEditForm,
                floorPlanProps.todayKey,
              )
              if (!result?.saved) return
              closeHostEdit()
              if (result.movedOffSelectedDate) {
                clearSelection()
              }
            }}
            onDelete={async (id) => {
              if (!onHostEditDelete) return
              await onHostEditDelete(id)
              clearSelection()
              closeHostEdit()
            }}
            onCancel={closeHostEdit}
            onStartFloorPick={startHostFloorPick}
            isFloorPickActive={isHostFloorPickActive}
            isSaving={isSavingHostEdit}
          />
        </HostReservationEditErrorBoundary>
      </div>
    ) : null}
    </div>
  )
}

function ReservationsWorkspaceBody({
  reservations,
  onOpenAddReservation,
  onOpenQuickReservation,
  onOpenCommandPalette,
  isCommandPaletteOpen,
  onCloseCommandPalette,
  onOpenEditReservation,
  onQuickStatusUpdate,
  onQuickNoteUpdate,
  onTableReassign,
  onSeatGuestAtTable,
  onHostEditSave,
  onHostEditDelete,
  isLoading,
  noticeMessage,
  isSaving,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [listFilter, setListFilter] = useState('All')
  const [listSort, setListSort] = useState('service')
  const [activeChip, setActiveChip] = useState(null)
  const [serviceHourFilter, setServiceHourFilter] = useState(null)
  const [liveNow, setLiveNow] = useState(() => getLocalNow())
  const [noteDraftReservation, setNoteDraftReservation] = useState(null)
  const [noteDraftValue, setNoteDraftValue] = useState('')
  const [openMoreReservationId, setOpenMoreReservationId] = useState(null)

  useEffect(() => {
    const tick = () => setLiveNow(getLocalNow())

    tick()

    const now = getLocalNow()
    const msUntilNextMinute = ((60 - now.getSeconds()) * 1000) - now.getMilliseconds()
    let intervalId = null

    const timeoutId = window.setTimeout(() => {
      tick()
      intervalId = window.setInterval(tick, 60_000)
    }, Math.max(msUntilNextMinute, 0))

    return () => {
      window.clearTimeout(timeoutId)
      if (intervalId !== null) window.clearInterval(intervalId)
    }
  }, [])

  const todayKey = getCurrentDateKey()
  const nowMinutes = liveNow.getHours() * 60 + liveNow.getMinutes()
  const todayLabel = formatCurrentDateLabel()

  const selectedDateReservations = useMemo(
    () => getSelectedDateReservations(reservations, todayKey),
    [reservations, todayKey],
  )

  const todayReservations = useMemo(
    () => selectedDateReservations,
    [selectedDateReservations],
  )

  const upcomingReservations = useMemo(
    () => sortReservationsChronologically(
      reservations.filter((reservation) => getReservationDateKey(reservation) !== todayKey),
    ),
    [reservations, todayKey],
  )

  const serviceHealthMetrics = useMemo(
    () => buildServiceHealthMetrics(todayReservations, nowMinutes, todayKey),
    [nowMinutes, todayKey, todayReservations],
  )

  const serviceInsights = useMemo(
    () => buildServiceInsights(todayReservations, nowMinutes, todayKey, reservations),
    [nowMinutes, reservations, todayKey, todayReservations],
  )

  const arrivalWaves = useMemo(
    () => buildArrivalWaves(todayReservations, nowMinutes, todayKey),
    [nowMinutes, todayKey, todayReservations],
  )

  const searchNeedle = searchTerm.trim().toLowerCase()

  const filteredTodayReservations = useMemo(() => (
    todayReservations.filter((reservation) => (
      reservationMatchesSearch(reservation, searchNeedle)
    ))
  ), [searchNeedle, todayReservations])

  const allHostReservations = useMemo(
    () => sortReservationsChronologically([...todayReservations, ...upcomingReservations]),
    [todayReservations, upcomingReservations],
  )

  const hostSmartChipCounts = useMemo(
    () => buildHostSmartChipCounts(allHostReservations, nowMinutes, todayKey),
    [allHostReservations, nowMinutes, todayKey],
  )

  const hostListWithoutHourFilter = useMemo(() => (
    allHostReservations.filter((reservation) => (
      reservationMatchesSearch(reservation, searchNeedle)
      && hostListFilterMatch(reservation, listFilter, nowMinutes, todayKey)
      && (!activeChip || hostSmartChipMatch(reservation, activeChip, nowMinutes, todayKey))
      && !shouldHideInDefaultHostView(reservation, listFilter, listSort, nowMinutes, todayKey)
    ))
  ), [
    activeChip,
    allHostReservations,
    listFilter,
    listSort,
    nowMinutes,
    searchNeedle,
    todayKey,
  ])

  const hostServicePressureSlots = useMemo(
    () => buildHostServiceHourPressureSlots(hostListWithoutHourFilter),
    [hostListWithoutHourFilter],
  )

  const hostListReservations = useMemo(() => {
    const filtered = serviceHourFilter !== null && serviceHourFilter !== undefined
      ? hostListWithoutHourFilter.filter((reservation) => (
        reservationMatchesServiceHourBucket(reservation, serviceHourFilter)
      ))
      : hostListWithoutHourFilter

    return sortHostReservations(filtered, listSort, nowMinutes, todayKey)
  }, [
    hostListWithoutHourFilter,
    listSort,
    nowMinutes,
    serviceHourFilter,
    todayKey,
  ])

  const handleListFilterChange = (filter) => {
    setListFilter(filter)
    setActiveChip(null)
    setServiceHourFilter(null)
  }

  const handleActiveChipChange = (chip) => {
    setActiveChip(chip)
    setServiceHourFilter(null)
  }

  const handleServiceHourFilterChange = (hour) => {
    setServiceHourFilter(hour)
  }

  const nextArrivalId = useMemo(() => {
    const next = todayReservations.find((reservation) => {
      const status = normalizeReservationStatus(reservation.status)
      if (!isUpcomingReservationStatus(status)) return false
      const minutes = parseTimeToMinutes(reservation.time)
      return minutes !== null && minutes >= nowMinutes
    })
    return next?.id ?? null
  }, [nowMinutes, todayReservations])

  const activeTimelineReservationId = useMemo(
    () => getActiveTimelineReservationId(filteredTodayReservations, nowMinutes, todayKey),
    [filteredTodayReservations, nowMinutes, todayKey],
  )

  const currentServiceHour = Math.floor(nowMinutes / 60)

  const arrivalBoardRows = useMemo(
    () => buildArrivalBoardRows(filteredTodayReservations, nowMinutes),
    [filteredTodayReservations, nowMinutes],
  )

  const timelineNowPositionPercent = useMemo(
    () => getTimelineNowPositionPercent(arrivalBoardRows, nowMinutes),
    [arrivalBoardRows, nowMinutes],
  )

  const handleOpenAddNote = (reservation) => {
    setNoteDraftReservation(reservation)
    setNoteDraftValue(`${reservation.notes ?? ''}`)
    setOpenMoreReservationId(null)
  }

  const handleCloseAddNote = () => {
    setNoteDraftReservation(null)
    setNoteDraftValue('')
  }

  const handleSaveNote = async (event) => {
    event.preventDefault()
    if (!noteDraftReservation || !onQuickNoteUpdate) return
    await onQuickNoteUpdate(noteDraftReservation, noteDraftValue.trim())
    handleCloseAddNote()
  }

  const handleToggleMore = (reservationId) => {
    setOpenMoreReservationId((current) => (
      String(current) === String(reservationId) ? null : reservationId
    ))
  }

  const openAddReservationForServiceDate = useCallback((prefill) => {
    const safePrefill = prefill?.nativeEvent || prefill?.target ? {} : (prefill ?? {})
    onOpenAddReservation({
      ...safePrefill,
      date: normalizeReservationDateKey(safePrefill.date ?? todayKey),
    })
  }, [onOpenAddReservation, todayKey])

  const sharedCardProps = {
    allReservations: reservations,
    isSaving,
    nowMinutes,
    todayKey,
    onOpenAddNote: handleOpenAddNote,
    onOpenEditReservation,
    onQuickStatusUpdate,
  }

  const timelinePanelProps = {
    arrivalBoardRows,
    nowMinutes,
    todayKey,
    currentServiceHour,
    isLoading,
    filteredCount: filteredTodayReservations.length,
    serviceHealthMetrics,
    serviceInsights,
    arrivalWaves,
    timelineNowPositionPercent,
    activeTimelineReservationId,
    nextArrivalId,
    sharedCardProps,
    openMoreReservationId,
    onToggleMore: handleToggleMore,
  }

  const floorPlanProps = {
    reservations: filteredTodayReservations,
    allReservations: reservations,
    listReservations: hostListReservations,
    todayKey,
    nowMinutes,
    isSaving,
    onTableReassign,
    onSeatGuestAtTable,
    onQuickStatusUpdate,
    onOpenAddReservation: openAddReservationForServiceDate,
  }

  return (
    <PublishedFloorPlanProvider>
      <ReservationWorkspaceProvider
        filteredTodayReservations={filteredTodayReservations}
        onHostEditSave={onHostEditSave}
        onHostEditDelete={onHostEditDelete}
        isSavingHostEdit={isSaving}
      >
        <ReservationsWorkspaceContent
        reservations={reservations}
        onOpenAddReservation={openAddReservationForServiceDate}
        onOpenQuickReservation={onOpenQuickReservation}
        onOpenCommandPalette={onOpenCommandPalette}
        isCommandPaletteOpen={isCommandPaletteOpen}
        onCloseCommandPalette={onCloseCommandPalette}
        onOpenEditReservation={onOpenEditReservation}
        onQuickStatusUpdate={onQuickStatusUpdate}
        onTableReassign={onTableReassign}
        onOpenAddNote={handleOpenAddNote}
        isLoading={isLoading}
        noticeMessage={noticeMessage}
        isSaving={isSaving}
        todayKey={todayKey}
        todayLabel={todayLabel}
        nowMinutes={nowMinutes}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        listFilter={listFilter}
        listSort={listSort}
        activeChip={activeChip}
        chipCounts={hostSmartChipCounts}
        onListFilterChange={handleListFilterChange}
        onListSortChange={setListSort}
        onActiveChipChange={handleActiveChipChange}
        hostListReservations={hostListReservations}
        hostServicePressureSlots={hostServicePressureSlots}
        serviceHourFilter={serviceHourFilter}
        onServiceHourFilterChange={handleServiceHourFilterChange}
        timelinePanelProps={timelinePanelProps}
        floorPlanProps={floorPlanProps}
        sharedCardProps={sharedCardProps}
        openMoreReservationId={openMoreReservationId}
        onToggleMore={handleToggleMore}
        noteDraftReservation={noteDraftReservation}
        noteDraftValue={noteDraftValue}
        onNoteDraftValueChange={setNoteDraftValue}
        onCloseAddNote={handleCloseAddNote}
        onSaveNote={handleSaveNote}
      />
      </ReservationWorkspaceProvider>
    </PublishedFloorPlanProvider>
  )
}

function ReservationsWorkspaceContent({
  reservations,
  onOpenAddReservation,
  onOpenQuickReservation,
  onOpenCommandPalette: _onOpenCommandPalette,
  isCommandPaletteOpen,
  onCloseCommandPalette,
  onOpenEditReservation,
  onQuickStatusUpdate,
  onTableReassign: _onTableReassign,
  onOpenAddNote,
  isLoading,
  noticeMessage,
  isSaving,
  todayKey,
  todayLabel,
  nowMinutes,
  searchTerm,
  onSearchTermChange,
  listFilter,
  listSort,
  activeChip,
  chipCounts,
  onListFilterChange,
  onListSortChange,
  onActiveChipChange,
  hostListReservations,
  hostServicePressureSlots,
  serviceHourFilter,
  onServiceHourFilterChange,
  timelinePanelProps,
  floorPlanProps,
  sharedCardProps: _sharedCardProps,
  openMoreReservationId: _openMoreReservationId,
  onToggleMore: _onToggleMore,
  noteDraftReservation,
  noteDraftValue,
  onNoteDraftValueChange,
  onCloseAddNote,
  onSaveNote,
}) {
  const {
    selectedReservation,
    isGuestProfileOpen,
    clearSelection,
    floorPlanMode,
  } = useReservationWorkspace()

  const isLayoutEditMode = floorPlanMode === 'edit'

  return (
    <section className={`staff-page reservations-workspace reservations-workspace-host${isLayoutEditMode ? ' is-layout-edit-mode' : ''}`}>
      {!isLayoutEditMode ? (
      <div className="reservations-command-sticky">
        <header className="reservations-executive-header schedule-header panel reservations-host-header">
          <div className="schedule-header-copy reservations-executive-copy">
            <p className="eyebrow schedule-header-eyebrow">Host view</p>
            <h3 className="schedule-header-title">Reservations &amp; floor plan</h3>
            <p className="schedule-header-range reservations-executive-subtitle">See who is arriving, where they are seated, and what the floor looks like right now.</p>
          </div>
          <div className="schedule-header-controls reservations-executive-controls">
            <div className="schedule-header-control-surface reservations-control-surface">
              <label className="reservations-search" aria-label="Search reservations">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => onSearchTermChange(event.target.value)}
                  placeholder="Search guest, table, or phone"
                />
              </label>
              <time className="reservations-current-date" dateTime={todayKey}>{todayLabel}</time>
              <button type="button" className="primary-btn reservations-add-btn" onClick={onOpenAddReservation} disabled={isSaving}>
                {isSaving ? 'Saving…' : '+ Add Reservation'}
              </button>
            </div>
          </div>
        </header>
      </div>
      ) : (
        <header className="reservations-layout-edit-page-header">
          <div>
            <p className="eyebrow">Floor plan</p>
            <h3>Edit layout</h3>
          </div>
        </header>
      )}

      {!isLayoutEditMode && noticeMessage ? (
        <div key={noticeMessage} className="reservations-toast" role="status" aria-live="polite">
          {noticeMessage}
        </div>
      ) : null}
      {!isLayoutEditMode && isLoading ? <div className="staff-status-banner reservations-notice">Loading reservations…</div> : null}

      <div className="reservations-host-panel">
        <ReservationsUnifiedCanvas
          timelinePanelProps={timelinePanelProps}
          floorPlanProps={floorPlanProps}
          listReservations={hostListReservations}
          listFilter={listFilter}
          listSort={listSort}
          activeChip={activeChip}
          chipCounts={chipCounts}
          onListFilterChange={onListFilterChange}
          onListSortChange={onListSortChange}
          onActiveChipChange={onActiveChipChange}
          hostServicePressureSlots={hostServicePressureSlots}
          serviceHourFilter={serviceHourFilter}
          onServiceHourFilterChange={onServiceHourFilterChange}
          isLoading={isLoading}
          onQuickStatusUpdate={onQuickStatusUpdate}
          isSavingStatus={isSaving}
        />
      </div>

      {selectedReservation && isGuestProfileOpen && !isLayoutEditMode ? (
        <GuestProfileDrawer
          reservation={selectedReservation}
          allReservations={reservations}
          nowMinutes={nowMinutes}
          todayKey={todayKey}
          onClose={clearSelection}
          onOpenEditReservation={onOpenEditReservation}
          onQuickStatusUpdate={onQuickStatusUpdate}
        />
      ) : null}

      {isCommandPaletteOpen ? (
        <ReservationsCommandPalette
          reservations={reservations}
          todayKey={todayKey}
          nowMinutes={nowMinutes}
          isSaving={isSaving}
          onClose={onCloseCommandPalette}
          onOpenAddReservation={onOpenAddReservation}
          onOpenQuickReservation={onOpenQuickReservation}
          onOpenEditReservation={onOpenEditReservation}
          onQuickStatusUpdate={onQuickStatusUpdate}
          onOpenAddNote={onOpenAddNote}
        />
      ) : null}

      {noteDraftReservation ? (
        <div className="employee-modal-backdrop" onClick={onCloseAddNote}>
          <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Guest note</p>
                <h3>{formatReservationGuestName(noteDraftReservation.guestName)}</h3>
              </div>
              <button type="button" className="icon-btn" onClick={onCloseAddNote}>✕</button>
            </div>
            <form className="employee-form" onSubmit={onSaveNote}>
              <label className="form-field full-width">
                <span>Note</span>
                <textarea
                  rows="4"
                  value={noteDraftValue}
                  onChange={(event) => onNoteDraftValueChange(event.target.value)}
                  placeholder="Add service notes, preferences, or reminders"
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={onCloseAddNote}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function ReservationsView(props) {
  return <ReservationsWorkspaceBody {...props} />
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

function countInventoryItemsForSupplier(inventoryItems, companyName) {
  const trimmed = `${companyName ?? ''}`.trim()
  if (!trimmed) return 0

  return (inventoryItems ?? []).filter((item) => `${item?.supplier ?? ''}`.trim() === trimmed).length
}

function buildInventorySupplierOptions(suppliers, selectedSupplier = '') {
  const trimmedSelected = `${selectedSupplier ?? ''}`.trim()
  const supplierNames = new Set(
    (suppliers ?? [])
      .map((supplier) => `${supplier.companyName ?? ''}`.trim())
      .filter(Boolean),
  )

  const options = [{ value: '', label: 'No supplier' }]

  ;(suppliers ?? []).forEach((supplier) => {
    const name = `${supplier.companyName ?? ''}`.trim()
    if (!name) return
    options.push({ value: name, label: name })
  })

  if (trimmedSelected && !supplierNames.has(trimmedSelected)) {
    options.push({ value: trimmedSelected, label: `Legacy: ${trimmedSelected}` })
  }

  return options
}

function hasSupplierField(value) {
  return `${value ?? ''}`.trim().length > 0
}

function SupplierCard({
  supplier,
  linkedCount = 0,
  onOpenEditSupplier,
  onRequestDeleteSupplier,
}) {
  const hasPhone = hasSupplierField(supplier.phone)
  const hasEmail = hasSupplierField(supplier.email)
  const hasAddress = hasSupplierField(supplier.address)
  const hasTaxId = hasSupplierField(supplier.taxId)
  const hasPaymentTerms = hasSupplierField(supplier.paymentTerms)
  const hasDeliveryDays = hasSupplierField(supplier.deliveryDays)
  const hasNotes = hasSupplierField(supplier.notes)
  const hasContactPerson = hasSupplierField(supplier.contactPerson)
  const hasContactSection = hasPhone || hasEmail || hasAddress
  const hasBusinessSection = hasTaxId || hasPaymentTerms || hasDeliveryDays
  const hasAdditionalInfo = hasContactSection || hasBusinessSection || hasNotes

  return (
    <article className="supplier-card">
      <header className="supplier-card-header">
        <div className="supplier-card-identity">
          <div className="roster-avatar">{getInitials(supplier.companyName || 'Supplier')}</div>
          <div className="supplier-card-title-block">
            <strong className="supplier-card-company">{supplier.companyName || 'Unnamed supplier'}</strong>
            {hasContactPerson ? (
              <p className="supplier-card-contact-person">
                <span aria-hidden="true">👤 </span>
                {supplier.contactPerson}
              </p>
            ) : null}
          </div>
        </div>

        <div className="supplier-card-header-aside">
          {linkedCount > 0 ? (
            <span className="supplier-stock-badge">
              📦 {linkedCount} Stock Item{linkedCount === 1 ? '' : 's'}
            </span>
          ) : null}
          <div className="supplier-card-header-actions">
            <button
              type="button"
              className="ghost-btn supplier-card-action-btn"
              onClick={() => onOpenEditSupplier?.(supplier)}
            >
              Edit
            </button>
            <button
              type="button"
              className="ghost-btn supplier-card-action-btn supplier-card-delete-btn"
              onClick={() => onRequestDeleteSupplier?.(supplier)}
            >
              Delete
            </button>
          </div>
        </div>
      </header>

      {!hasAdditionalInfo ? (
        <p className="supplier-card-empty-info">No additional supplier information.</p>
      ) : null}

      {hasContactSection ? (
        <section className="supplier-card-section">
          <p className="supplier-card-section-label">Contact</p>
          <ul className="supplier-card-detail-list">
            {hasPhone ? (
              <li>
                <span className="supplier-card-detail-icon" aria-hidden="true">☎</span>
                <span>{supplier.phone}</span>
              </li>
            ) : null}
            {hasEmail ? (
              <li>
                <span className="supplier-card-detail-icon" aria-hidden="true">✉</span>
                <span>{supplier.email}</span>
              </li>
            ) : null}
            {hasAddress ? (
              <li>
                <span className="supplier-card-detail-icon" aria-hidden="true">📍</span>
                <span>{supplier.address}</span>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {hasBusinessSection ? (
        <section className="supplier-card-section">
          <p className="supplier-card-section-label">Business info</p>
          <ul className="supplier-card-detail-list supplier-card-detail-list-labeled">
            {hasTaxId ? (
              <li className="supplier-card-detail-item-labeled">
                <div className="supplier-card-detail-heading">
                  <span className="supplier-card-detail-icon" aria-hidden="true">🧾</span>
                  <span className="supplier-card-detail-name">VAT / Tax ID</span>
                </div>
                <span className="supplier-card-detail-value">{supplier.taxId}</span>
              </li>
            ) : null}
            {hasPaymentTerms ? (
              <li className="supplier-card-detail-item-labeled">
                <div className="supplier-card-detail-heading">
                  <span className="supplier-card-detail-icon" aria-hidden="true">💳</span>
                  <span className="supplier-card-detail-name">Payment Terms</span>
                </div>
                <span className="supplier-card-detail-value">{supplier.paymentTerms}</span>
              </li>
            ) : null}
            {hasDeliveryDays ? (
              <li className="supplier-card-detail-item-labeled">
                <div className="supplier-card-detail-heading">
                  <span className="supplier-card-detail-icon" aria-hidden="true">🚚</span>
                  <span className="supplier-card-detail-name">Delivery Days</span>
                </div>
                <span className="supplier-card-detail-value">{supplier.deliveryDays}</span>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {hasNotes ? (
        <section className="supplier-card-section">
          <p className="supplier-card-section-label">Notes</p>
          <p className="supplier-card-notes">{supplier.notes}</p>
        </section>
      ) : null}
    </article>
  )
}

function SuppliersView({
  suppliers,
  inventoryItems = [],
  onOpenAddSupplier,
  onOpenEditSupplier,
  onRequestDeleteSupplier,
  isLoading,
  noticeMessage,
  isSaving,
  searchTerm,
  onSearchTermChange,
}) {
  const filteredSuppliers = useMemo(() => {
    const needle = `${searchTerm}`.trim().toLowerCase()
    if (!needle) return suppliers

    return suppliers.filter((supplier) => (
      `${supplier.companyName} ${supplier.contactPerson} ${supplier.phone} ${supplier.email} ${supplier.address} ${supplier.taxId ?? ''}`.toLowerCase().includes(needle)
    ))
  }, [suppliers, searchTerm])

  const linkedCountBySupplierId = useMemo(() => {
    const counts = new Map()

    suppliers.forEach((supplier) => {
      counts.set(supplier.id, countInventoryItemsForSupplier(inventoryItems, supplier.companyName))
    })

    return counts
  }, [suppliers, inventoryItems])

  const supplierSummary = useMemo(() => {
    let connectedToStock = 0
    let withoutStockItems = 0

    suppliers.forEach((supplier) => {
      const linkedCount = linkedCountBySupplierId.get(supplier.id) ?? 0
      if (linkedCount > 0) {
        connectedToStock += 1
      } else {
        withoutStockItems += 1
      }
    })

    return {
      total: suppliers.length,
      connectedToStock,
      withoutStockItems,
    }
  }, [suppliers, linkedCountBySupplierId])

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
          <h3>{supplierSummary.total}</h3>
        </article>
        <article className="roster-summary-card">
          <p className="eyebrow">Connected to stock</p>
          <h3>{supplierSummary.connectedToStock}</h3>
        </article>
        <article className="roster-summary-card">
          <p className="eyebrow">Without stock items</p>
          <h3>{supplierSummary.withoutStockItems}</h3>
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
          <div className="supplier-card-list">
            {filteredSuppliers.map((supplier) => (
              <SupplierCard
                key={supplier.id}
                supplier={supplier}
                linkedCount={linkedCountBySupplierId.get(supplier.id) ?? 0}
                onOpenEditSupplier={onOpenEditSupplier}
                onRequestDeleteSupplier={onRequestDeleteSupplier}
              />
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
  const [isShiftOverlapConfirmOpen, setIsShiftOverlapConfirmOpen] = useState(false)
  const shiftOverlapConfirmResolverRef = useRef(null)
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
  const [isQuickReservationOpen, setIsQuickReservationOpen] = useState(false)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [editingReservation, setEditingReservation] = useState(null)
  const [reservationForm, setReservationForm] = useState({
    guestName: '',
    phone: '',
    date: '',
    time: '',
    guests: '2',
    tableNumber: '',
    area: 'Main Dining',
    seatingAreaId: '',
    status: 'Pending',
    notes: '',
    assignedUnits: [],
    extraChairs: 0,
    standingGuests: 0,
  })
  const [quickReservationForm, setQuickReservationForm] = useState({
    guestName: '',
    time: '',
    guests: '2',
    tableNumber: '',
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
  const [supplierModalOrigin, setSupplierModalOrigin] = useState(null)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [supplierForm, setSupplierForm] = useState({
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    taxId: '',
    paymentTerms: '',
    deliveryDays: '',
    notes: '',
  })
  const [isSavingSupplier, setIsSavingSupplier] = useState(false)
  const [supplierPendingDelete, setSupplierPendingDelete] = useState(null)
  const [isDeletingSupplier, setIsDeletingSupplier] = useState(false)
  const [tasks, setTasks] = useState([])
  const [tasksNotice, setTasksNotice] = useState('')
  const [tasksError, setTasksError] = useState('')
  const [isTasksLoading, setIsTasksLoading] = useState(false)
  const [isSavingTask, setIsSavingTask] = useState(false)
  const [openTasksCreateModal, setOpenTasksCreateModal] = useState(false)
  const [taskTemplates, setTaskTemplates] = useState([])
  const [taskTemplatesError, setTaskTemplatesError] = useState('')
  const [taskTemplatesNotice, setTaskTemplatesNotice] = useState('')
  const [isTaskTemplatesLoading, setIsTaskTemplatesLoading] = useState(false)
  const [isSavingTaskTemplate, setIsSavingTaskTemplate] = useState(false)
  const [isGeneratingTasksFromTemplates, setIsGeneratingTasksFromTemplates] = useState(false)
  const [checklistItemsByTaskId, setChecklistItemsByTaskId] = useState({})
  const [templateChecklistItemsByTemplateId, setTemplateChecklistItemsByTemplateId] = useState({})
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
  const [isTasksModuleConnected, setIsTasksModuleConnected] = useState(false)
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

  const todayReservationsSummary = useMemo(
    () => buildTodayReservationsSummary(reservations, currentDateKey),
    [reservations, currentDateKey],
  )

  const dashboardIssuesSummary = useMemo(
    () => buildDashboardIssuesSummary(operationalSnapshot),
    [operationalSnapshot],
  )

  const dashboardStockAlerts = useMemo(
    () => getLowStockAlertItems(inventoryItems),
    [inventoryItems],
  )

  const dashboardTaskOverview = useMemo(
    () => calculateTaskOverview(tasks, currentDateKey),
    [tasks, currentDateKey],
  )

  const currentTaskEmployeeId = useMemo(
    () => resolveCurrentEmployeeId(workspaceProfile.managerName, scheduleEmployees),
    [workspaceProfile.managerName, scheduleEmployees],
  )

  const dashboardBusinessHealth = useMemo(() => buildBusinessHealthSummary({
    issuesSummary: dashboardIssuesSummary,
    stockAlerts: dashboardStockAlerts,
    inventoryConnected: isInventoryModuleConnected,
  }), [dashboardIssuesSummary, dashboardStockAlerts, isInventoryModuleConnected])

  const dashboardExecutiveLabour = useMemo(() => {
    const todayShifts = dashboardShifts.filter((shift) => {
      const raw = `${shift.date ?? ''}`.trim()
      const normalized = raw.includes('T') ? raw.split('T')[0] : raw.slice(0, 10)
      return normalized === currentDateKey
    })

    return buildExecutiveLabourSummary({
      snapshot: operationalSnapshot,
      todayShifts,
      employees: scheduleEmployees,
    })
  }, [dashboardShifts, operationalSnapshot, scheduleEmployees, currentDateKey])

  const dashboardOperationalSummary = useMemo(() => buildDashboardOperationalSummary({
    snapshot: operationalSnapshot,
    reservationsSummary: todayReservationsSummary,
    reservationsConnected: isReservationsModuleConnected,
    stockAlerts: dashboardStockAlerts,
    inventoryConnected: isInventoryModuleConnected,
    issuesSummary: dashboardIssuesSummary,
    liveFloor: liveFloorState,
    now: localNow,
  }), [
    operationalSnapshot,
    todayReservationsSummary,
    isReservationsModuleConnected,
    dashboardStockAlerts,
    isInventoryModuleConnected,
    dashboardIssuesSummary,
    liveFloorState,
    localNow,
  ])

  const dashboardReservationsFooter = useMemo(
    () => buildReservationsFooter(reservations, currentDateKey, localNow),
    [reservations, currentDateKey, localNow],
  )

  const dashboardTimelineEvents = useMemo(() => buildTodayCommandTimeline({
    shifts: dashboardShifts,
    shiftTemplates,
    reservations,
    todayKey: currentDateKey,
    reservationsConnected: isReservationsModuleConnected,
  }), [
    dashboardShifts,
    shiftTemplates,
    reservations,
    currentDateKey,
    isReservationsModuleConnected,
  ])

  const dashboardHeroDateLabel = useMemo(
    () => formatDashboardHeroDate(localNow, workspaceTimeZone),
    [localNow, workspaceTimeZone],
  )

  const dashboardLiveStatus = useMemo(() => {
    if (liveFloorState.state === 'live') {
      const count = liveFloorState.onShiftCount
      return {
        chipLabel: 'On Shift',
        chipValue: String(count),
        chipStatus: count === 1 ? 'team member live' : 'team members live',
        tone: 'live',
      }
    }

    if (liveFloorState.state === 'idle' && liveFloorState.nextShiftStartLabel) {
      return {
        chipLabel: 'Next Shift',
        chipValue: liveFloorState.nextShiftStartLabel,
        chipStatus: 'Standby',
        tone: 'standby',
      }
    }

    if (liveFloorState.state === 'unpublished') {
      return {
        chipLabel: 'Schedule',
        chipValue: 'Draft',
        chipStatus: 'Publish to go live',
        tone: 'draft',
      }
    }

    return {
      chipLabel: 'Status',
      chipValue: 'Standby',
      chipStatus: 'No active shift',
      tone: 'standby',
    }
  }, [liveFloorState])

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

  const refreshTaskChecklists = useCallback(async (remoteTasks = []) => {
    const taskIds = (remoteTasks ?? []).map((task) => task.id).filter(Boolean)
    if (taskIds.length === 0) {
      setChecklistItemsByTaskId({})
      return {}
    }

    try {
      const grouped = await getChecklistItemsForTasks(taskIds)
      setChecklistItemsByTaskId(grouped)
      return grouped
    } catch {
      setChecklistItemsByTaskId({})
      return {}
    }
  }, [])

  const refreshTemplateChecklists = useCallback(async (remoteTemplates = []) => {
    const templateIds = (remoteTemplates ?? []).map((template) => template.id).filter(Boolean)
    if (templateIds.length === 0) {
      setTemplateChecklistItemsByTemplateId({})
      return {}
    }

    try {
      const grouped = await getTemplateChecklistItems(templateIds)
      setTemplateChecklistItemsByTemplateId(grouped)
      return grouped
    } catch {
      setTemplateChecklistItemsByTemplateId({})
      return {}
    }
  }, [])

  const refreshTasks = useCallback(async () => {
    setIsTasksLoading(true)
    setTasksError('')

    try {
      const remoteTasks = await getTasks()
      setTasks(remoteTasks)
      setIsTasksModuleConnected(true)
      await refreshTaskChecklists(remoteTasks)
      return remoteTasks
    } catch (error) {
      setTasks([])
      setChecklistItemsByTaskId({})
      setTasksError(error?.message || 'Unable to load tasks right now.')
      setIsTasksModuleConnected(!isModuleUnavailableMessage(error?.message))
      throw error
    } finally {
      setIsTasksLoading(false)
    }
  }, [refreshTaskChecklists])

  const refreshTaskTemplates = useCallback(async () => {
    setIsTaskTemplatesLoading(true)
    setTaskTemplatesError('')

    try {
      const remoteTemplates = await getTaskTemplates()
      setTaskTemplates(remoteTemplates)
      await refreshTemplateChecklists(remoteTemplates)
      return remoteTemplates
    } catch (error) {
      setTaskTemplates([])
      setTemplateChecklistItemsByTemplateId({})
      setTaskTemplatesError(error?.message || 'Unable to load task templates right now.')
      throw error
    } finally {
      setIsTaskTemplatesLoading(false)
    }
  }, [refreshTemplateChecklists])

  const refreshDashboardModuleData = useCallback(async () => {
    await Promise.allSettled([
      refreshReservations(),
      refreshInventory(),
      refreshTasks(),
    ])
  }, [refreshInventory, refreshReservations, refreshTasks])

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
    if (activeView !== 'tasks') return undefined
    refreshTasks()
    refreshTaskTemplates()
    return undefined
  }, [activeView, refreshTasks, refreshTaskTemplates])

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
        setScheduleEmployees((current) => (current.length > 0 ? current : []))
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

  useEffect(() => {
    if (!reservationNotice) return undefined

    const timer = window.setTimeout(() => {
      setReservationNotice('')
    }, 3000)

    return () => window.clearTimeout(timer)
  }, [reservationNotice])

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

  const handleSaveCurrentWeekTemplate = async ({ name, weekDays, weekShifts, weekCapacities = [] }) => {
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

    const createdTemplate = await createWeeklyScheduleTemplate({
      name: name.trim(),
      shifts: uniqueTemplateShifts,
    })

    if (createdTemplate?.id) {
      saveWeeklyTemplateCapacitySnapshot(
        createdTemplate.id,
        buildWeeklyTemplateCapacitySnapshot(weekDays, weekCapacities),
      )
    }

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

      await deleteScheduleCapacitiesForDates(weekDays.map((day) => day.key))

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

      const savedCapacitySnapshot = mapWeeklyTemplateCapacitySnapshotToWeek(
        getWeeklyTemplateCapacitySnapshot(templateId),
        weekDays,
      )

      if (savedCapacitySnapshot.length > 0) {
        await applyScheduleCapacitiesForWeek({
          weekDays,
          capacities: savedCapacitySnapshot,
        })
      } else {
        await applyMinimumCapacitiesFromShifts(created)
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
    deleteWeeklyTemplateCapacitySnapshot(templateId)
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

      await deleteScheduleCapacitiesForDates(targetWeekDays.map((day) => day.key))

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

      await copyScheduleCapacitiesForWeek({
        sourceDateKeys: sourceWeekDays.map((day) => day.key),
        targetDateKeys: targetWeekDays.map((day) => day.key),
      })

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

      await deleteScheduleCapacitiesForDates(targetDateKeys)

      const created = await bulkCreateShiftsFromSource(sourceWeekShifts, (shift) => {
        const dayIndex = sourceByDate.get(shift.date)
        return targetDateByIndex.get(dayIndex)
      })

      await copyScheduleCapacitiesForWeek({
        sourceDateKeys: sourceWeekDays.map((day) => day.key),
        targetDateKeys: targetWeekDays.map((day) => day.key),
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

  const getShiftConflict = ({ employeeId, date, startTime, endTime, excludeShiftId = null, shiftTemplateId = null }) => {
    const normalizedStart = normalizeTimeValue(startTime)
    const normalizedEnd = normalizeTimeValue(endTime)
    const startMinutes = parseShiftTimeToMinutes(normalizedStart)
    const endMinutes = parseShiftTimeToMinutes(normalizedEnd)

    if (!employeeId || !date || startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
      return { type: null }
    }

    const normalizedDate = normalizeCellDateKey(date)
    const targetCellKey = shiftTemplateId && normalizedDate
      ? `${String(shiftTemplateId)}:${normalizedDate}`
      : null

    const sameDayShifts = shifts.filter((shift) => {
      if (excludeShiftId && String(shift.id) === String(excludeShiftId)) return false
      return String(shift.employeeId) === String(employeeId) && normalizeCellDateKey(shift.date) === normalizedDate
    })

    const duplicate = targetCellKey
      ? sameDayShifts.find((shift) => buildShiftCellKeyFromRecord(shift) === targetCellKey)
      : sameDayShifts.find((shift) => (
        normalizeTimeValue(shift.startTime) === normalizedStart
        && normalizeTimeValue(shift.endTime) === normalizedEnd
      ))

    if (duplicate) {
      return { type: 'duplicate', shift: duplicate }
    }

    const overlap = sameDayShifts.find((shift) => {
      if (targetCellKey && buildShiftCellKeyFromRecord(shift) === targetCellKey) {
        return false
      }

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

  const requestShiftOverlapConfirmation = () => new Promise((resolve) => {
    shiftOverlapConfirmResolverRef.current = resolve
    setIsShiftOverlapConfirmOpen(true)
  })

  const resolveShiftOverlapConfirmation = (confirmed) => {
    setIsShiftOverlapConfirmOpen(false)
    const resolve = shiftOverlapConfirmResolverRef.current
    shiftOverlapConfirmResolverRef.current = null
    resolve?.(confirmed)
  }

  const ensureShiftOverlapAllowed = async (conflict) => {
    if (conflict?.type !== 'overlap') {
      return true
    }
    return requestShiftOverlapConfirmation()
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
      shiftTemplateId: resolveShiftTemplateId(template),
    })

    if (conflict.type === 'duplicate') {
      throw new Error('This employee is already assigned here.')
    }

    if (!(await ensureShiftOverlapAllowed(conflict))) {
      throw new Error('Assignment cancelled.')
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
      shiftTemplateId: targetShift.shiftTemplateId ?? null,
    })

    if (conflict.type === 'duplicate') {
      throw new Error('This employee is already assigned here.')
    }

    if (!(await ensureShiftOverlapAllowed(conflict))) {
      throw new Error('Assignment cancelled.')
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
      shiftTemplateId: targetShift.shiftTemplateId ?? null,
    })

    if (conflict.type === 'duplicate') {
      throw new Error('This employee is already assigned here.')
    }

    if (!(await ensureShiftOverlapAllowed(conflict))) {
      throw new Error('Assignment cancelled.')
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
      shiftTemplateId: targetTemplateId ?? null,
    })

    if (conflict.type === 'duplicate') {
      throw new Error('This employee is already assigned here.')
    }

    if (!(await ensureShiftOverlapAllowed(conflict))) {
      throw new Error('Assignment cancelled.')
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
    const normalizedTargetDate = normalizeCellDateKey(shiftDate)

    if (
      normalizedTargetDate === normalizeCellDateKey(sourceShift.date)
      && sourceTemplateId
      && targetTemplateId
      && sourceTemplateId === targetTemplateId
    ) {
      throw new Error('This employee is already assigned here.')
    }

    if ((cellShifts ?? []).some((shift) => String(shift.employeeId) === String(sourceShift.employeeId))) {
      throw new Error('This employee is already assigned here.')
    }

    const employeeId = sourceShift.employeeId
    const startTime = normalizeTimeValue(sourceShift.startTime) || normalizeTimeValue(template?.startTime)
    const endTime = normalizeTimeValue(sourceShift.endTime) || normalizeTimeValue(template?.endTime)
    const role = `${sourceShift.role ?? ''}`.trim()
    const area = `${template?.defaultArea ?? ''}`.trim() || `${sourceShift.area ?? ''}`.trim()

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
      shiftTemplateId: targetTemplateId ?? null,
    })

    if (conflict.type === 'duplicate') {
      throw new Error('This employee is already assigned here.')
    }

    if (!(await ensureShiftOverlapAllowed(conflict))) {
      throw new Error('Assignment cancelled.')
    }

    const matchedTemplate = shiftTemplates.find((item) => (
      resolveShiftTemplateId(item) === targetTemplateId
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
      shiftTemplateId: shift.shiftTemplateId ?? null,
    })

    if (conflict.type === 'duplicate') {
      setScheduleNotice('This employee is already assigned here.')
      return
    }

    if (!(await ensureShiftOverlapAllowed(conflict))) {
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

    const shiftDateKey = `${shift.date ?? ''}`.slice(0, 10)
    if (!shiftDateKey) {
      throw new Error('Shift date is invalid and cannot be copied.')
    }

    const weekStart = getWeekStartDate(parseLocalDate(shiftDateKey))
    const weekKeys = getWeekDateKeys(weekStart)
    const targetDates = getRestOfWeekDateKeys(shiftDateKey, weekKeys)

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

    const sourceTemplateId = shift.shiftTemplateId ?? resolveShiftTemplateId(shift)

    const candidateDates = targetDates.filter((date) => {
      const conflict = getShiftConflict({
        employeeId: shift.employeeId,
        date,
        startTime,
        endTime,
        shiftTemplateId: sourceTemplateId ?? null,
      })
      return conflict.type !== 'duplicate'
    })

    if (candidateDates.length === 0) {
      setScheduleNotice('No new shifts were created because this employee is already assigned on each remaining day.')
      return
    }

    setIsSavingShift(true)
    setScheduleNotice('')

    const gridShiftOptions = getGridShiftIntegrityOptions(shiftTemplates)

    try {
      const created = []
      for (const date of candidateDates) {
        const conflict = getShiftConflict({
          employeeId: shift.employeeId,
          date,
          startTime,
          endTime,
          shiftTemplateId: sourceTemplateId ?? null,
        })

        if (conflict.type === 'overlap' && !(await ensureShiftOverlapAllowed(conflict))) {
          continue
        }

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

    if (isEmployeeUnavailable(selectedEmployee)) {
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

    const selectedTemplate = formData.shift_template !== 'custom'
      ? shiftTemplates.find((template) => template.id === formData.shift_template)
      : null
    const resolvedTemplateId = editingShift?.shiftTemplateId ?? resolveShiftTemplateId(selectedTemplate)

    const conflict = getShiftConflict({
      employeeId,
      date: formData.shift_date,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      excludeShiftId: editingShift?.id ?? null,
      shiftTemplateId: resolvedTemplateId ?? null,
    })

    if (conflict.type === 'duplicate') {
      setScheduleNotice('This employee is already assigned here.')
      return
    }

    if (!(await ensureShiftOverlapAllowed(conflict))) {
      return
    }

    setIsSavingShift(true)
    setScheduleNotice('')

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
      shiftTemplateId: resolvedTemplateId,
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
    return scheduleEmployees.filter((employee) => !isEmployeeUnavailable(employee) || String(employee.id) === formData.employee_id)
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

  const handleOpenAddReservation = (options) => {
    const prefill = options?.nativeEvent || options?.target ? {} : (options ?? {})
    const table = prefill.table ?? null
    const layout = loadPublishedHostLayout()
    const defaultZone = layout?.zones?.[0]
    let assignedUnits = []
    let seatingAreaId = defaultZone?.id ?? ''
    let area = defaultZone?.label ?? 'Main Dining'

    if (table) {
      assignedUnits = [toSeatingUnitFromLayoutUnit(table)]
      seatingAreaId = table.zoneId ?? seatingAreaId
      const zone = layout?.zones?.find((entry) => entry.id === seatingAreaId)
      area = zone?.label ?? area
    }

    setEditingReservation(null)
    setReservationForm({
      guestName: '',
      phone: '',
      date: normalizeReservationDateKey(prefill.date ?? currentDateKey),
      time: '',
      guests: '2',
      tableNumber: '',
      area,
      seatingAreaId,
      status: 'Pending',
      notes: '',
      assignedUnits,
      extraChairs: 0,
      standingGuests: 0,
    })
    setIsReservationModalOpen(true)
  }

  const handleOpenQuickReservation = (prefill = {}) => {
    setQuickReservationForm({
      guestName: prefill.guestName ?? '',
      time: prefill.time ?? '',
      guests: `${prefill.guests ?? '2'}`,
      tableNumber: prefill.tableNumber ?? '',
    })
    setIsQuickReservationOpen(true)
  }

  const handleOpenCommandPalette = () => {
    setIsCommandPaletteOpen(true)
  }

  const handleCloseCommandPalette = () => {
    setIsCommandPaletteOpen(false)
  }

  const handleCloseQuickReservation = () => {
    setIsQuickReservationOpen(false)
    setQuickReservationForm({
      guestName: '',
      time: '',
      guests: '2',
      tableNumber: '',
    })
  }

  const detectedGuestReservation = useMemo(() => {
    if (editingReservation || !isReservationModalOpen) return null
    return getGuestMatchForName(reservationForm.guestName, reservations)
  }, [editingReservation, isReservationModalOpen, reservationForm.guestName, reservations])

  const guestNameSuggestions = useMemo(() => {
    if (editingReservation || !isReservationModalOpen) return []
    return findMatchingGuestProfiles(reservationForm.guestName, reservations)
  }, [editingReservation, isReservationModalOpen, reservationForm.guestName, reservations])

  const handleReservationGuestNameChange = (value) => {
    setReservationForm((current) => {
      const next = { ...current, guestName: value }

      if (!editingReservation) {
        const match = getGuestMatchForName(value, reservations)
        if (match) {
          const profile = buildGuestProfileInsights(match, reservations)
          if (!`${current.phone}`.trim()) next.phone = `${match.phone ?? ''}`.trim()
          if (!`${current.tableNumber}`.trim() && profile.favoriteTable !== '—') next.tableNumber = profile.favoriteTable
          if (current.area === 'Main Dining' && profile.favoriteArea !== '—') next.area = profile.favoriteArea
        }
      }

      return next
    })
  }

  const handleApplyGuestProfile = (guestReservation) => {
    setReservationForm((current) => applyGuestProfileToReservationForm(current, guestReservation, reservations))
  }

  useEffect(() => {
    if (activeView !== 'reservations') return undefined

    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (!isCommandPaletteOpen) {
          setIsCommandPaletteOpen(true)
        }
        return
      }

      if (event.key === 'Escape' && isCommandPaletteOpen) {
        event.preventDefault()
        setIsCommandPaletteOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeView, isCommandPaletteOpen])

  const handleDashboardQuickAction = (actionId) => {
    if (actionId === 'add-reservation') {
      setActiveView('reservations')
      handleOpenAddReservation()
      return
    }

    if (actionId === 'add-staff') {
      setActiveView('staff')
      handleOpenAddEmployee()
      return
    }

    if (actionId === 'add-task') {
      setActiveView('tasks')
      setOpenTasksCreateModal(true)
    }
  }

  const handleDashboardViewTasks = () => {
    setActiveView('tasks')
  }

  const handleDashboardViewStock = () => {
    setActiveView('stock')
  }

  const handleDashboardViewSchedule = () => {
    setActiveView('schedule')
  }

  const handleOpenEditReservation = (reservation) => {
    const layout = loadPublishedHostLayout()
    const assignment = getReservationSeatingAssignment(reservation)

    setEditingReservation(reservation)
    setReservationForm({
      guestName: reservation.guestName ?? '',
      phone: reservation.phone ?? '',
      date: reservation.date ?? '',
      time: normalizeReservationTimeValue(reservation.time),
      guests: `${reservation.guests ?? 2}`,
      tableNumber: reservation.tableNumber ?? '',
      area: reservation.area ?? 'Main Dining',
      seatingAreaId: resolveAreaIdForReservation(layout, reservation, assignment.assignedUnits),
      status: reservation.status ?? 'Pending',
      notes: reservation.notes ?? '',
      assignedUnits: assignment.assignedUnits ?? [],
      extraChairs: assignment.extraChairs ?? 0,
      standingGuests: assignment.standingGuests ?? 0,
    })
    setIsReservationModalOpen(true)
  }

  const handleCloseReservationModal = () => {
    setIsReservationModalOpen(false)
    setEditingReservation(null)
    setReservationForm({
      guestName: '',
      phone: '',
      date: currentDateKey,
      time: '',
      guests: '2',
      tableNumber: '',
      area: 'Main Dining',
      seatingAreaId: '',
      status: 'Pending',
      notes: '',
      assignedUnits: [],
      extraChairs: 0,
      standingGuests: 0,
    })
  }

  const handleHostEditSave = async (reservation, form, selectedDateKey) => {
    if (!form.guestName.trim()) {
      setReservationNotice('Please provide the guest name.')
      return { saved: false }
    }

    const nextDate = normalizeReservationDateKey(form.date)
    if (!nextDate) {
      setReservationNotice('Please select a reservation date.')
      return { saved: false }
    }

    setIsSavingReservation(true)
    setReservationNotice('')

    try {
      const payload = buildReservationUpdatePayload(reservation, {
        guestName: form.guestName.trim(),
        phone: form.phone.trim(),
        date: nextDate,
        time: form.time,
        guests: form.guests,
        customerType: form.customerType,
        status: form.status,
        notes: form.notes.trim(),
        area: form.area,
        assignedUnits: form.assignedUnits,
        extraChairs: form.extraChairs,
        standingGuests: form.standingGuests,
      })
      await updateReservation(reservation.id, payload)
      await refreshReservations()
      setReservationNotice('Reservation updated.')
      return {
        saved: true,
        movedOffSelectedDate: selectedDateKey
          ? nextDate !== normalizeReservationDateKey(selectedDateKey)
          : false,
      }
    } catch (error) {
      setReservationNotice(error.message || 'Unable to update reservation right now.')
      throw error
    } finally {
      setIsSavingReservation(false)
    }
  }

  const handleHostEditDelete = async (id) => {
    try {
      await deleteReservation(id)
      await refreshReservations()
      setReservationNotice('Reservation removed.')
    } catch (error) {
      setReservationNotice(error.message || 'Unable to delete reservation right now.')
      throw error
    }
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

  const handleQuickReservationStatus = async (reservation, status) => {
    try {
      await updateReservation(reservation.id, buildReservationUpdatePayload(reservation, { status }))
      await refreshReservations()
      setReservationNotice(`Reservation marked ${getHostListStatusLabel(status)}.`)
    } catch (error) {
      setReservationNotice(error.message || 'Unable to update reservation right now.')
    }
  }

  const handleQuickReservationNote = async (reservation, notes) => {
    try {
      await updateReservation(reservation.id, buildReservationUpdatePayload(reservation, { notes }))
      await refreshReservations()
      setReservationNotice('Guest note saved.')
    } catch (error) {
      setReservationNotice(error.message || 'Unable to save guest note right now.')
    }
  }

  const handleQuickReservationTableReassign = async (reservation, tableNumber) => {
    try {
      await updateReservation(reservation.id, {
        guestName: reservation.guestName,
        phone: reservation.phone,
        date: reservation.date,
        time: reservation.time,
        guests: reservation.guests,
        tableNumber: `${tableNumber ?? ''}`.trim(),
        area: reservation.area,
        status: reservation.status,
        notes: reservation.notes,
      })
      await refreshReservations()
      setReservationNotice(`Moved to table ${tableNumber}.`)
    } catch (error) {
      setReservationNotice(error.message || 'Unable to reassign table right now.')
    }
  }

  const handleSeatGuestAtTable = async (reservation, assignment) => {
    try {
      const payload = createSeatingAssignmentPayload(reservation, assignment)
      await updateReservation(reservation.id, payload)
      await refreshReservations()
      setReservationNotice(
        `Seated ${formatReservationGuestName(reservation.guestName)} at ${formatSeatingAssignmentSummary(payload.seatingAssignment, reservation.guests)}.`,
      )
    } catch (error) {
      setReservationNotice(error.message || 'Unable to seat guest right now.')
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

    const reservationDate = normalizeReservationDateKey(reservationForm.date) || currentDateKey
    const payload = buildReservationUpdatePayload(editingReservation ?? {
      date: reservationDate,
      guests: Number(reservationForm.guests) || 2,
      area: reservationForm.area,
      notes: '',
      seatingAssignment: { assignedUnits: [], extraChairs: 0, standingGuests: 0 },
    }, {
      guestName: reservationForm.guestName.trim(),
      phone: reservationForm.phone.trim(),
      date: reservationDate,
      time: reservationForm.time,
      guests: reservationForm.guests,
      status: reservationForm.status,
      notes: reservationForm.notes.trim(),
      area: reservationForm.area,
      assignedUnits: reservationForm.assignedUnits,
      extraChairs: reservationForm.extraChairs,
      standingGuests: reservationForm.standingGuests,
    })

    try {
      if (editingReservation) {
        await updateReservation(editingReservation.id, payload)
      } else {
        await createReservation({
          ...payload,
          date: reservationDate,
        })
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

  const handleQuickReservationSubmit = async (event) => {
    event.preventDefault()

    if (!quickReservationForm.guestName.trim()) {
      setReservationNotice('Please provide the guest name.')
      return
    }

    if (!quickReservationForm.time) {
      setReservationNotice('Please provide an arrival time.')
      return
    }

    setIsSavingReservation(true)
    setReservationNotice('')

    const match = getGuestMatchForName(quickReservationForm.guestName, reservations)
    const profile = match ? buildGuestProfileInsights(match, reservations) : null

    try {
      await createReservation({
        guestName: quickReservationForm.guestName.trim(),
        phone: `${match?.phone ?? ''}`.trim(),
        date: currentDateKey,
        time: quickReservationForm.time,
        guests: Number(quickReservationForm.guests) || 2,
        tableNumber: quickReservationForm.tableNumber.trim() || (profile?.favoriteTable !== '—' ? profile.favoriteTable : ''),
        area: profile?.favoriteArea && profile.favoriteArea !== '—' ? profile.favoriteArea : 'Main Dining',
        status: 'Pending',
        notes: `${match?.notes ?? ''}`.trim(),
      })

      await refreshReservations()
      setReservationNotice('Quick reservation created.')
      handleCloseQuickReservation()
    } catch (error) {
      setReservationNotice(error.message || 'Unable to create quick reservation right now.')
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
    setSupplierModalOrigin(null)
    setEditingSupplier(null)
    setSupplierForm({
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      taxId: '',
      paymentTerms: '',
      deliveryDays: '',
      notes: '',
    })
    setIsSupplierModalOpen(true)
  }

  const handleOpenAddSupplierFromInventory = () => {
    setSupplierModalOrigin('inventory')
    setEditingSupplier(null)
    setSupplierForm({
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      taxId: '',
      paymentTerms: '',
      deliveryDays: '',
      notes: '',
    })
    setIsSupplierModalOpen(true)
  }

  const handleCloseSupplierModal = () => {
    setIsSupplierModalOpen(false)
    setSupplierModalOrigin(null)
    setEditingSupplier(null)
    setSupplierForm({
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      taxId: '',
      paymentTerms: '',
      deliveryDays: '',
      notes: '',
    })
  }

  const handleOpenEditSupplier = (supplier) => {
    setSupplierModalOrigin(null)
    setEditingSupplier(supplier)
    setSupplierForm({
      companyName: supplier.companyName ?? '',
      contactPerson: supplier.contactPerson ?? '',
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
      address: supplier.address ?? '',
      taxId: supplier.taxId ?? '',
      paymentTerms: supplier.paymentTerms ?? '',
      deliveryDays: supplier.deliveryDays ?? '',
      notes: supplier.notes ?? '',
    })
    setIsSupplierModalOpen(true)
  }

  const handleRequestDeleteSupplier = (supplier) => {
    if (!supplier?.id) return
    setSupplierPendingDelete(supplier)
  }

  const handleCloseDeleteSupplierModal = () => {
    if (isDeletingSupplier) return
    setSupplierPendingDelete(null)
  }

  const handleConfirmDeleteSupplier = async () => {
    if (!supplierPendingDelete?.id) return

    const linkedCount = countInventoryItemsForSupplier(inventoryItems, supplierPendingDelete.companyName)
    if (linkedCount > 0) return

    setIsDeletingSupplier(true)
    setSuppliersNotice('')

    try {
      await deleteSupplier(supplierPendingDelete.id)
      await refreshSuppliers()
      setSuppliersNotice('Supplier removed.')
      setSupplierPendingDelete(null)
    } catch (error) {
      setSuppliersNotice(error.message || 'Unable to delete supplier right now.')
    } finally {
      setIsDeletingSupplier(false)
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
      taxId: supplierForm.taxId.trim(),
      paymentTerms: supplierForm.paymentTerms.trim(),
      deliveryDays: supplierForm.deliveryDays.trim(),
      notes: supplierForm.notes.trim(),
    }

    try {
      const savedCompanyName = payload.companyName
      const inventoryOrigin = supplierModalOrigin === 'inventory'

      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, payload)
      } else {
        const createdSupplier = await createSupplier(payload)
        await refreshSuppliers()
        handleCloseSupplierModal()

        if (inventoryOrigin && isInventoryModalOpen) {
          setInventoryForm((current) => ({
            ...current,
            supplier: `${createdSupplier?.companyName ?? savedCompanyName}`.trim(),
          }))
          setInventoryNotice('Supplier created and selected.')
        } else {
          setSuppliersNotice('Supplier created.')
        }
        return
      }

      await refreshSuppliers()
      setSuppliersNotice('Supplier updated.')
      handleCloseSupplierModal()
    } catch (error) {
      setSuppliersNotice(error.message || 'Unable to save supplier right now.')
    } finally {
      setIsSavingSupplier(false)
    }
  }

  const handleCreateTask = async (payload) => {
    setIsSavingTask(true)
    setTasksNotice('')

    try {
      await createTask(payload)
      await refreshTasks()
      setTasksNotice('Task created successfully.')
    } catch (error) {
      setTasksNotice(error?.message || 'Unable to create task right now.')
      throw error
    } finally {
      setIsSavingTask(false)
    }
  }

  const handleUpdateTask = async (taskId, payload) => {
    setIsSavingTask(true)
    setTasksNotice('')

    try {
      await updateTask(taskId, payload)
      await refreshTasks()
      setTasksNotice('Task updated successfully.')
    } catch (error) {
      setTasksNotice(error?.message || 'Unable to update task right now.')
      throw error
    } finally {
      setIsSavingTask(false)
    }
  }

  const handleDeleteTask = async (taskId) => {
    setIsSavingTask(true)
    setTasksNotice('')

    try {
      await deleteTask(taskId)
      await refreshTasks()
      setTasksNotice('Task deleted.')
    } catch (error) {
      setTasksNotice(error?.message || 'Unable to delete task right now.')
    } finally {
      setIsSavingTask(false)
    }
  }

  const handleCompleteTask = async (taskId) => {
    setIsSavingTask(true)
    setTasksNotice('')

    try {
      await completeTask(taskId)
      await refreshTasks()
      setTasksNotice('Task marked complete.')
    } catch (error) {
      setTasksNotice(error?.message || 'Unable to complete this task right now.')
    } finally {
      setIsSavingTask(false)
    }
  }

  const handleReopenTask = async (taskId) => {
    setIsSavingTask(true)
    setTasksNotice('')

    try {
      await reopenTask(taskId)
      await refreshTasks()
      setTasksNotice('Task reopened.')
    } catch (error) {
      setTasksNotice(error?.message || 'Unable to reopen this task right now.')
    } finally {
      setIsSavingTask(false)
    }
  }

  const handleDeleteCustomDepartment = async (departmentName) => {
    const trimmed = `${departmentName ?? ''}`.trim()
    if (!trimmed) return

    setIsSavingTask(true)
    setTasksNotice('')
    setTaskTemplatesNotice('')

    try {
      const matchingTasks = tasks.filter((task) => matchesCustomDepartmentName(task, trimmed))
      const matchingTemplates = taskTemplates.filter((template) => matchesCustomDepartmentName(template, trimmed))
      const reassignment = {
        department: 'custom',
        departmentCustom: UNASSIGNED_CUSTOM_DEPARTMENT_NAME,
      }

      await Promise.all([
        ...matchingTasks.map((task) => updateTask(task.id, reassignment)),
        ...matchingTemplates.map((template) => updateTaskTemplate(template.id, reassignment)),
      ])

      await refreshTasks()
      await refreshTaskTemplates()

      const movedCount = matchingTasks.length + matchingTemplates.length
      setTasksNotice(
        movedCount > 0
          ? `Department "${trimmed}" deleted. ${movedCount} item${movedCount === 1 ? '' : 's'} moved to Unassigned Department.`
          : `Department "${trimmed}" deleted.`,
      )
    } catch (error) {
      setTasksNotice(error?.message || 'Unable to delete department right now.')
      throw error
    } finally {
      setIsSavingTask(false)
    }
  }

  const handleCreateTaskTemplate = async (payload) => {
    setIsSavingTaskTemplate(true)
    setTaskTemplatesNotice('')

    try {
      const { checklistItems = [], ...templatePayload } = payload
      const createdTemplate = await createTaskTemplate(templatePayload)
      await replaceTemplateChecklist(createdTemplate.id, checklistItems)
      await refreshTaskTemplates()
      setTaskTemplatesNotice('Template created successfully.')
    } catch (error) {
      setTaskTemplatesNotice(error?.message || 'Unable to create template right now.')
      throw error
    } finally {
      setIsSavingTaskTemplate(false)
    }
  }

  const handleUpdateTaskTemplate = async (templateId, payload) => {
    setIsSavingTaskTemplate(true)
    setTaskTemplatesNotice('')

    try {
      const { checklistItems = [], ...templatePayload } = payload
      await updateTaskTemplate(templateId, templatePayload)
      await replaceTemplateChecklist(templateId, checklistItems)
      await refreshTaskTemplates()
      setTaskTemplatesNotice('Template updated successfully.')
    } catch (error) {
      setTaskTemplatesNotice(error?.message || 'Unable to update template right now.')
      throw error
    } finally {
      setIsSavingTaskTemplate(false)
    }
  }

  const handleDeleteTaskTemplate = async (templateId) => {
    setIsSavingTaskTemplate(true)
    setTaskTemplatesNotice('')

    try {
      await deleteTaskTemplate(templateId)
      await refreshTaskTemplates()
      setTaskTemplatesNotice('Template deleted.')
    } catch (error) {
      setTaskTemplatesNotice(error?.message || 'Unable to delete template right now.')
    } finally {
      setIsSavingTaskTemplate(false)
    }
  }

  const handleGenerateTasksFromTemplates = async () => {
    setIsGeneratingTasksFromTemplates(true)
    setTaskTemplatesNotice('')

    try {
      const { createdCount, skippedCount } = await generateTasksFromTemplates({
        templates: taskTemplates,
        selectedDate: currentDateKey,
      })

      await refreshTasks()

      const createdLabel = createdCount === 1 ? '1 task generated' : `${createdCount} tasks generated`
      const skippedLabel = skippedCount === 1 ? '1 already existed' : `${skippedCount} already existed`

      if (createdCount === 0 && skippedCount === 0) {
        setTaskTemplatesNotice('No active templates to generate.')
      } else if (skippedCount === 0) {
        setTaskTemplatesNotice(`${createdLabel}.`)
      } else {
        setTaskTemplatesNotice(`${createdLabel}. ${skippedLabel}.`)
      }
    } catch (error) {
      setTaskTemplatesNotice(error?.message || 'Unable to generate tasks right now.')
    } finally {
      setIsGeneratingTasksFromTemplates(false)
    }
  }

  const handleToggleChecklistItem = async (itemId, isCompleted) => {
    setChecklistItemsByTaskId((current) => {
      const next = {}

      Object.entries(current).forEach(([taskId, items]) => {
        next[taskId] = items.map((item) => (
          item.id === itemId
            ? {
              ...item,
              isCompleted: Boolean(isCompleted),
              completedAt: isCompleted ? new Date().toISOString() : null,
            }
            : item
        ))
      })

      return next
    })

    try {
      await toggleChecklistItem(itemId, isCompleted)
    } catch (error) {
      await refreshTasks()
      setTasksNotice(error?.message || 'Unable to update checklist item right now.')
    }
  }

  const heroTitle = activeView === 'dashboard'
    ? 'Operations Command Center'
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
            : activeView === 'tasks'
              ? 'Tasks management'
            : 'Operations management'
  const heroSubtitle = activeView === 'dashboard'
    ? `${currentDateLabel} · What is happening in your business today`
    : activeView === 'settings'
      ? 'Configure your workspace profile and operational defaults.'
    : activeView === 'reservations'
      ? 'Review service flow, seating, and guest arrivals.'
      : activeView === 'suppliers'
        ? 'Review supplier contacts, terms, and delivery cadence.'
      : activeView === 'stock'
        ? 'Monitor supply health, costs, and replenishment risk.'
        : activeView === 'tasks'
          ? 'Track department work, due dates, and daily completion progress.'
        : 'Search, filter, and review the full team roster.'

  const topbarEyebrow = activeView === 'dashboard'
    ? 'Command center'
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
                : activeView === 'tasks'
                  ? 'Tasks management'
                : 'Operations management'

  const supplierDeleteLinkedCount = supplierPendingDelete
    ? countInventoryItemsForSupplier(inventoryItems, supplierPendingDelete.companyName)
    : 0

  const inventorySupplierOptions = useMemo(
    () => buildInventorySupplierOptions(suppliers, inventoryForm.supplier),
    [suppliers, inventoryForm.supplier],
  )

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
            <p className="brand-powered-by">Powered by ONE</p>
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

      <main className={`main-panel${activeView === 'schedule' ? ' main-panel-schedule' : ''}${activeView === 'dashboard' ? ' main-panel-dashboard' : ''}${activeView === 'floor-plan-builder' ? ' main-panel-floor-builder' : ''}${activeView === 'reservations' ? ' main-panel-reservations' : ''}`}>
        {activeView !== 'schedule' && activeView !== 'floor-plan-builder' ? (
        activeView === 'dashboard' ? (
        <header className="topbar topbar-command topbar-command-hero">
          <div className="command-topbar-intro">
            <h2 className="command-topbar-greeting">
              {buildDashboardGreeting(currentTimeGreeting, workspaceProfile.managerName)}
            </h2>
            {brandDisplay.businessName ? (
              <p className="command-topbar-business">{brandDisplay.businessName}</p>
            ) : null}
            <p className="command-topbar-date">{dashboardHeroDateLabel}</p>
            <p className="command-topbar-context">{dashboardOperationalSummary}</p>
          </div>
          <div className="command-topbar-meta">
            <div className={`command-status-chip tone-${dashboardLiveStatus.tone}`} aria-label="Live operations status">
              <span className="command-status-chip-dot" aria-hidden="true" />
              <div className="command-status-chip-copy">
                <p className="command-status-chip-label">{dashboardLiveStatus.chipLabel}</p>
                <p className="command-status-chip-value">{dashboardLiveStatus.chipValue}</p>
                <p className="command-status-chip-status">{dashboardLiveStatus.chipStatus}</p>
              </div>
            </div>
            <button
              type="button"
              className={`profile-chip profile-chip-command${profileChipDisplay.isConfigured ? '' : ' profile-chip-unconfigured'}`}
              onClick={handleOpenWorkspaceProfile}
            >
              <div className="profile-avatar">{profileChipDisplay.initials}</div>
              <div className="profile-chip-copy">
                <strong>{profileChipDisplay.name}</strong>
                <p>{profileChipDisplay.role}</p>
              </div>
            </button>
          </div>
        </header>
        ) : (
        <header className="topbar">
          <div className="topbar-title-block">
            <p className="eyebrow">{topbarEyebrow}</p>
            <h2>{heroTitle}</h2>
            <p className="welcome-subtitle">{heroSubtitle}</p>
          </div>
          <div className="topbar-meta">
            <label className="search-bar" aria-label={`Search ${activeView}`}>
              <span>⌕</span>
              <input
                type="text"
                placeholder={activeView === 'staff' ? 'Search employee' : activeView === 'stock' ? 'Search inventory item' : activeView === 'suppliers' ? 'Search supplier' : activeView === 'tasks' ? 'Search tasks' : 'Search'}
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
        )
        ) : null}

        {activeView === 'dashboard' ? (
          <CommandCenterView
            snapshot={operationalSnapshot}
            liveFloor={liveFloorState}
            reservationsSummary={todayReservationsSummary}
            reservationsConnected={isReservationsModuleConnected}
            stockAlerts={dashboardStockAlerts}
            inventoryConnected={isInventoryModuleConnected}
            tasksOverview={dashboardTaskOverview}
            tasksConnected={isTasksModuleConnected}
            isTasksLoading={isTasksLoading}
            issuesSummary={dashboardIssuesSummary}
            businessHealth={dashboardBusinessHealth}
            executiveLabour={dashboardExecutiveLabour}
            reservationsFooter={dashboardReservationsFooter}
            timelineEvents={dashboardTimelineEvents}
            isScheduleLoading={isDashboardScheduleLoading}
            isLiveFloorLoading={isLiveFloorLoading}
            onQuickAction={handleDashboardQuickAction}
            onViewStock={handleDashboardViewStock}
            onViewSchedule={handleDashboardViewSchedule}
            onViewTasks={handleDashboardViewTasks}
          />
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
            onOpenQuickReservation={handleOpenQuickReservation}
            onOpenCommandPalette={handleOpenCommandPalette}
            isCommandPaletteOpen={isCommandPaletteOpen}
            onCloseCommandPalette={handleCloseCommandPalette}
            onOpenEditReservation={handleOpenEditReservation}
            onQuickStatusUpdate={handleQuickReservationStatus}
            onQuickNoteUpdate={handleQuickReservationNote}
            onTableReassign={handleQuickReservationTableReassign}
            onSeatGuestAtTable={handleSeatGuestAtTable}
            onHostEditSave={handleHostEditSave}
            onHostEditDelete={handleHostEditDelete}
            isLoading={isReservationsLoading}
            noticeMessage={reservationNotice}
            isSaving={isSavingReservation}
          />
        ) : null}

        {activeView === 'floor-plan-builder' ? (
          <div className="floor-plan-deprecated-notice">
            <p>Floor Plan Builder now lives inside Reservations.</p>
            <button type="button" className="primary-btn" onClick={() => setActiveView('reservations')}>
              Open Reservations
            </button>
          </div>
        ) : null}

        {activeView === 'suppliers' ? (
          <SuppliersView
            suppliers={suppliers}
            inventoryItems={inventoryItems}
            onOpenAddSupplier={handleOpenAddSupplier}
            onOpenEditSupplier={handleOpenEditSupplier}
            onRequestDeleteSupplier={handleRequestDeleteSupplier}
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

        {activeView === 'tasks' ? (
          <TasksView
            tasks={tasks}
            taskTemplates={taskTemplates}
            templateChecklistItemsByTemplateId={templateChecklistItemsByTemplateId}
            checklistItemsByTaskId={checklistItemsByTaskId}
            employees={scheduleEmployees}
            isLoading={isTasksLoading}
            isTemplatesLoading={isTaskTemplatesLoading}
            isSaving={isSavingTask}
            isSavingTemplate={isSavingTaskTemplate}
            isGeneratingTasks={isGeneratingTasksFromTemplates}
            errorMessage={tasksError}
            templatesErrorMessage={taskTemplatesError}
            noticeMessage={tasksNotice}
            templatesNoticeMessage={taskTemplatesNotice}
            onCreateTask={handleCreateTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onCompleteTask={handleCompleteTask}
            onReopenTask={handleReopenTask}
            onCreateTemplate={handleCreateTaskTemplate}
            onUpdateTemplate={handleUpdateTaskTemplate}
            onDeleteTemplate={handleDeleteTaskTemplate}
            onGenerateToday={handleGenerateTasksFromTemplates}
            onToggleChecklistItem={handleToggleChecklistItem}
            onDeleteCustomDepartment={handleDeleteCustomDepartment}
            currentEmployeeId={currentTaskEmployeeId}
            currentEmployeeName={workspaceProfile.managerName}
            todayKey={currentDateKey}
            openCreateOnMount={openTasksCreateModal}
            onOpenCreateHandled={() => setOpenTasksCreateModal(false)}
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

        {isShiftOverlapConfirmOpen ? (
          <div className="employee-modal-backdrop" onClick={() => resolveShiftOverlapConfirmation(false)}>
            <div className="employee-modal blend-compact-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Schedule overlap</p>
                  <h3>Employee already works another shift at this time</h3>
                </div>
                <button type="button" className="icon-btn" onClick={() => resolveShiftOverlapConfirmation(false)}>✕</button>
              </div>

              <p className="staff-subtitle">Add anyway?</p>

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={() => resolveShiftOverlapConfirmation(false)}>Cancel</button>
                <button type="button" className="primary-btn" onClick={() => resolveShiftOverlapConfirmation(true)}>Add Anyway</button>
              </div>
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
          <div className="employee-modal-backdrop reservation-modal-backdrop" onClick={handleCloseReservationModal}>
            <div className="employee-modal reservation-smart-modal is-responsive-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Smart reservation</p>
                  <h3>{editingReservation ? 'Edit reservation' : 'Add reservation'}</h3>
                </div>
                <button type="button" className="icon-btn" onClick={handleCloseReservationModal}>✕</button>
              </div>

              <form className="employee-form" onSubmit={handleReservationSubmit}>
                {!editingReservation && detectedGuestReservation ? (
                  <SmartGuestFormPanel
                    guestReservation={detectedGuestReservation}
                    allReservations={reservations}
                    onApplyGuest={handleApplyGuestProfile}
                  />
                ) : null}

                <div className="form-grid">
                  <label className="form-field">
                    <span>Guest Name</span>
                    <input
                      list="reservation-guest-suggestions"
                      value={reservationForm.guestName}
                      onChange={(event) => handleReservationGuestNameChange(event.target.value)}
                      placeholder="Guest Name"
                      required
                    />
                  </label>
                  {guestNameSuggestions.length > 0 ? (
                    <datalist id="reservation-guest-suggestions">
                      {guestNameSuggestions.map((entry) => (
                        <option key={entry.id} value={formatReservationGuestName(entry.guestName)} />
                      ))}
                    </datalist>
                  ) : null}
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
                    <ReservationTimeSelect
                      value={reservationForm.time}
                      onChange={(time) => setReservationForm((current) => ({ ...current, time }))}
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Guests</span>
                    <input type="number" min="1" value={reservationForm.guests} onChange={(event) => setReservationForm((current) => ({ ...current, guests: event.target.value }))} required />
                  </label>
                  <label className="form-field">
                    <span>Status</span>
                    <select value={reservationForm.status} onChange={(event) => setReservationForm((current) => ({ ...current, status: event.target.value }))}>
                      <option value="Booked">Booked</option>
                      <option value="Confirmed">Confirmed</option>
                      <option value="Seated">Seated</option>
                      <option value="Dining">Dining</option>
                      <option value="Completed">Completed</option>
                      <option value="Cancelled">Cancelled</option>
                      <option value="No Show">No Show</option>
                    </select>
                  </label>
                </div>

                <ReservationTableSelector
                  layout={loadPublishedHostLayout()}
                  reservations={reservations}
                  todayKey={reservationForm.date || currentDateKey}
                  reservationTime={reservationForm.time}
                  reservationId={editingReservation?.id ?? null}
                  selectedAreaId={reservationForm.seatingAreaId}
                  assignedUnits={reservationForm.assignedUnits}
                  guests={reservationForm.guests}
                  extraChairs={reservationForm.extraChairs}
                  standingGuests={reservationForm.standingGuests}
                  onAreaChange={(seatingAreaId) => {
                    const hostLayout = loadPublishedHostLayout()
                    const zone = hostLayout?.zones?.find((entry) => entry.id === seatingAreaId)
                    setReservationForm((current) => ({
                      ...current,
                      seatingAreaId,
                      area: zone?.label ?? current.area,
                    }))
                  }}
                  onAssignedUnitsChange={(assignedUnits) => setReservationForm((current) => ({ ...current, assignedUnits }))}
                  onExtraChairsChange={(extraChairs) => setReservationForm((current) => ({ ...current, extraChairs }))}
                  onStandingGuestsChange={(standingGuests) => setReservationForm((current) => ({ ...current, standingGuests }))}
                />

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

        {isQuickReservationOpen ? (
          <div className="employee-modal-backdrop" onClick={handleCloseQuickReservation}>
            <div className="employee-modal quick-reservation-modal" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Quick reservation</p>
                  <h3>Fast booking</h3>
                </div>
                <button type="button" className="icon-btn" onClick={handleCloseQuickReservation}>✕</button>
              </div>

              <form className="employee-form quick-reservation-form" onSubmit={handleQuickReservationSubmit}>
                <label className="form-field full-width">
                  <span>Guest</span>
                  <input
                    autoFocus
                    list="quick-reservation-guest-suggestions"
                    value={quickReservationForm.guestName}
                    onChange={(event) => setQuickReservationForm((current) => ({ ...current, guestName: event.target.value }))}
                    placeholder="Guest name"
                    required
                  />
                </label>
                <datalist id="quick-reservation-guest-suggestions">
                  {findMatchingGuestProfiles(quickReservationForm.guestName, reservations).map((entry) => (
                    <option key={`quick-${entry.id}`} value={formatReservationGuestName(entry.guestName)} />
                  ))}
                </datalist>
                <div className="form-grid">
                  <label className="form-field">
                    <span>Time</span>
                    <ReservationTimeSelect
                      value={quickReservationForm.time}
                      onChange={(time) => setQuickReservationForm((current) => ({ ...current, time }))}
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Guests</span>
                    <input
                      type="number"
                      min="1"
                      value={quickReservationForm.guests}
                      onChange={(event) => setQuickReservationForm((current) => ({ ...current, guests: event.target.value }))}
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Table</span>
                    <input
                      value={quickReservationForm.tableNumber}
                      onChange={(event) => setQuickReservationForm((current) => ({ ...current, tableNumber: event.target.value }))}
                      placeholder="Table"
                    />
                  </label>
                </div>
                <p className="quick-reservation-hint">Press Enter to create · Today · Booked status</p>
                <div className="modal-actions">
                  <button type="button" className="ghost-btn" onClick={handleCloseQuickReservation}>Cancel</button>
                  <button type="submit" className="primary-btn" disabled={isSavingReservation}>
                    {isSavingReservation ? 'Creating…' : 'Create'}
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
                  <label className="form-field inventory-supplier-field">
                    <span>Supplier</span>
                    <div className="inventory-supplier-field-row">
                      <select
                        className="inventory-supplier-select"
                        value={inventoryForm.supplier}
                        onChange={(event) => setInventoryForm((current) => ({ ...current, supplier: event.target.value }))}
                      >
                        {inventorySupplierOptions.map((option) => (
                          <option key={option.value || 'no-supplier'} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="ghost-btn inventory-add-supplier-btn"
                        onClick={handleOpenAddSupplierFromInventory}
                        disabled={isSavingInventoryItem || isSavingSupplier}
                      >
                        + Supplier
                      </button>
                    </div>
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
          <div className="employee-modal-backdrop task-modal-backdrop" onClick={handleCloseSupplierModal}>
            <div className="employee-modal task-form-modal is-responsive-sheet" onClick={(event) => event.stopPropagation()}>
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
                    <span>VAT / Tax ID</span>
                    <input value={supplierForm.taxId} onChange={(event) => setSupplierForm((current) => ({ ...current, taxId: event.target.value }))} placeholder="VAT / Tax ID" />
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
                  <button type="button" className="ghost-btn supplier-modal-action-btn" onClick={handleCloseSupplierModal}>Cancel</button>
                  <button type="submit" className="primary-btn supplier-modal-action-btn" disabled={isSavingSupplier}>
                    {isSavingSupplier ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {supplierPendingDelete ? (
          <div className="employee-modal-backdrop task-modal-backdrop" onClick={handleCloseDeleteSupplierModal}>
            <div
              className="employee-modal task-form-modal is-responsive-sheet"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-supplier-title"
            >
              <div className="drawer-header">
                <div>
                  <p className="eyebrow">Delete confirmation</p>
                  <h3 id="delete-supplier-title">Delete supplier?</h3>
                </div>
                <button type="button" className="icon-btn" onClick={handleCloseDeleteSupplierModal} aria-label="Close delete supplier dialog">
                  ✕
                </button>
              </div>

              <div className="supplier-delete-modal-body">
                <p>This cannot be undone.</p>
                {supplierDeleteLinkedCount > 0 ? (
                  <>
                    <p className="supplier-delete-linked-warning">
                      This supplier is linked to {supplierDeleteLinkedCount} stock item{supplierDeleteLinkedCount === 1 ? '' : 's'}.
                    </p>
                    <p>Remove or reassign stock items before deleting this supplier.</p>
                  </>
                ) : null}
              </div>

              <div className="modal-actions">
                <button type="button" className="ghost-btn supplier-modal-action-btn" onClick={handleCloseDeleteSupplierModal} disabled={isDeletingSupplier}>
                  Cancel
                </button>
                {supplierDeleteLinkedCount === 0 ? (
                  <button type="button" className="primary-btn supplier-delete-confirm-btn supplier-modal-action-btn" onClick={handleConfirmDeleteSupplier} disabled={isDeletingSupplier}>
                    {isDeletingSupplier ? 'Deleting…' : 'Delete Supplier'}
                  </button>
                ) : null}
              </div>
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
