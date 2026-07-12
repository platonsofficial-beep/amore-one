import { useEffect, useState } from 'react'
import { isReservationInHouse } from './reservationHostStatus'
import {
  formatTime24,
  normalizeReservationDateKey,
  parseReservationTimeToMinutes,
} from './timeFormatUtils'
import { FLOOR_TABLE_OPERATIONAL_PHASES } from './floorTableOperationalState'

export const HOST_DINING_TIMER_REFRESH_MS = 60_000
const SERVICE_DAY_EARLY_MORNING_CUTOFF = 360

function getReservationTimeValue(reservation) {
  return reservation?.time || reservation?.reservation_time || ''
}

function toServiceDayMinutes(timeValue) {
  const minutes = parseReservationTimeToMinutes(timeValue)
  if (minutes === null) return null
  return minutes < SERVICE_DAY_EARLY_MORNING_CUTOFF ? minutes + 1440 : minutes
}

function toServiceDayNowMinutes(nowMinutes) {
  if (nowMinutes === null || nowMinutes === undefined) return null
  return nowMinutes < SERVICE_DAY_EARLY_MORNING_CUTOFF
    ? nowMinutes + 1440
    : nowMinutes
}

export function getReservationInServiceSinceTimeLabel(reservation) {
  const timeValue = getReservationTimeValue(reservation)
  if (!timeValue) return ''
  return formatTime24(timeValue) || ''
}

export function getReservationInServiceElapsedMinutes(
  reservation,
  nowMinutes,
  todayKey,
) {
  if (!isReservationInHouse(reservation)) return null

  const dateKey = normalizeReservationDateKey(
    reservation?.date || reservation?.reservation_date || '',
  )
  const normalizedTodayKey = normalizeReservationDateKey(todayKey)
  if (!dateKey || dateKey !== normalizedTodayKey) return null

  const arrivalMinutes = toServiceDayMinutes(getReservationTimeValue(reservation))
  const nowKey = toServiceDayNowMinutes(nowMinutes)
  if (arrivalMinutes === null || nowKey === null || nowKey < arrivalMinutes) return null

  return nowKey - arrivalMinutes
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

export function isHostFloorDiningTimerTable({
  phase = null,
  hostIndicator = null,
} = {}) {
  return phase === FLOOR_TABLE_OPERATIONAL_PHASES.SEATED
    || hostIndicator === 'seated'
}

export function buildHostFloorDiningTimerLabel(
  reservation,
  {
    phase = null,
    hostIndicator = null,
    nowMinutes = 0,
    todayKey = '',
  } = {},
) {
  if (!reservation || !isHostFloorDiningTimerTable({ phase, hostIndicator })) return null

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

    setReferenceDate(new Date())

    const intervalId = window.setInterval(() => {
      setReferenceDate(new Date())
    }, HOST_DINING_TIMER_REFRESH_MS)

    return () => window.clearInterval(intervalId)
  }, [enabled])

  return referenceDate
}
