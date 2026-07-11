import { reservationHasAssignedTables } from './floorAssignmentMapping'
import {
  enrichReservationWithSeatingAssignment,
  formatHostListTableLabel,
  formatHostListUnitLabel,
  getReservationSeatingAssignment,
} from './seatingAssignment'
import { isReservationProblemForHostFilter } from './hostServiceDashboard'
import {
  reservationMatchesTableDayViewSeating,
} from './reservationSeatings'
import { findLayoutUnit } from './reservationTableOptions'
import {
  groupHostListOperationalSections,
} from '../components/reservations/hostReservationListUtils'
import { normalizeReservationTimeValue } from './timeFormatUtils'
import {
  deriveHostQueueNoteBadges,
  getReservationUserNotesText,
  resolveHostQueueBadgeTone,
  summarizeHostQueueNoteBadges,
} from './hostQueueNoteBadges'

export const HOST_QUEUE_ALL_AREAS = '__all__'
export const HOST_QUEUE_UNASSIGNED_AREA = '__unassigned__'

export const HOST_QUEUE_DEFAULT_SORT = 'time-asc'

export const HOST_QUEUE_SORT_OPTIONS = [
  { id: 'time-asc', label: 'Time — earliest first' },
  { id: 'time-desc', label: 'Time — latest first' },
  { id: 'table', label: 'Table' },
  { id: 'name-asc', label: 'Guest name — A–Z' },
  { id: 'party-desc', label: 'Party size — largest first' },
  { id: 'party-asc', label: 'Party size — smallest first' },
]

export const HOST_QUEUE_FILTER_OPTIONS = [
  { id: 'all', label: 'All reservations' },
  { id: 'unassigned-table', label: 'Unassigned table' },
  { id: 'multi-table', label: 'Multi-table' },
  { id: 'extra-chair', label: 'Extra chair' },
  { id: 'standing-guests', label: 'Standing guests' },
  { id: 'has-notes', label: 'Has notes' },
  { id: 'large-party', label: 'Large party (4+)' },
  { id: 'problems', label: 'Problems' },
  { id: 'special-requirements', label: 'Special requirements' },
]

function getReservationSortMinutes(reservation) {
  const normalized = normalizeReservationTimeValue(
    reservation?.time ?? reservation?.reservation_time,
  )
  if (!normalized) return Number.MAX_SAFE_INTEGER

  const [hours, minutes] = normalized.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return Number.MAX_SAFE_INTEGER
  }

  return hours * 60 + minutes
}

function compareNaturalTableLabels(left, right) {
  const leftLabel = `${left ?? ''}`.trim()
  const rightLabel = `${right ?? ''}`.trim()
  const leftNumber = Number.parseInt(leftLabel.replace(/\D/g, ''), 10)
  const rightNumber = Number.parseInt(rightLabel.replace(/\D/g, ''), 10)

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber
  }

  return leftLabel.localeCompare(rightLabel, undefined, { numeric: true, sensitivity: 'base' })
}

export function getReservationPrimaryTableSortLabel(reservation) {
  const assignment = getReservationSeatingAssignment(reservation)
  const labels = (assignment?.assignedUnits ?? [])
    .map((unit) => formatHostListUnitLabel(unit.label))
    .sort(compareNaturalTableLabels)

  if (labels.length > 0) return labels[0]

  const tableLabel = formatHostListTableLabel(reservation)
  if (!tableLabel || tableLabel === '—') return 'zzz-unassigned'

  return tableLabel.split(' + ').sort(compareNaturalTableLabels)[0]
}

export function filterReservationsBySelectedSeating(
  reservations = [],
  selectedSeating = null,
  seatings = [],
  dateKey = '',
) {
  if (!selectedSeating?.id) return [...reservations]

  const seatingsList = seatings.length > 0 ? seatings : [selectedSeating]

  return reservations.filter((reservation) => (
    reservationMatchesTableDayViewSeating(
      reservation,
      selectedSeating,
      dateKey,
      seatingsList,
    )
  ))
}

export function deriveReservationAreaZoneIds(reservation, layout = null) {
  const enriched = enrichReservationWithSeatingAssignment(reservation)
  const assignedUnits = enriched.seatingAssignment?.assignedUnits ?? []
  const zoneIds = new Set()

  assignedUnits.forEach((unit) => {
    const layoutUnit = findLayoutUnit(layout, unit.id)
    if (layoutUnit?.zoneId) {
      zoneIds.add(String(layoutUnit.zoneId))
    }
  })

  if (zoneIds.size > 0) {
    return [...zoneIds]
  }

  const areaLabel = `${reservation?.area ?? ''}`.trim().toLowerCase()
  if (areaLabel && layout?.zones?.length) {
    const zone = layout.zones.find((entry) => (
      `${entry.label ?? ''}`.trim().toLowerCase() === areaLabel
    ))
    if (zone?.id) {
      return [String(zone.id)]
    }
  }

  return []
}

export function getReservationExplicitAreaLabel(reservation, layout = null) {
  const areaLabel = `${reservation?.area ?? ''}`.trim()
  if (!areaLabel) return ''

  if (layout?.zones?.length) {
    const zone = layout.zones.find((entry) => (
      `${entry.label ?? ''}`.trim().toLowerCase() === areaLabel.toLowerCase()
    ))
    if (zone?.label) return zone.label
  }

  return areaLabel
}

export function reservationMatchesHostQueueArea(
  reservation,
  areaFilterId = HOST_QUEUE_ALL_AREAS,
  layout = null,
) {
  if (!areaFilterId || areaFilterId === HOST_QUEUE_ALL_AREAS) return true

  const zoneIds = deriveReservationAreaZoneIds(reservation, layout)
  if (areaFilterId === HOST_QUEUE_UNASSIGNED_AREA) {
    return zoneIds.length === 0
  }

  return zoneIds.includes(String(areaFilterId))
}

export function buildHostQueueAreaOptions(layout = null) {
  const options = [{ id: HOST_QUEUE_ALL_AREAS, label: 'All areas' }]

  ;(layout?.zones ?? []).forEach((zone) => {
    if (!zone?.id) return
    options.push({
      id: String(zone.id),
      label: `${zone.label ?? 'Area'}`.trim() || 'Area',
    })
  })

  options.push({ id: HOST_QUEUE_UNASSIGNED_AREA, label: 'Unassigned / No area' })
  return options
}

function getStructuredRequirementBadgeIds(reservation) {
  const assignment = getReservationSeatingAssignment(reservation)
  const badgeIds = []

  if ((assignment?.extraChairs ?? 0) > 0) badgeIds.push('extra-chair')
  if ((assignment?.standingGuests ?? 0) > 0) badgeIds.push('standing-guests')

  const userNotes = getReservationUserNotesText(reservation?.notes ?? '').toLowerCase()
  if (/wheelchair|accessibility|accessible/.test(userNotes)) badgeIds.push('accessibility')
  if (/allerg/.test(userNotes)) badgeIds.push('allergy')
  if (/high\s+chair|baby\s+chair/.test(userNotes)) badgeIds.push('baby-chair')
  if (/birthday/.test(userNotes)) badgeIds.push('birthday')
  if (/anniversary/.test(userNotes)) badgeIds.push('occasion')
  if (/\bvip\b|\bv\.v\.i\.p\b/.test(userNotes)) badgeIds.push('vip')
  if (/\bwindow\b/.test(userNotes)) badgeIds.push('window')

  return badgeIds
}

export function reservationMatchesHostQueueOperationalFilter(
  reservation,
  filterId,
  {
    nowMinutes = 0,
    todayKey = '',
    problemFilterOptions = {},
  } = {},
) {
  const assignment = getReservationSeatingAssignment(reservation)
  const assignedUnits = assignment?.assignedUnits ?? []
  const userNotes = getReservationUserNotesText(reservation?.notes ?? '')
  const guests = Number(reservation?.guests) || 0

  switch (filterId) {
    case 'all':
      return true
    case 'unassigned-table':
      return !reservationHasAssignedTables(reservation)
    case 'multi-table':
      return assignedUnits.length > 1
    case 'extra-chair':
      return (assignment?.extraChairs ?? 0) > 0
    case 'standing-guests':
      return (assignment?.standingGuests ?? 0) > 0
    case 'has-notes':
      return Boolean(userNotes)
    case 'large-party':
      return guests >= 4
    case 'problems':
      return isReservationProblemForHostFilter(
        reservation,
        nowMinutes,
        todayKey,
        problemFilterOptions,
      )
    case 'special-requirements':
      return getStructuredRequirementBadgeIds(reservation).length > 0
      || deriveHostQueueNoteBadges(reservation, {
        extraChairs: assignment?.extraChairs ?? 0,
        standingGuests: assignment?.standingGuests ?? 0,
      }).length > 0
    default:
      return true
  }
}

export function applyHostQueueOperationalFilters(
  reservations = [],
  activeFilterIds = [],
  options = {},
) {
  const filters = activeFilterIds.filter((entry) => entry && entry !== 'all')
  if (!filters.length) return [...reservations]

  return reservations.filter((reservation) => (
    filters.every((filterId) => reservationMatchesHostQueueOperationalFilter(
      reservation,
      filterId,
      options,
    ))
  ))
}

export function buildHostQueueSearchHaystack(
  reservation,
  layout = null,
) {
  const assignment = getReservationSeatingAssignment(reservation)
  const tableLabel = formatHostListTableLabel(reservation)
  const areaLabel = getReservationExplicitAreaLabel(reservation, layout)
  const userNotes = getReservationUserNotesText(reservation?.notes ?? '')
  const noteBadges = deriveHostQueueNoteBadges(reservation, {
    extraChairs: assignment?.extraChairs ?? 0,
    standingGuests: assignment?.standingGuests ?? 0,
    structuredBadgeIds: getStructuredRequirementBadgeIds(reservation),
  })

  return [
    reservation?.guestName,
    reservation?.phone,
    tableLabel,
    areaLabel,
    userNotes,
    ...noteBadges.map((badge) => badge.label),
  ].join(' ').toLowerCase()
}

export function reservationMatchesHostQueueSearch(
  reservation,
  searchTerm = '',
  layout = null,
) {
  const needle = `${searchTerm ?? ''}`.trim().toLowerCase()
  if (!needle) return true

  return buildHostQueueSearchHaystack(reservation, layout).includes(needle)
}

export function sortHostQueueReservations(
  reservations = [],
  sortId = HOST_QUEUE_DEFAULT_SORT,
) {
  const sorted = [...reservations]

  sorted.sort((left, right) => {
    switch (sortId) {
      case 'time-desc': {
        const diff = getReservationSortMinutes(right) - getReservationSortMinutes(left)
        if (diff !== 0) return diff
        break
      }
      case 'table': {
        const diff = compareNaturalTableLabels(
          getReservationPrimaryTableSortLabel(left),
          getReservationPrimaryTableSortLabel(right),
        )
        if (diff !== 0) return diff
        break
      }
      case 'name-asc': {
        const diff = `${left?.guestName ?? ''}`.localeCompare(
          `${right?.guestName ?? ''}`,
          undefined,
          { sensitivity: 'base' },
        )
        if (diff !== 0) return diff
        break
      }
      case 'party-desc': {
        const diff = (Number(right?.guests) || 0) - (Number(left?.guests) || 0)
        if (diff !== 0) return diff
        break
      }
      case 'party-asc': {
        const diff = (Number(left?.guests) || 0) - (Number(right?.guests) || 0)
        if (diff !== 0) return diff
        break
      }
      case 'time-asc':
      default: {
        const diff = getReservationSortMinutes(left) - getReservationSortMinutes(right)
        if (diff !== 0) return diff
        break
      }
    }

    return `${left?.guestName ?? ''}`.localeCompare(
      `${right?.guestName ?? ''}`,
      undefined,
      { sensitivity: 'base' },
    )
  })

  return sorted
}

export function buildHostQueueReservationList(
  reservations = [],
  {
    selectedSeating = null,
    seatings = [],
    dateKey = '',
    areaFilterId = HOST_QUEUE_ALL_AREAS,
    activeFilterIds = [],
    searchTerm = '',
    layout = null,
    nowMinutes = 0,
    problemFilterOptions = {},
  } = {},
) {
  let filtered = buildHostQueueScopeReservations(reservations, {
    selectedSeating,
    seatings,
    dateKey,
    areaFilterId,
    layout,
  })

  filtered = applyHostQueueOperationalFilters(filtered, activeFilterIds, {
    nowMinutes,
    todayKey: dateKey,
    problemFilterOptions,
  })

  filtered = filtered.filter((reservation) => (
    reservationMatchesHostQueueSearch(reservation, searchTerm, layout)
  ))

  return filtered
}

export function buildHostQueueScopeReservations(
  reservations = [],
  {
    selectedSeating = null,
    seatings = [],
    dateKey = '',
    areaFilterId = HOST_QUEUE_ALL_AREAS,
    layout = null,
  } = {},
) {
  let filtered = filterReservationsBySelectedSeating(
    reservations,
    selectedSeating,
    seatings,
    dateKey,
  )

  filtered = filtered.filter((reservation) => (
    reservationMatchesHostQueueArea(reservation, areaFilterId, layout)
  ))

  return filtered
}

export function groupHostQueueOperationalSections(
  reservations = [],
  {
    nowMinutes = 0,
    todayKey = '',
    sortId = HOST_QUEUE_DEFAULT_SORT,
    problemFilterOptions = {},
  } = {},
) {
  const sections = groupHostListOperationalSections(
    reservations,
    nowMinutes,
    todayKey,
    problemFilterOptions,
  )

  return sections.map((section) => ({
    ...section,
    reservations: sortHostQueueReservations(section.reservations, sortId),
  }))
}

export function countActiveHostQueueFilters(activeFilterIds = []) {
  return activeFilterIds.filter((entry) => entry && entry !== 'all').length
}

export function buildHostQueueEmptyState({
  sectionLabel = '',
  selectedSeatingName = '',
  selectedAreaLabel = '',
  activeFilterCount = 0,
  searchTerm = '',
} = {}) {
  const scopeParts = [selectedSeatingName, selectedAreaLabel].filter(Boolean)
  const scopeLabel = scopeParts.join(' · ')

  if (activeFilterCount > 0 || `${searchTerm ?? ''}`.trim()) {
    return {
      title: 'No reservations match the current filters',
      copy: scopeLabel
        ? `Try clearing filters or changing the scope for ${scopeLabel}.`
        : 'Try clearing filters or adjusting your search.',
      showClearFilters: activeFilterCount > 0 || Boolean(`${searchTerm ?? ''}`.trim()),
    }
  }

  if (sectionLabel && scopeLabel) {
    return {
      title: `No ${sectionLabel.toLowerCase()} reservations in ${scopeLabel}`,
      copy: 'Reservations will appear here when they match the selected seating and area.',
      showClearFilters: false,
    }
  }

  return {
    title: 'No reservations in this queue',
    copy: 'Adjust seating, area, or filters to widen the list.',
    showClearFilters: false,
  }
}

export function formatHostQueueTableSegment(reservation) {
  const tableLabel = formatHostListTableLabel(reservation)
  if (!tableLabel || tableLabel === '—') return 'Unassigned'
  return tableLabel.split(' + ').map((part) => (
    part.startsWith('T') ? part : formatHostListUnitLabel(part)
  )).join(' + ')
}

export function getHostQueueNameIndicators(reservation) {
  const userNotes = getReservationUserNotesText(reservation?.notes ?? '').toLowerCase()

  if (/allerg/i.test(userNotes)) {
    return [{ id: 'allergy', icon: '⚠', label: 'Allergy' }]
  }
  if (/wheelchair|accessibility|accessible/.test(userNotes)) {
    return [{ id: 'accessibility', icon: '♿', label: 'Accessibility' }]
  }
  if (/\bvip\b|\bv\.v\.i\.p\b/.test(userNotes)) {
    return [{ id: 'vip', icon: '★', label: 'VIP' }]
  }

  return []
}

export function buildHostQueueRowPresentation(reservation, layout = null) {
  const partySize = Number(reservation?.guests) || 0
  const assignment = getReservationSeatingAssignment(reservation)
  const tableSegment = formatHostQueueTableSegment(reservation)
  const areaLabel = getReservationExplicitAreaLabel(reservation, layout)
  const hasAssignedTables = reservationHasAssignedTables(reservation)
  const extraChairs = assignment?.extraChairs ?? 0
  const standingGuests = assignment?.standingGuests ?? 0

  const metaParts = [`👤 ${partySize}`]
  if (areaLabel && !hasAssignedTables) {
    metaParts.push(`📍 ${areaLabel}`)
  }
  metaParts.push(`🍽 ${tableSegment}`)

  if (extraChairs > 0) {
    metaParts.push(`🪑 +${extraChairs}`)
  }
  if (standingGuests > 0) {
    metaParts.push(`Standing +${standingGuests}`)
  }

  const structuredBadgeIds = getStructuredRequirementBadgeIds(reservation)
  const noteBadges = deriveHostQueueNoteBadges(reservation, {
    extraChairs,
    standingGuests,
    structuredBadgeIds,
  }).filter((badge) => {
    if (badge.id === 'extra-chair-note' || badge.id === 'structured-extra-chair') return false
    if (badge.id === 'structured-standing') return false
    return true
  })

  const chipBadges = noteBadges.map((badge) => ({
    id: badge.id,
    label: badge.label,
    tone: resolveHostQueueBadgeTone(badge.id),
  }))

  const { visible, overflowCount } = summarizeHostQueueNoteBadges(chipBadges)

  return {
    metaLine: metaParts.join('   '),
    metaAriaLabel: [
      `${partySize} guests`,
      tableSegment === 'Unassigned' ? 'table unassigned' : `table ${tableSegment}`,
      extraChairs > 0 ? `${extraChairs} extra chair${extraChairs === 1 ? '' : 's'}` : '',
      standingGuests > 0 ? `${standingGuests} standing guest${standingGuests === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(', '),
    chips: visible,
    overflowCount,
    nameIndicators: getHostQueueNameIndicators(reservation),
  }
}

export function reservationIsVisibleInHostQueue(
  reservation,
  visibleReservations = [],
) {
  if (!reservation?.id) return false
  return visibleReservations.some((entry) => String(entry.id) === String(reservation.id))
}
