import { useEffect, useState } from 'react'
import { parseTimeToMinutes } from './shiftHoursUtils'
import { isReservationInHouse } from './reservationHostStatus'
import { formatTime24 } from './timeFormatUtils'
import { FLOOR_TABLE_OPERATIONAL_PHASES } from './floorTableOperationalState'

export const HOST_DINING_TIMER_REFRESH_MS = 60_000

export function getReservationInServiceSinceTimeLabel(reservation) {
  if (!reservation?.time) return ''
  return formatTime24(reservation.time) || ''
}

export function getReservationInServiceElapsedMinutes(
  reservation,
  nowMinutes,
  todayKey,
) {
  if (!isReservationInHouse(reservation)) return null

  const dateKey = `${reservation.date ?? ''}`.slice(0, 10)
  if (dateKey !== todayKey) return null

  const arrivalMinutes = parseTimeToMinutes(reservation.time)
  if (arrivalMinutes === null || nowMinutes < arrivalMinutes) return null

  return nowMinutes - arrivalMinutes
}

export function formatHostDiningTimerLabel(elapsedMinutes) {
  const minutes = Math.max(0, Number(elapsedMinutes) || 0)
  if (minutes < 1) return null

  if (minutes < 60) return `⏱ ${minutes}m`

  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (remainder === 0) return `⏱ ${hours}h`
  return `⏱ ${hours}h ${remainder}m`
}

export function buildHostFloorDiningTimerLabel(
  reservation,
  {
    phase = null,
    nowMinutes = 0,
    todayKey = '',
  } = {},
) {
  if (!reservation || phase !== FLOOR_TABLE_OPERATIONAL_PHASES.SEATED) return null

  const elapsedMinutes = getReservationInServiceElapsedMinutes(
    reservation,
    nowMinutes,
    todayKey,
  )
  if (elapsedMinutes === null) return null

  return formatHostDiningTimerLabel(elapsedMinutes)
}

export function getNowMinutesFromDate(referenceDate = new Date()) {
  return referenceDate.getHours() * 60 + referenceDate.getMinutes()
}

export function useHostDiningTimerClock(enabled = false) {
  const [referenceDate, setReferenceDate] = useState(() => new Date())

  useEffect(() => {
    if (!enabled) return undefined

    const intervalId = window.setInterval(() => {
      setReferenceDate(new Date())
    }, HOST_DINING_TIMER_REFRESH_MS)

    return () => window.clearInterval(intervalId)
  }, [enabled])

  return referenceDate
}
