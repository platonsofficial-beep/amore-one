import { useEffect, useState } from 'react'
import { isReservationInHouse } from './reservationHostStatus'
import { getReservationPurpose } from './reservationPurpose'
import {
  formatTime24,
  normalizeReservationDateKey,
  parseReservationTimeToMinutes,
} from './timeFormatUtils'
import { FLOOR_TABLE_OPERATIONAL_PHASES } from './floorTableOperationalState'

export const HOST_DINING_TIMER_REFRESH_MS = 60_000

export const HOST_DINING_TIMER_DURATION_POLICY_MINUTES = {
  dinner: 150,
  drinks: 90,
}

export const HOST_DINING_TIMER_URGENCY_LEVELS = {
  NORMAL: 'normal',
  APPROACHING: 'approaching',
  OVERDUE: 'overdue',
}

const SERVICE_DAY_EARLY_MORNING_CUTOFF = 360
const URGENCY_APPROACHING_RATIO = 0.7

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

export function formatServiceDayMinutesAsTime24(serviceDayMinutes) {
  if (serviceDayMinutes === null || serviceDayMinutes === undefined) return null

  const normalized = ((Math.round(serviceDayMinutes) % 1440) + 1440) % 1440
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function getHostDiningTimerExpectedDurationMinutes(reservation) {
  const purpose = getReservationPurpose(reservation)
  return HOST_DINING_TIMER_DURATION_POLICY_MINUTES[purpose]
    ?? HOST_DINING_TIMER_DURATION_POLICY_MINUTES.dinner
}

export function resolveHostDiningTimerUrgency(elapsedMinutes, expectedDurationMinutes) {
  const elapsed = Math.max(0, Number(elapsedMinutes) || 0)
  const expected = Math.max(1, Number(expectedDurationMinutes) || 0)
  const approachingThreshold = Math.ceil(expected * URGENCY_APPROACHING_RATIO)

  if (elapsed > expected) return HOST_DINING_TIMER_URGENCY_LEVELS.OVERDUE
  if (elapsed >= approachingThreshold) return HOST_DINING_TIMER_URGENCY_LEVELS.APPROACHING
  return HOST_DINING_TIMER_URGENCY_LEVELS.NORMAL
}

export function getReservationEstimatedFreeServiceDayMinutes(reservation) {
  const seatedStartMinutes = toServiceDayMinutes(getReservationTimeValue(reservation))
  if (seatedStartMinutes === null) return null

  return seatedStartMinutes + getHostDiningTimerExpectedDurationMinutes(reservation)
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

export function formatHostDiningTimerEstimatedFreeLabel(estimatedFreeServiceDayMinutes) {
  const timeLabel = formatServiceDayMinutesAsTime24(estimatedFreeServiceDayMinutes)
  if (!timeLabel) return null
  return `Est. free ${timeLabel}`
}

export function formatHostDiningTimerCompactLine(elapsedLabel, estimatedFreeTimeLabel) {
  if (!elapsedLabel || !estimatedFreeTimeLabel) return null
  const timeOnly = estimatedFreeTimeLabel.replace(/^Est\. free\s+/, '')
  return `${elapsedLabel} · ${timeOnly}`
}

export function isHostFloorDiningTimerTable({
  phase = null,
  hostIndicator = null,
} = {}) {
  return phase === FLOOR_TABLE_OPERATIONAL_PHASES.SEATED
    || hostIndicator === 'seated'
}

export function buildHostFloorDiningTimerPresentation(
  reservation,
  {
    phase = null,
    hostIndicator = null,
    nowMinutes = 0,
    todayKey = '',
    isCompact = false,
  } = {},
) {
  if (!reservation || !isHostFloorDiningTimerTable({ phase, hostIndicator })) return null

  const elapsedMinutes = getReservationInServiceElapsedMinutes(
    reservation,
    nowMinutes,
    todayKey,
  )
  if (elapsedMinutes === null) return null

  const elapsedLabel = formatHostDiningTimerLabel(elapsedMinutes)
  if (!elapsedLabel) return null

  const expectedDurationMinutes = getHostDiningTimerExpectedDurationMinutes(reservation)
  const estimatedFreeServiceDayMinutes = getReservationEstimatedFreeServiceDayMinutes(reservation)
  const estimatedFreeLabel = formatHostDiningTimerEstimatedFreeLabel(estimatedFreeServiceDayMinutes)
  if (!estimatedFreeLabel) return null

  const urgency = resolveHostDiningTimerUrgency(elapsedMinutes, expectedDurationMinutes)

  return {
    elapsedLabel,
    estimatedFreeLabel,
    urgency,
    compactLine: isCompact
      ? formatHostDiningTimerCompactLine(elapsedLabel, estimatedFreeLabel)
      : null,
  }
}

export function buildHostFloorDiningTimerLabel(
  reservation,
  options = {},
) {
  const presentation = buildHostFloorDiningTimerPresentation(reservation, options)
  return presentation?.elapsedLabel ?? null
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
