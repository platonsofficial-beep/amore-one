function splitSummaryParts(value = '') {
  return `${value}`.split('·').map((part) => part.trim()).filter(Boolean)
}

function buildOnShiftCard(onShiftSummary = '') {
  const line = `${onShiftSummary}`.trim()
  let primary = '0 employees'
  let secondary = 'No active shifts'
  let tone = 'muted'

  const workingMatch = line.match(/^(\d+)\s+working now$/i)
  if (workingMatch) {
    const count = Number(workingMatch[1])
    primary = count === 1 ? '1 employee' : `${count} employees`
    secondary = 'Active now'
    tone = 'live'
  } else if (line === 'Schedule not published') {
    secondary = line
  }

  return {
    id: 'on-shift',
    icon: '🟢',
    title: 'On Shift',
    primary,
    secondary,
    tone,
  }
}

function buildTeamCard(teamScheduledSummary = '') {
  const line = `${teamScheduledSummary}`.trim()
  const parts = splitSummaryParts(line)

  if (!line || line.startsWith('No shifts')) {
    return {
      id: 'team',
      icon: '👥',
      title: 'Team',
      primary: 'No schedule today',
      secondary: line || 'No shifts scheduled today',
      tone: 'muted',
    }
  }

  const scheduledMatch = parts[0]?.match(/^(\d+)\s+scheduled/i)
  return {
    id: 'team',
    icon: '👥',
    title: 'Team',
    primary: scheduledMatch ? `${scheduledMatch[1]} scheduled` : parts[0],
    secondary: parts[1] || (parts[0]?.includes('today') ? 'On roster today' : ''),
    tone: /open shift/i.test(parts[1] ?? '') || parts[1]?.includes('gap') ? 'warning' : 'default',
  }
}

function buildReservationsCard(reservationsSummaryLine = '') {
  const line = `${reservationsSummaryLine}`.trim()
  const parts = splitSummaryParts(line)

  if (line.includes('not connected')) {
    return {
      id: 'reservations',
      icon: '🍽',
      title: 'Reservations',
      primary: '—',
      secondary: line,
      tone: 'muted',
    }
  }

  if (!line || line.startsWith('No reservations')) {
    return {
      id: 'reservations',
      icon: '🍽',
      title: 'Reservations',
      primary: '0 bookings',
      secondary: line || 'No reservations today',
      tone: 'muted',
    }
  }

  const bookingPart = parts.find((part) => /booking/i.test(part)) ?? parts[0] ?? ''
  const coverPart = parts.find((part) => /cover/i.test(part)) ?? ''
  const nextPart = parts.find((part) => part.startsWith('Next')) ?? ''
  const bookingCount = bookingPart.match(/(\d+)/)?.[1]

  return {
    id: 'reservations',
    icon: '🍽',
    title: 'Reservations',
    primary: bookingCount
      ? `${bookingCount} booking${bookingCount === '1' ? '' : 's'}`
      : bookingPart,
    secondary: [coverPart, nextPart].filter(Boolean).join(' · '),
    tone: 'default',
  }
}

function buildTasksCard(tasksSummary = '') {
  const line = `${tasksSummary}`.trim()
  const parts = splitSummaryParts(line)

  if (line.includes('not connected')) {
    return {
      id: 'tasks',
      icon: '✅',
      title: 'Tasks',
      primary: '—',
      secondary: line,
      tone: 'muted',
    }
  }

  if (!line || line.startsWith('No open tasks')) {
    return {
      id: 'tasks',
      icon: '✅',
      title: 'Tasks',
      primary: 'Clear',
      secondary: line || 'No open tasks today',
      tone: 'default',
    }
  }

  const openMatch = parts[0]?.match(/(\d+)\s+open/i)
    ?? line.match(/(\d+)\s+open task/i)
  const overduePart = parts.find((part) => /overdue/i.test(part))
  const donePart = parts.find((part) => /done today/i.test(part))

  if (openMatch) {
    const openCount = Number(openMatch[1])
    return {
      id: 'tasks',
      icon: '✅',
      title: 'Tasks',
      primary: `${openCount} Open`,
      secondary: overduePart || donePart || 'All caught up',
      tone: openCount > 0 || overduePart ? 'warning' : 'default',
    }
  }

  if (overduePart) {
    const overdueCount = overduePart.match(/(\d+)/)?.[1]
    return {
      id: 'tasks',
      icon: '✅',
      title: 'Tasks',
      primary: '0 Open',
      secondary: overdueCount ? `${overdueCount} Overdue` : overduePart,
      tone: 'warning',
    }
  }

  return {
    id: 'tasks',
    icon: '✅',
    title: 'Tasks',
    primary: 'Clear',
    secondary: parts[0] || line,
    tone: 'default',
  }
}

function buildStockCard(stockSummaryLine = '') {
  const line = `${stockSummaryLine}`.trim()
  if (!line) return null

  if (line.includes('OK')) {
    return {
      id: 'stock',
      icon: '📦',
      title: 'Stock',
      primary: 'No alerts',
      secondary: line,
      tone: 'default',
    }
  }

  if (line === 'No products yet') {
    return {
      id: 'stock',
      icon: '📦',
      title: 'Stock',
      primary: 'Empty',
      secondary: line,
      tone: 'muted',
    }
  }

  return {
    id: 'stock',
    icon: '📦',
    title: 'Stock',
    primary: line,
    secondary: '',
    tone: line.includes('out') ? 'alert' : 'warning',
  }
}

export function buildTodayStatusCardsFromSummary(statusSummary = {}, { showStock = false } = {}) {
  const cards = [
    buildOnShiftCard(statusSummary.onShiftSummary),
    buildReservationsCard(statusSummary.reservationsSummaryLine),
    buildTasksCard(statusSummary.tasksSummary),
  ]

  if (showStock && statusSummary.stockSummaryLine) {
    const stockCard = buildStockCard(statusSummary.stockSummaryLine)
    if (stockCard) cards.push(stockCard)
  }

  cards.push(buildTeamCard(statusSummary.teamScheduledSummary))
  return cards
}

export function shouldShowAnnouncementPreviewToggle(message = '', maxPreviewLength = 120) {
  const normalized = `${message ?? ''}`.trim()
  if (!normalized) return false
  if (normalized.length > maxPreviewLength) return true
  return normalized.split('\n').length > 2
}
