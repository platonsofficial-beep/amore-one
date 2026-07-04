import {
  formatServiceHourLabel,
  getReservationServiceHour,
} from './timeFormatUtils'

export const DEFAULT_RESERVATION_SERVICE_HOURS = [18, 19, 20, 21, 22, 23]

export function getReservationTimeValue(reservation) {
  if (!reservation || typeof reservation !== 'object') return ''
  return reservation.time ?? reservation.reservation_time ?? ''
}

export function getReservationServiceHourBucket(reservation) {
  return getReservationServiceHour(getReservationTimeValue(reservation))
}

export function reservationMatchesServiceHourBucket(reservation, serviceHour) {
  if (serviceHour === null || serviceHour === undefined) return true
  return getReservationServiceHourBucket(reservation) === serviceHour
}

export function buildHostServiceHourPressureSlots(
  reservations,
  serviceHours = DEFAULT_RESERVATION_SERVICE_HOURS,
) {
  const counts = new Map()

  reservations.forEach((reservation) => {
    const hour = getReservationServiceHourBucket(reservation)
    if (hour === null) return
    counts.set(hour, (counts.get(hour) ?? 0) + 1)
  })

  const hoursFromData = [...counts.keys()]
  const displayHours = [...new Set([...serviceHours, ...hoursFromData])]
    .sort((leftHour, rightHour) => leftHour - rightHour)

  return displayHours.map((hour) => ({
    hour,
    timeLabel: formatServiceHourLabel(hour),
    count: counts.get(hour) ?? 0,
  }))
}
