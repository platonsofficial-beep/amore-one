export function countOpenOperationsTasksForTodayChip(tasks = [], todayKey = '') {
  const normalizedToday = `${todayKey ?? ''}`.slice(0, 10)
  return (tasks ?? []).filter((task) => {
    const status = `${task?.status ?? ''}`.trim().toLowerCase()
    if (status === 'completed' || status === 'skipped' || status === 'done') return false
    if (task?.checklistTemplateId) return false
    const dueDate = `${task?.dueDate ?? task?.due_date ?? ''}`.slice(0, 10)
    return Boolean(dueDate) && (!normalizedToday || dueDate <= normalizedToday)
  }).length
}

function formatTaskChip(boardOpen = 0, operationsOpen = 0) {
  const board = Number(boardOpen) || 0
  const operations = Number(operationsOpen) || 0
  const total = board + operations
  if (total <= 0) {
    return { value: 'Clear', detail: '', tone: 'default' }
  }

  const parts = []
  if (board > 0) parts.push(`${board} board`)
  if (operations > 0) parts.push(`${operations} ops`)

  return {
    value: `${total} Open`,
    detail: parts.join(' · '),
    tone: 'warning',
  }
}

export function buildTodayCommandHeaderChips({
  dashboardLiveStatus = {},
  todayStatusSummary = {},
  dashboardTaskOverview = {},
  operationsOpenCount = 0,
  todayReservationsSummary = {},
  reservationsConnected = false,
  liveFloorState = {},
  showStock = false,
} = {}) {
  const chips = []

  const scheduleTone = `${dashboardLiveStatus.tone ?? 'standby'}`.trim() || 'standby'
  chips.push({
    id: 'schedule',
    icon: scheduleTone === 'draft' ? '🟡' : '🟢',
    label: 'Schedule',
    value: `${dashboardLiveStatus.chipValue ?? '—'}`.trim() || '—',
    tone: scheduleTone,
  })

  const onShiftCount = liveFloorState.state === 'live'
    ? Number(liveFloorState.onShiftCount) || 0
    : 0
  chips.push({
    id: 'on-shift',
    icon: '👥',
    label: 'On Shift',
    value: String(onShiftCount),
    tone: onShiftCount > 0 ? 'live' : 'muted',
  })

  const bookings = reservationsConnected ? Number(todayReservationsSummary.bookings) || 0 : null
  chips.push({
    id: 'reservations',
    icon: '🍽',
    label: 'Reservations',
    value: reservationsConnected ? String(bookings) : '—',
    tone: 'default',
  })

  if (showStock) {
    const stockLine = `${todayStatusSummary.stockSummaryLine ?? ''}`.trim()
    let stockValue = 'OK'
    let stockTone = 'default'

    if (!stockLine || stockLine === 'No products yet') {
      stockValue = stockLine === 'No products yet' ? 'Empty' : 'OK'
    } else if (stockLine.includes('out')) {
      stockValue = stockLine
      stockTone = 'alert'
    } else if (stockLine.includes('low') || stockLine.includes('delivery')) {
      stockValue = stockLine
      stockTone = 'warning'
    } else if (stockLine.includes('OK')) {
      stockValue = 'OK'
    } else {
      stockValue = stockLine
    }

    chips.push({
      id: 'stock',
      icon: '📦',
      label: 'Stock',
      value: stockValue,
      tone: stockTone,
    })
  }

  const taskChip = formatTaskChip(dashboardTaskOverview.active, operationsOpenCount)
  chips.push({
    id: 'tasks',
    icon: '✅',
    label: 'Tasks',
    value: taskChip.value,
    detail: taskChip.detail,
    tone: taskChip.tone,
  })

  return chips
}
