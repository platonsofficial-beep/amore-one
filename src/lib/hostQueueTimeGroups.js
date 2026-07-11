import { normalizeReservationTimeValue } from './timeFormatUtils'
import { HOST_QUEUE_DEFAULT_SORT } from './hostQueuePipeline'

export const HOST_QUEUE_TIME_SORT_IDS = new Set(['time-asc', 'time-desc'])

export function shouldGroupHostQueueByTime(sortId = HOST_QUEUE_DEFAULT_SORT) {
  return HOST_QUEUE_TIME_SORT_IDS.has(sortId)
}

export function getReservationExactTimeKey(reservation) {
  return normalizeReservationTimeValue(
    reservation?.time ?? reservation?.reservation_time,
  ) || '__unscheduled__'
}

export function formatHostQueueTimeGroupLabel(timeKey) {
  if (timeKey === '__unscheduled__') return 'No time'
  return timeKey
}

export function groupHostQueueReservationsByTime(
  reservations = [],
  sortId = HOST_QUEUE_DEFAULT_SORT,
) {
  if (!shouldGroupHostQueueByTime(sortId)) {
    return null
  }

  const groups = new Map()

  reservations.forEach((reservation) => {
    const timeKey = getReservationExactTimeKey(reservation)
    if (!groups.has(timeKey)) {
      groups.set(timeKey, [])
    }
    groups.get(timeKey).push(reservation)
  })

  const orderedKeys = [...groups.keys()].sort((left, right) => {
    if (left === '__unscheduled__') return 1
    if (right === '__unscheduled__') return -1
    if (sortId === 'time-desc') return right.localeCompare(left)
    return left.localeCompare(right)
  })

  return orderedKeys.map((timeKey) => {
    const groupReservations = groups.get(timeKey) ?? []
    return {
      timeKey,
      timeLabel: formatHostQueueTimeGroupLabel(timeKey),
      count: groupReservations.length,
      reservations: groupReservations,
    }
  })
}
