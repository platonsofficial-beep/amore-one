export function buildTodayCommandHeaderChips({
  dashboardLiveStatus = {},
  todayStatusSummary = {},
  dashboardTaskOverview = {},
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

  const openTasks = Number(dashboardTaskOverview.active) || 0
  chips.push({
    id: 'tasks',
    icon: '✅',
    label: 'Tasks',
    value: openTasks > 0 ? `${openTasks} Open` : 'Clear',
    tone: openTasks > 0 ? 'warning' : 'default',
  })

  return chips
}
