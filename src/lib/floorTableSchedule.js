import { getReservationsForFloorTable, pickHighlightedFloorTableReservation } from './floorAssignmentMapping'
import { getScheduleEntryActionKind } from './floorTableOperationalState'
import { formatHostListTableLabel } from './seatingAssignment'
import { getHostListStatusLabel, getReservationDisplayStatus } from './reservationHostStatus'
import { formatTime24 } from './timeFormatUtils'

function formatGuestName(name) {
  const raw = `${name ?? ''}`.trim()
  return raw || 'Guest'
}

export function buildFloorTableScheduleEntries(
  table,
  reservations,
  todayKey,
  nowMinutes,
  { floorUnits = [], syncWithList = false } = {},
) {
  const tableSchedule = getReservationsForFloorTable(table, reservations, todayKey, {
    floorUnits,
    syncWithList,
  })
  const highlighted = pickHighlightedFloorTableReservation(tableSchedule, nowMinutes, todayKey)
  const highlightedId = highlighted ? String(highlighted.id) : null

  return tableSchedule.map((entry, index) => ({
    id: `${entry.id}-${entry.time ?? index}-${index}`,
    reservation: entry,
    time: formatTime24(entry.time),
    guestName: formatGuestName(entry.guestName ?? entry.name),
    guests: Math.max(0, Number(entry.guests) || 0),
    tablesLabel: formatHostListTableLabel(entry),
    statusLabel: getHostListStatusLabel(getReservationDisplayStatus(entry, nowMinutes, todayKey)),
    actionKind: getScheduleEntryActionKind(entry, nowMinutes, todayKey),
    isHighlighted: highlightedId !== null && String(entry.id) === highlightedId,
  }))
}

export function getFloorTableScheduleLabel(table) {
  if (!table) return 'TABLE'
  const unitLabel = table.displayLabel ?? (table.unitType === 'table' ? `Table ${table.label}` : table.label)
  return `${unitLabel}`.toUpperCase()
}
