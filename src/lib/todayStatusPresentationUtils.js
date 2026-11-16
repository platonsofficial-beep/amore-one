import { t } from '../i18n/i18n'

function asCount(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function buildOnShiftCard(statusSummary = {}) {
  const count = asCount(statusSummary.onShiftScheduledCount)
  const clockedRaw = statusSummary.clockedInCount
  const clockedIn = clockedRaw == null || clockedRaw === '' ? null : asCount(clockedRaw)
  const unpublished = statusSummary.scheduleState === 'unpublished'
  const primary = t('{{count}} employee', { count })
  let secondary = count > 0 ? t("Active now") : t("No active shifts")
  if (unpublished) secondary = t("Schedule not published")
  else if (clockedIn != null) secondary = t('{{count}} clocked in', { count: clockedIn })

  return {
    id: 'on-shift',
    icon: '🟢',
    title: t("On Shift"),
    primary,
    secondary,
    tone: count > 0 ? 'live' : 'muted',
  }
}

function buildTeamCard(statusSummary = {}) {
  const scheduled = asCount(statusSummary.scheduledStaff)
  const gaps = asCount(statusSummary.coverageGaps)
  if (scheduled <= 0) {
    return {
      id: 'team',
      icon: '👥',
      title: t("Team"),
      primary: t("No schedule today"),
      secondary: t("No shifts scheduled today"),
      tone: 'muted',
    }
  }

  return {
    id: 'team',
    icon: '👥',
    title: t("Team"),
    primary: t('{{count}} scheduled', { count: scheduled }),
    secondary: gaps > 0
      ? t('{{count}} uncovered shift', { count: gaps })
      : t("On roster today"),
    tone: gaps > 0 ? 'warning' : 'default',
  }
}

function buildReservationsCard(statusSummary = {}) {
  if (statusSummary.reservationsConnected === false) {
    return {
      id: 'reservations',
      icon: '🍽',
      title: t("Reservations"),
      primary: '—',
      secondary: t("Reservations not connected"),
      tone: 'muted',
    }
  }

  const bookings = asCount(statusSummary.reservationBookings)
  const covers = asCount(statusSummary.reservationCovers)
  const nextTime = `${statusSummary.reservationNextTime ?? ''}`.trim()
  const secondary = [
    covers > 0 ? t('{{count}} cover', { count: covers }) : '',
    nextTime ? t("Next {{time}}", { time: nextTime }) : (bookings <= 0 ? t("No reservations today") : ''),
  ].filter(Boolean).join(' · ')

  return {
    id: 'reservations',
    icon: '🍽',
    title: t("Reservations"),
    primary: t('{{count}} booking', { count: bookings }),
    secondary,
    tone: 'default',
  }
}

function buildTasksCard(statusSummary = {}) {
  if (statusSummary.tasksConnected === false) {
    return {
      id: 'tasks',
      icon: '✅',
      title: t("Tasks"),
      primary: '—',
      secondary: t("Tasks not connected"),
      tone: 'muted',
    }
  }

  const open = asCount(statusSummary.tasksOpen)
  const overdue = asCount(statusSummary.tasksOverdue)
  const done = asCount(statusSummary.tasksDone)
  const secondary = overdue > 0
    ? t('{{count}} overdue', { count: overdue })
    : done > 0
      ? t('{{count}} done today', { count: done })
      : t("No open tasks today")

  return {
    id: 'tasks',
    icon: '✅',
    title: t("Tasks"),
    primary: open > 0 ? t('{{count}} Open', { count: open }) : t("All clear"),
    secondary,
    tone: open > 0 || overdue > 0 ? 'warning' : 'default',
  }
}

function buildStockCard(statusSummary = {}) {
  if (!`${statusSummary.stockSummaryLine ?? ''}`.trim() && statusSummary.stockOut == null && statusSummary.stockLow == null) {
    return null
  }
  const out = asCount(statusSummary.stockOut)
  const low = asCount(statusSummary.stockLow)
  if (statusSummary.stockEmpty) {
    return {
      id: 'stock',
      icon: '📦',
      title: t("Stock"),
      primary: t("Empty"),
      secondary: t("No products yet"),
      tone: 'muted',
    }
  }
  if (out <= 0 && low <= 0) {
    return {
      id: 'stock',
      icon: '📦',
      title: t("Stock"),
      primary: t("No alerts"),
      secondary: t("Stock levels OK"),
      tone: 'default',
    }
  }
  return {
    id: 'stock',
    icon: '📦',
    title: t("Stock"),
    primary: t('{{count}} out', { count: out }),
    secondary: t('{{count}} low', { count: low }),
    tone: out > 0 ? 'alert' : 'warning',
  }
}

export function buildTodayStatusCardsFromSummary(statusSummary = {}, { showStock = false } = {}) {
  const cards = [
    buildOnShiftCard(statusSummary),
    buildReservationsCard(statusSummary),
    buildTasksCard(statusSummary),
  ]

  if (showStock) {
    const stockCard = buildStockCard(statusSummary)
    if (stockCard) cards.push(stockCard)
  }

  cards.push(buildTeamCard(statusSummary))
  return cards
}

export function shouldShowAnnouncementPreviewToggle(message = '', maxPreviewLength = 120) {
  const normalized = `${message ?? ''}`.trim()
  if (!normalized) return false
  if (normalized.length > maxPreviewLength) return true
  return normalized.split('\n').length > 2
}
