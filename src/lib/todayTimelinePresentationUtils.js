import { t } from '../i18n/i18n'

export function formatTimelineGuestName(title) {
  return `${title ?? ''}`.trim() || t("Guest")
}

export function formatTimelineGuestsLine(guests) {
  const count = Number(guests)
  if (!Number.isFinite(count) || count <= 0) return ''
  return `👥 ${t('{{count}} guest', { count })}`
}

export function formatTimelineTablesLine(tableNumber) {
  const raw = `${tableNumber ?? ''}`.trim()
  if (!raw) return ''

  const tables = raw
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^table\s+/i, '').trim())
    .filter(Boolean)

  if (tables.length === 0) return ''
  return `🪑 ${tables.join(' • ')}`
}

export function buildReservationTimelinePresentation(event, eventRow = {}) {
  const guestsLine = formatTimelineGuestsLine(event?.guests)
  const tablesLine = formatTimelineTablesLine(event?.tableNumber)
  const fallbackLine = !guestsLine && !tablesLine
    ? `${eventRow?.subtitle ?? eventRow?.meta ?? event?.note ?? ''}`.trim()
    : ''

  return {
    guestName: formatTimelineGuestName(event?.guestName ?? event?.title ?? eventRow?.title),
    guestsLine,
    tablesLine,
    fallbackLine,
  }
}
