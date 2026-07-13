export const TODAY_EXECUTIVE_MESSAGE_MAX_LENGTH = 70

function clampExecutiveMessage(message) {
  const text = `${message ?? ''}`.trim()
  if (text.length <= TODAY_EXECUTIVE_MESSAGE_MAX_LENGTH) return text
  return `${text.slice(0, TODAY_EXECUTIVE_MESSAGE_MAX_LENGTH - 1).trimEnd()}…`
}

export function hasTodayStockProblems({
  stockSummary = null,
  stockSummaryLine = '',
  hasStockModuleData = false,
} = {}) {
  const outCount = Number(stockSummary?.outOfStock) || 0
  const lowCount = Number(stockSummary?.lowStock) || 0
  if (outCount > 0 || lowCount > 0) return true

  if (!hasStockModuleData) return false

  const line = `${stockSummaryLine ?? ''}`.trim().toLowerCase()
  if (!line || line === 'stock levels ok' || line === 'no products yet') return false
  return line.includes('out') || line.includes('low') || line.includes('pending')
}

export function buildTodayExecutiveMessage({
  hasUrgentAttention = false,
  overdueTaskCount = 0,
  hasScheduleGaps = false,
  reservationsTodayCount = 0,
  firstShiftStartLabel = '',
  isServiceInProgress = false,
  hasStockProblems = false,
} = {}) {
  if (hasUrgentAttention) {
    return clampExecutiveMessage('🚨 Immediate attention required.')
  }

  const overdue = Number(overdueTaskCount) || 0
  if (overdue > 0) {
    const taskLabel = overdue === 1 ? 'task' : 'tasks'
    return clampExecutiveMessage(`⚠️ You have ${overdue} overdue ${taskLabel}.`)
  }

  if (hasScheduleGaps) {
    return clampExecutiveMessage('👥 Schedule has staffing gaps.')
  }

  const reservations = Number(reservationsTodayCount) || 0
  if (reservations > 0) {
    const reservationLabel = reservations === 1 ? 'reservation' : 'reservations'
    return clampExecutiveMessage(`🍽️ ${reservations} ${reservationLabel} expected today.`)
  }

  const shiftStart = `${firstShiftStartLabel ?? ''}`.trim()
  if (!isServiceInProgress && shiftStart) {
    return clampExecutiveMessage(`🕒 First shift starts at ${shiftStart}.`)
  }

  if (isServiceInProgress) {
    return clampExecutiveMessage('🟢 Service is currently in progress.')
  }

  if (hasStockProblems) {
    return clampExecutiveMessage('📦 Stock items require attention.')
  }

  return clampExecutiveMessage("✨ Everything is ready for today's service.")
}
