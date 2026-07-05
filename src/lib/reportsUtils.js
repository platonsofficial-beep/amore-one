import { buildOperationalSnapshot } from './operationalSnapshotUtils'
import {
  getHostStatusGroupId,
  isReservationInHouseStatus,
  normalizeReservationStatus,
} from './reservationHostStatus'
import { needsOrder } from './inventoryUtils'
import { calculateTaskOverview, buildTaskAlerts } from './taskUtils'
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

function reservationMatchesPeriod(reservation, period, todayKey, weekDateKeys) {
  const dateKey = normalizeDateKey(reservation?.date ?? reservation?.reservation_date)
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

function barRefillMatchesPeriod(refill, period, todayKey, weekDateKeys) {
  const dateKey = normalizeDateKey(refill?.refillDate ?? refill?.refill_date)
  if (!dateKey) return false
  if (period === REPORT_PERIOD_TODAY) return dateKey === todayKey
  return weekDateKeys.includes(dateKey)
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
  } = {},
) {
  const weekDateKeys = getWeekDateKeys(weekStartDate || todayKey)
  const scoped = connected
    ? reservations.filter((reservation) => reservationMatchesPeriod(reservation, period, todayKey, weekDateKeys))
    : []

  let guests = 0
  let inHouse = 0
  let completed = 0
  let cancelled = 0
  let noShow = 0

  scoped.forEach((reservation) => {
    const partySize = Number(reservation.guests)
    if (Number.isFinite(partySize) && partySize > 0) {
      guests += partySize
    }

    const status = normalizeReservationStatus(reservation.status)
    if (isReservationInHouseStatus(status)) inHouse += 1
    if (getHostStatusGroupId(status) === 'completed') completed += 1
    if (status === 'Cancelled') cancelled += 1
    if (status === 'Not Shown') noShow += 1
  })

  return {
    connected,
    empty: connected && scoped.length === 0,
    metrics: {
      bookings: scoped.length,
      guests,
      inHouse,
      completed,
      cancelled,
      noShow,
    },
  }
}

export function buildTasksReport(
  tasks = [],
  {
    period = REPORT_PERIOD_TODAY,
    todayKey = '',
    weekStartDate = '',
    connected = true,
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
  const overview = calculateTaskOverview(tasks, todayKey)
  const alerts = buildTaskAlerts(tasks, todayKey)
  const completed = period === REPORT_PERIOD_TODAY
    ? overview.completedToday
    : tasks.filter((task) => taskCompletedInPeriod(task, period, todayKey, weekDateKeys)).length

  return {
    connected: true,
    empty: tasks.length === 0,
    metrics: {
      active: overview.active,
      overdue: overview.overdue,
      urgent: alerts.urgent.length,
      completed,
      completionPercent: period === REPORT_PERIOD_TODAY ? overview.completionPercent : null,
    },
  }
}

export function buildStockReport(
  inventoryItems = [],
  barRefills = [],
  {
    period = REPORT_PERIOD_TODAY,
    todayKey = '',
    weekStartDate = '',
    inventoryConnected = true,
    barRefillsConnected = true,
  } = {},
) {
  const weekDateKeys = getWeekDateKeys(weekStartDate || todayKey)

  const itemsToOrder = inventoryConnected
    ? inventoryItems.filter(needsOrder).length
    : null
  const lowStock = inventoryConnected
    ? inventoryItems.filter((item) => item.status === 'Low Stock').length
    : null
  const outOfStock = inventoryConnected
    ? inventoryItems.filter((item) => item.status === 'Out of Stock').length
    : null
  const totalStockValue = inventoryConnected
    ? inventoryItems.reduce(
      (sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.cost) || 0)),
      0,
    )
    : null

  const completedRefills = barRefillsConnected
    ? barRefills.filter((refill) => (
      refill.status === 'picked'
      && barRefillMatchesPeriod(refill, period, todayKey, weekDateKeys)
    )).length
    : null

  return {
    inventoryConnected,
    barRefillsConnected,
    connected: inventoryConnected,
    empty: inventoryConnected && inventoryItems.length === 0,
    metrics: {
      itemsToOrder,
      lowStock,
      outOfStock,
      totalStockValue,
      barRefillsCompleted: completedRefills,
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
  } = {},
) {
  if (!connected) {
    return {
      connected: false,
      empty: true,
      usesDraftSchedule: true,
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
  if (period === REPORT_PERIOD_TODAY) {
    const snapshot = buildOperationalSnapshot({
      shifts: periodShifts,
      shiftTemplates,
      scheduleCapacities,
      employees,
      todayKey,
    })
    issues = snapshot.issues
  }

  return {
    connected: true,
    empty: periodShifts.length === 0,
    usesDraftSchedule: true,
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

  if (inventoryConnected) {
    suppliers.forEach((supplier) => {
      const companyName = `${supplier?.companyName ?? ''}`.trim()
      if (!companyName) return

      const hasLinkedItem = inventoryItems.some(
        (item) => `${item?.supplier ?? ''}`.trim() === companyName,
      )
      if (hasLinkedItem) linkedToStock += 1
    })
  }

  return {
    connected: true,
    inventoryConnected,
    empty: totalSuppliers === 0,
    metrics: {
      totalSuppliers,
      linkedToStock: inventoryConnected ? linkedToStock : null,
      withoutStockItems: inventoryConnected ? Math.max(totalSuppliers - linkedToStock, 0) : null,
    },
  }
}

export function buildReportsOverview({
  period = REPORT_PERIOD_TODAY,
  reservationsReport,
  tasksReport,
  stockReport,
  scheduleReport,
}) {
  if (period === REPORT_PERIOD_TODAY) {
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
        key: 'tasks-overdue',
        label: 'Tasks overdue',
        value: tasksReport?.connected ? tasksReport.metrics.overdue : null,
        connected: tasksReport?.connected,
        format: 'count',
      },
      {
        key: 'items-to-order',
        label: 'Items to order',
        value: stockReport?.inventoryConnected ? stockReport.metrics.itemsToOrder : null,
        connected: stockReport?.inventoryConnected,
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
        value: stockReport?.inventoryConnected ? stockReport.metrics.totalStockValue : null,
        connected: stockReport?.inventoryConnected,
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
      key: 'bar-refills',
      label: 'Bar refills completed',
      value: stockReport?.barRefillsConnected ? stockReport.metrics.barRefillsCompleted : null,
      connected: stockReport?.barRefillsConnected,
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
      value: stockReport?.inventoryConnected ? stockReport.metrics.totalStockValue : null,
      connected: stockReport?.inventoryConnected,
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
  barRefills,
  suppliers,
  schedule,
  connections = {},
}) {
  const reservationsReport = buildReservationsReport(reservations, {
    period,
    todayKey,
    weekStartDate,
    connected: connections.reservationsConnected,
  })
  const tasksReport = buildTasksReport(tasks, {
    period,
    todayKey,
    weekStartDate,
    connected: connections.tasksConnected,
  })
  const stockReport = buildStockReport(inventoryItems, barRefills, {
    period,
    todayKey,
    weekStartDate,
    inventoryConnected: connections.inventoryConnected,
    barRefillsConnected: connections.barRefillsConnected,
  })
  const scheduleReport = buildScheduleReport({
    ...schedule,
    period,
    todayKey,
    weekStartDate,
    connected: connections.scheduleConnected,
  })
  const suppliersReport = buildSuppliersReport(suppliers, inventoryItems, {
    suppliersConnected: connections.suppliersConnected,
    inventoryConnected: connections.inventoryConnected,
  })
  const overview = buildReportsOverview({
    period,
    reservationsReport,
    tasksReport,
    stockReport,
    scheduleReport,
  })

  return {
    overview,
    reservationsReport,
    tasksReport,
    stockReport,
    scheduleReport,
    suppliersReport,
  }
}
