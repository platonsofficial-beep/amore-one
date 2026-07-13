export const TODAY_EXECUTIVE_MESSAGE_MAX_LENGTH = 70

function clampExecutiveMessage(message) {
  const text = `${message ?? ''}`.trim()
  if (text.length <= TODAY_EXECUTIVE_MESSAGE_MAX_LENGTH) return text
  return `${text.slice(0, TODAY_EXECUTIVE_MESSAGE_MAX_LENGTH - 1).trimEnd()}…`
}

function buildExecutivePresentation({ tone, message }) {
  return {
    tone,
    indicator: 'dot',
    message: clampExecutiveMessage(message),
  }
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
    const urgentMessage = isServiceInProgress
      ? 'Service requires immediate attention.'
      : 'Attention is required before service.'
    return buildExecutivePresentation({
      tone: 'critical',
      message: urgentMessage,
    })
  }

  const overdue = Number(overdueTaskCount) || 0
  if (overdue > 0) {
    const overdueMessage = overdue === 1
      ? '1 overdue task needs your attention.'
      : `${overdue} overdue tasks need your attention.`
    return buildExecutivePresentation({
      tone: 'warning',
      message: overdueMessage,
    })
  }

  if (hasScheduleGaps) {
    return buildExecutivePresentation({
      tone: 'warning',
      message: 'Staffing gaps need attention before service.',
    })
  }

  const reservations = Number(reservationsTodayCount) || 0
  if (reservations > 0) {
    const reservationsMessage = reservations === 1
      ? '1 reservation is expected today.'
      : `${reservations} reservations are expected today.`
    return buildExecutivePresentation({
      tone: 'neutral',
      message: reservationsMessage,
    })
  }

  const shiftStart = `${firstShiftStartLabel ?? ''}`.trim()
  if (!isServiceInProgress && shiftStart) {
    return buildExecutivePresentation({
      tone: 'neutral',
      message: `The first shift starts at ${shiftStart}.`,
    })
  }

  if (isServiceInProgress) {
    return buildExecutivePresentation({
      tone: 'positive',
      message: 'Service is currently in progress.',
    })
  }

  if (hasStockProblems) {
    return buildExecutivePresentation({
      tone: 'warning',
      message: 'Stock items require attention.',
    })
  }

  return buildExecutivePresentation({
    tone: 'positive',
    message: "Everything is ready for today's service.",
  })
}
