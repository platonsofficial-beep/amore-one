import { selectScheduleIssues } from './operationalSnapshotUtils'
import {
  getHostStatusGroupId,
  isOperationalReservation,
  isReservationInHouseStatus,
  normalizeReservationStatus,
} from './reservationHostStatus'
import { getStockItemsForSupplier, countInventoryItemsForSupplier } from './stockSupplierUtils'
import { buildStockDashboardSummary } from './stockUtils'
import { buildStockOrdersOperationsSummary } from './stockOrderUtils'
import { buildTaskAlerts } from './taskUtils'
import { buildUnifiedOperationalTaskCounts } from './sharedTaskWindow'
import { getCurrentDateKey } from './currentDateUtils'
import {
  calculateShiftDurationHours,
  formatHoursLabel,
} from './shiftHoursUtils'
import { getWeekDateKeys } from './weekUtils'

export const REPORT_PERIOD_TODAY = 'today'
export const REPORT_PERIOD_WEEK = 'week'

function normalizeDateKey(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function reservationReportDateKey(reservation, timeZone = '') {
  const rawText = `${reservation?.date ?? reservation?.reservation_date ?? ''}`.trim()
  if (timeZone && rawText.includes('T')) {
    const parsed = new Date(rawText)
    if (!Number.isNaN(parsed.getTime())) {
      return getCurrentDateKey(parsed, timeZone)
    }
  }
  return normalizeDateKey(rawText)
}

function reservationMatchesPeriod(reservation, period, todayKey, weekDateKeys, timeZone = '') {
  const dateKey = reservationReportDateKey(reservation, timeZone)
  if (!dateKey) return false
  if (period === REPORT_PERIOD_TODAY) return dateKey === todayKey
  return weekDateKeys.includes(dateKey)
}

function taskCompletedInPeriod(task, period, todayKey, weekDateKeys) {
  const status = `${task?.status ?? ''}`.trim().toLowerCase()
  if (status !== 'completed') return false

  const completedAt = normalizeDateKey(task?.completedAt ?? task?.completed_at)
  if (!completedAt) return false

  if (period === REPORT_PERIOD_TODAY) return completedAt === todayKey
  return weekDateKeys.includes(completedAt)
}

function filterShiftsForPeriod(shifts, period, todayKey, weekDateKeys) {
  return (shifts ?? []).filter((shift) => {
    const dateKey = normalizeDateKey(shift?.date)
    if (!dateKey) return false
    if (period === REPORT_PERIOD_TODAY) return dateKey === todayKey
    return weekDateKeys.includes(dateKey)
  })
}

export function formatReportCurrency(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatReportCount(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return `${amount}`
}

export function formatReportPercent(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return `${amount}%`
}

export function buildReservationsReport(
  reservations = [],
  {
    period = REPORT_PERIOD_TODAY,
    todayKey = '',
    weekStartDate = '',
    connected = true,
    serviceSnapshot = null,
    timeZone = '',
  } = {},
) {
  const weekDateKeys = getWeekDateKeys(weekStartDate || todayKey)
  const scoped = connected
    ? reservations.filter((reservation) => reservationMatchesPeriod(
      reservation,
      period,
      todayKey,
      weekDateKeys,
      timeZone,
    ))
    : []
  const operational = scoped.filter((reservation) => isOperationalReservation(reservation))

  let guests = 0
  let inHouse = 0
  let completed = 0
  let cancelled = 0
  let noShow = 0

  operational.forEach((reservation) => {
    const partySize = Number(reservation.guests)
    if (Number.isFinite(partySize) && partySize > 0) {
      guests += partySize
    }
  })

  scoped.forEach((reservation) => {
    const status = normalizeReservationStatus(reservation.status)
    if (isReservationInHouseStatus(status)) inHouse += 1
    if (getHostStatusGroupId(status) === 'completed') completed += 1
    if (status === 'Cancelled') cancelled += 1
    if (status === 'Not Shown') noShow += 1
  })

  const metrics = {
    bookings: operational.length,
    guests,
    inHouse,
    completed,
    cancelled,
    noShow,
  }

  if (connected && period === REPORT_PERIOD_TODAY && serviceSnapshot) {
    metrics.covers = Number(serviceSnapshot.totalCovers) || 0
    metrics.seatedGuests = Number(serviceSnapshot.seatedGuests) || 0
    metrics.waiting = Number(serviceSnapshot.waitingCount) || 0
    metrics.late = Number(serviceSnapshot.lateCount) || 0
    metrics.serviceStatus = serviceSnapshot.overallStatus ?? null
  }

  return {
    connected,
    empty: connected && scoped.length === 0,
    metrics,
    servicePressure: connected && period === REPORT_PERIOD_TODAY && serviceSnapshot
      ? serviceSnapshot.overallTone ?? null
      : null,
  }
}

export function buildTasksReport(
  tasks = [],
  {
    period = REPORT_PERIOD_TODAY,
    todayKey = '',
    weekStartDate = '',
    connected = true,
    operationsTasks = [],
    announcements = [],
  } = {},
) {
  if (!connected) {
    return {
      connected: false,
      empty: true,
      metrics: {
        active: null,
        overdue: null,
        urgent: null,
        completed: null,
        completionPercent: null,
      },
    }
  }

  const weekDateKeys = getWeekDateKeys(weekStartDate || todayKey)
  const overview = buildUnifiedOperationalTaskCounts({
    boardTasks: tasks,
    operationsTasks,
    todayKey,
    announcements,
  })
  const alerts = buildTaskAlerts(tasks, todayKey)
  const completed = period === REPORT_PERIOD_TODAY
    ? overview.completedToday
    : tasks.filter((task) => taskCompletedInPeriod(task, period, todayKey, weekDateKeys)).length

  return {
    connected: true,
    empty: tasks.length === 0,
    metrics: {
      active: overview.openCount,
      overdue: overview.pastDueCount,
      urgent: alerts.urgent.length,
      completed,
      completionPercent: period === REPORT_PERIOD_TODAY ? overview.completionPercent : null,
    },
  }
}

const EMPTY_STOCK_METRICS = {
  itemsToOrder: null,
  lowStock: null,
  outOfStock: null,
  totalStockValue: null,
  pendingOrders: null,
  awaitingDelivery: null,
}

export function buildInsightsStockReport({
  stockItems = [],
  stockOrders = [],
  stockModuleConnected = false,
} = {}) {
  if (!stockModuleConnected) {
    return {
      stockModuleConnected: false,
      connected: false,
      empty: true,
      metrics: { ...EMPTY_STOCK_METRICS },
    }
  }

  const summary = buildStockDashboardSummary(stockItems ?? [])
  const ordersSummary = buildStockOrdersOperationsSummary(stockOrders)

  return {
    stockModuleConnected: true,
    connected: true,
    empty: summary.totalItems === 0,
    metrics: {
      itemsToOrder: summary.toOrder,
      lowStock: summary.lowStock,
      outOfStock: summary.outOfStock,
      totalStockValue: summary.totalValue,
      pendingOrders: ordersSummary.pendingCount,
      awaitingDelivery: ordersSummary.awaitingDeliveryCount + ordersSummary.partialCount,
    },
  }
}

export function buildScheduleReport(
  {
    shifts = [],
    shiftTemplates = [],
    scheduleCapacities = [],
    employees = [],
    period = REPORT_PERIOD_TODAY,
    todayKey = '',
    weekStartDate = '',
    connected = true,
    coverageBreakdown = null,
    usesDraftSchedule = true,
  } = {},
) {
  if (!connected) {
    return {
      connected: false,
      empty: true,
      usesDraftSchedule: true,
      coverageDetail: null,
      metrics: {
        scheduledStaff: null,
        scheduledHours: null,
        scheduledHoursLabel: null,
        issues: null,
      },
    }
  }

  const weekDateKeys = getWeekDateKeys(weekStartDate || todayKey)
  const periodShifts = filterShiftsForPeriod(shifts, period, todayKey, weekDateKeys)
  const uniqueEmployees = new Set()
  let scheduledHours = 0

  periodShifts.forEach((shift) => {
    if (shift.employeeId) uniqueEmployees.add(String(shift.employeeId))
    scheduledHours += calculateShiftDurationHours(shift.startTime, shift.endTime)
  })

  let issues = null
  let coverageDetail = null
  if (period === REPORT_PERIOD_TODAY) {
    const scheduleIssues = selectScheduleIssues({
      shifts,
      shiftTemplates,
      scheduleCapacities,
      employees,
      todayKey,
      coverageBreakdown,
    })
    issues = scheduleIssues.count
    coverageDetail = scheduleIssues.detail || null
  }

  return {
    connected: true,
    empty: periodShifts.length === 0,
    usesDraftSchedule: usesDraftSchedule !== false,
    coverageDetail,
    metrics: {
      scheduledStaff: uniqueEmployees.size,
      scheduledHours,
      scheduledHoursLabel: formatHoursLabel(scheduledHours),
      issues,
    },
  }
}

export function buildSuppliersReport(
  suppliers = [],
  inventoryItems = [],
  {
    suppliersConnected = true,
    inventoryConnected = true,
    stockItems = [],
  } = {},
) {
  if (!suppliersConnected) {
    return {
      connected: false,
      empty: true,
      metrics: {
        totalSuppliers: null,
        linkedToStock: null,
        withoutStockItems: null,
      },
    }
  }

  const totalSuppliers = suppliers.length
  let linkedToStock = 0

  const hasStockModuleData = (stockItems ?? []).length > 0
  const canLinkStock = inventoryConnected || hasStockModuleData

  if (canLinkStock) {
    suppliers.forEach((supplier) => {
      const companyName = `${supplier?.companyName ?? supplier?.company_name ?? ''}`.trim()
      const supplierIdRaw = supplier?.id
      const hasIdentity = Boolean(companyName)
        || (supplierIdRaw !== null
          && supplierIdRaw !== undefined
          && `${supplierIdRaw}`.trim() !== '')
      if (!hasIdentity) return

      // FK-first for stock_items; inventory_items remain text-linked (no supplier_id).
      const hasLinkedItem = hasStockModuleData
        ? getStockItemsForSupplier(stockItems, supplier).length > 0
        : countInventoryItemsForSupplier(inventoryItems, supplier) > 0
      if (hasLinkedItem) linkedToStock += 1
    })
  }

  return {
    connected: true,
    inventoryConnected: canLinkStock,
    empty: totalSuppliers === 0,
    metrics: {
      totalSuppliers,
      linkedToStock: canLinkStock ? linkedToStock : null,
      withoutStockItems: canLinkStock ? Math.max(totalSuppliers - linkedToStock, 0) : null,
    },
  }
}

export function buildInsightsAttentionItems(attentionItems = [], { limit = 6 } = {}) {
  return (attentionItems ?? []).slice(0, limit)
}

export function buildInsightsHealthSummary({
  period = REPORT_PERIOD_TODAY,
  attentionItems = [],
  reservationsReport,
  tasksReport,
  stockReport,
  scheduleReport,
  serviceSnapshot = null,
} = {}) {
  if (period === REPORT_PERIOD_WEEK) {
    const parts = []

    if (tasksReport?.connected && Number(tasksReport.metrics.completed) > 0) {
      parts.push(`${tasksReport.metrics.completed} tasks completed this week`)
    }

    if (scheduleReport?.connected && scheduleReport.metrics.scheduledHoursLabel) {
      parts.push(`${scheduleReport.metrics.scheduledHoursLabel}h scheduled`)
    }

    if (reservationsReport?.connected && Number(reservationsReport.metrics.bookings) > 0) {
      parts.push(`${reservationsReport.metrics.bookings} bookings`)
    }

    return parts.length > 0
      ? parts.join(' · ')
      : 'Weekly overview from connected modules.'
  }

  const moduleReports = [reservationsReport, tasksReport, stockReport, scheduleReport]
  const connectedCount = moduleReports.filter((report) => report?.connected).length

  if (connectedCount === 0) {
    return 'Connect modules to see operational insights.'
  }

  const attentionCount = (attentionItems ?? []).length
  if (attentionCount > 0) {
    return `${attentionCount} area${attentionCount === 1 ? '' : 's'} need attention today`
  }

  if (reservationsReport?.connected && serviceSnapshot?.overallStatus) {
    return `Service: ${serviceSnapshot.overallStatus}`
  }

  const issues = []
  if (tasksReport?.connected && Number(tasksReport.metrics.overdue) > 0) {
    issues.push(`${tasksReport.metrics.overdue} overdue task${tasksReport.metrics.overdue === 1 ? '' : 's'}`)
  }
  if (stockReport?.connected && Number(stockReport.metrics.outOfStock) > 0) {
    issues.push(`${stockReport.metrics.outOfStock} out of stock`)
  }
  if (scheduleReport?.connected && Number(scheduleReport.metrics.issues) > 0) {
    issues.push(`${scheduleReport.metrics.issues} schedule issue${scheduleReport.metrics.issues === 1 ? '' : 's'}`)
  }

  if (issues.length > 0) return issues.join(' · ')

  return 'Operations look stable for today.'
}

export function buildReportsOverview({
  period = REPORT_PERIOD_TODAY,
  reservationsReport,
  tasksReport,
  stockReport,
  scheduleReport,
}) {
  if (period === REPORT_PERIOD_TODAY) {
    const hasCovers = reservationsReport?.metrics?.covers != null
    const hasPendingOrders = stockReport?.stockModuleConnected
      && Number(stockReport.metrics.pendingOrders) > 0

    return [
      {
        key: 'bookings',
        label: 'Bookings',
        value: reservationsReport?.connected ? reservationsReport.metrics.bookings : null,
        connected: reservationsReport?.connected,
        format: 'count',
      },
      {
        key: hasCovers ? 'covers' : 'guests',
        label: hasCovers ? 'Covers' : 'Guests',
        value: reservationsReport?.connected
          ? (hasCovers ? reservationsReport.metrics.covers : reservationsReport.metrics.guests)
          : null,
        connected: reservationsReport?.connected,
        format: 'count',
      },
      {
        key: 'tasks-overdue',
        label: 'Tasks overdue',
        value: tasksReport?.connected ? tasksReport.metrics.overdue : null,
        connected: tasksReport?.connected,
        format: 'count',
      },
      {
        key: hasPendingOrders ? 'pending-orders' : 'items-to-order',
        label: hasPendingOrders ? 'Pending orders' : 'Items to order',
        value: stockReport?.connected
          ? (hasPendingOrders
            ? stockReport.metrics.pendingOrders
            : stockReport.metrics.itemsToOrder)
          : null,
        connected: stockReport?.connected,
        format: 'count',
      },
      {
        key: 'schedule-issues',
        label: 'Schedule issues',
        value: scheduleReport?.connected ? scheduleReport.metrics.issues : null,
        connected: scheduleReport?.connected,
        format: 'count',
      },
      {
        key: 'stock-value',
        label: 'Stock value',
        value: stockReport?.connected ? stockReport.metrics.totalStockValue : null,
        connected: stockReport?.connected,
        format: 'currency',
      },
    ]
  }

  return [
    {
      key: 'bookings',
      label: 'Bookings',
      value: reservationsReport?.connected ? reservationsReport.metrics.bookings : null,
      connected: reservationsReport?.connected,
      format: 'count',
    },
    {
      key: 'guests',
      label: 'Guests',
      value: reservationsReport?.connected ? reservationsReport.metrics.guests : null,
      connected: reservationsReport?.connected,
      format: 'count',
    },
    {
      key: 'tasks-completed',
      label: 'Tasks completed',
      value: tasksReport?.connected ? tasksReport.metrics.completed : null,
      connected: tasksReport?.connected,
      format: 'count',
    },
    {
      key: 'items-to-order',
      label: 'Items to order',
      value: stockReport?.connected ? stockReport.metrics.itemsToOrder : null,
      connected: stockReport?.connected,
      format: 'count',
    },
    {
      key: 'schedule-hours',
      label: 'Schedule hours',
      value: scheduleReport?.connected ? scheduleReport.metrics.scheduledHoursLabel : null,
      connected: scheduleReport?.connected,
      format: 'hours',
    },
    {
      key: 'stock-value',
      label: 'Stock value',
      value: stockReport?.connected ? stockReport.metrics.totalStockValue : null,
      connected: stockReport?.connected,
      format: 'currency',
    },
  ]
}

export function formatReportMetricValue(value, { connected = true, format = 'count' } = {}) {
  if (!connected) return 'Not connected'
  if (value === null || value === undefined) return '—'

  if (format === 'currency') return formatReportCurrency(value)
  if (format === 'percent') return formatReportPercent(value)
  if (format === 'hours') return value ? `${value}h` : '—'
  if (format === 'text') return `${value}`
  return formatReportCount(value)
}

export function buildReportsBundle({
  period,
  todayKey,
  weekStartDate,
  reservations,
  tasks,
  inventoryItems,
  stockItems = [],
  stockOrders = [],
  suppliers,
  schedule,
  connections = {},
  serviceSnapshot = null,
  coverageBreakdown = null,
  attentionItems = [],
  timeZone = '',
  operationsTasks = [],
  announcements = [],
}) {
  const reservationsReport = buildReservationsReport(reservations, {
    period,
    todayKey,
    weekStartDate,
    connected: connections.reservationsConnected,
    serviceSnapshot: period === REPORT_PERIOD_TODAY ? serviceSnapshot : null,
    timeZone,
  })
  const tasksReport = buildTasksReport(tasks, {
    period,
    todayKey,
    weekStartDate,
    connected: connections.tasksConnected,
    operationsTasks,
    announcements,
  })
  const stockReport = buildInsightsStockReport({
    stockItems,
    stockOrders,
    stockModuleConnected: connections.stockModuleConnected,
  })
  const scheduleReport = buildScheduleReport({
    ...schedule,
    period,
    todayKey,
    weekStartDate,
    connected: connections.scheduleConnected,
    coverageBreakdown: period === REPORT_PERIOD_TODAY ? coverageBreakdown : null,
  })
  const suppliersReport = buildSuppliersReport(suppliers, inventoryItems, {
    suppliersConnected: connections.suppliersConnected,
    inventoryConnected: connections.inventoryConnected || connections.stockModuleConnected,
    stockItems,
  })
  const overview = buildReportsOverview({
    period,
    reservationsReport,
    tasksReport,
    stockReport,
    scheduleReport,
  })
  const insightsAttention = buildInsightsAttentionItems(attentionItems)
  const healthSummary = buildInsightsHealthSummary({
    period,
    attentionItems: insightsAttention,
    reservationsReport,
    tasksReport,
    stockReport,
    scheduleReport,
    serviceSnapshot: period === REPORT_PERIOD_TODAY ? serviceSnapshot : null,
  })

  return {
    overview,
    healthSummary,
    insightsAttention,
    reservationsReport,
    tasksReport,
    stockReport,
    scheduleReport,
    suppliersReport,
  }
}
