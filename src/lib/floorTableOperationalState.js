import { parseTimeToMinutes } from './shiftHoursUtils'
import {
  isReservationInHouse,
  isReservationLateByTime,
  normalizeReservationStatus,
  reservationOccupiesFloorTables,
} from './reservationHostStatus'
import { formatTime24 } from './timeFormatUtils'

const SERVICE_DAY_EARLY_MORNING_CUTOFF = 360

export const FLOOR_TABLE_OPERATIONAL_PHASES = {
  AVAILABLE: 'available',
  UPCOMING: 'upcoming',
  WAITING: 'waiting',
  SEATED: 'seated',
  CLEANING: 'cleaning',
}

const SEATED_STATUS_IDS = new Set(['Checked In', 'Walk In', 'Checked In (Partial)'])
const UPCOMING_STATUS_IDS = new Set(['Pending', 'Waiting', 'Not Confirmed', 'Confirmed', 'Late Booking'])
const WAITING_STATUS_IDS = new Set(['Waiting'])

function toServiceDayMinutes(timeValue) {
  const minutes = parseTimeToMinutes(timeValue)
  if (minutes === null) return null
  return minutes < SERVICE_DAY_EARLY_MORNING_CUTOFF ? minutes + 1440 : minutes
}

function toServiceDayNowMinutes(nowMinutes) {
  if (nowMinutes === null || nowMinutes === undefined) return null
  return nowMinutes < SERVICE_DAY_EARLY_MORNING_CUTOFF
    ? nowMinutes + 1440
    : nowMinutes
}

export function getReservationOperationalPhase(reservation, nowMinutes, todayKey) {
  if (!reservation) return FLOOR_TABLE_OPERATIONAL_PHASES.AVAILABLE

  const status = normalizeReservationStatus(reservation.status)
  if (!reservationOccupiesFloorTables(status)) {
    return FLOOR_TABLE_OPERATIONAL_PHASES.AVAILABLE
  }

  if (SEATED_STATUS_IDS.has(status) || isReservationInHouse(reservation)) {
    return FLOOR_TABLE_OPERATIONAL_PHASES.SEATED
  }

  if (WAITING_STATUS_IDS.has(status)) {
    return FLOOR_TABLE_OPERATIONAL_PHASES.WAITING
  }

  const arrivalMinutes = toServiceDayMinutes(reservation.time)
  const nowKey = toServiceDayNowMinutes(nowMinutes)

  if (UPCOMING_STATUS_IDS.has(status)) {
    if (nowKey !== null && arrivalMinutes !== null && arrivalMinutes > nowKey) {
      return FLOOR_TABLE_OPERATIONAL_PHASES.UPCOMING
    }

    if (
      isReservationLateByTime(reservation, nowMinutes, todayKey)
      || status === 'Late Booking'
      || (nowKey !== null && arrivalMinutes !== null && arrivalMinutes <= nowKey)
    ) {
      return FLOOR_TABLE_OPERATIONAL_PHASES.WAITING
    }

    return FLOOR_TABLE_OPERATIONAL_PHASES.UPCOMING
  }

  return FLOOR_TABLE_OPERATIONAL_PHASES.AVAILABLE
}

const PHASE_PRIORITY = {
  [FLOOR_TABLE_OPERATIONAL_PHASES.CLEANING]: 5,
  [FLOOR_TABLE_OPERATIONAL_PHASES.SEATED]: 4,
  [FLOOR_TABLE_OPERATIONAL_PHASES.WAITING]: 3,
  [FLOOR_TABLE_OPERATIONAL_PHASES.UPCOMING]: 2,
  [FLOOR_TABLE_OPERATIONAL_PHASES.AVAILABLE]: 1,
}

function pickNextUpcomingReservation(reservations, nowMinutes) {
  const nowKey = toServiceDayNowMinutes(nowMinutes)
  if (nowKey === null) return reservations[0] ?? null

  const upcoming = reservations
    .map((reservation) => ({
      reservation,
      start: toServiceDayMinutes(reservation.time),
      phase: getReservationOperationalPhase(reservation, nowMinutes),
    }))
    .filter(({ start, phase }) => (
      phase === FLOOR_TABLE_OPERATIONAL_PHASES.UPCOMING
      && start !== null
      && start >= nowKey
    ))
    .sort((left, right) => left.start - right.start)

  return upcoming[0]?.reservation ?? null
}

function pickActiveReservation(reservations, nowMinutes, todayKey) {
  const seated = reservations.find((reservation) => (
    getReservationOperationalPhase(reservation, nowMinutes, todayKey)
      === FLOOR_TABLE_OPERATIONAL_PHASES.SEATED
  ))
  if (seated) return seated

  return reservations.find((reservation) => (
    getReservationOperationalPhase(reservation, nowMinutes, todayKey)
      === FLOOR_TABLE_OPERATIONAL_PHASES.WAITING
  )) ?? null
}

export function resolveFloorTableOperationalState(
  reservations = [],
  nowMinutes,
  todayKey,
  { needsCleaning = false } = {},
) {
  if (needsCleaning) {
    return {
      phase: FLOOR_TABLE_OPERATIONAL_PHASES.CLEANING,
      hostIndicator: 'cleaning',
      floorStatus: 'cleaning',
      displayReservation: null,
      activeReservation: null,
      nextReservation: null,
      nextReservationTime: null,
      reservationCount: reservations.length,
      upcomingCount: 0,
    }
  }

  if (!reservations.length) {
    return {
      phase: FLOOR_TABLE_OPERATIONAL_PHASES.AVAILABLE,
      hostIndicator: 'empty',
      floorStatus: 'available',
      displayReservation: null,
      activeReservation: null,
      nextReservation: null,
      nextReservationTime: null,
      reservationCount: 0,
      upcomingCount: 0,
    }
  }

  const phases = reservations.map((reservation) => ({
    reservation,
    phase: getReservationOperationalPhase(reservation, nowMinutes, todayKey),
  }))

  const tablePhase = phases.reduce((current, entry) => (
    PHASE_PRIORITY[entry.phase] > PHASE_PRIORITY[current]
      ? entry.phase
      : current
  ), FLOOR_TABLE_OPERATIONAL_PHASES.AVAILABLE)

  const activeReservation = pickActiveReservation(reservations, nowMinutes, todayKey)
  const nextReservation = pickNextUpcomingReservation(reservations, nowMinutes)
  const nextReservationTime = nextReservation ? formatTime24(nextReservation.time) : null
  const upcomingCount = phases.filter(({ phase }) => phase === FLOOR_TABLE_OPERATIONAL_PHASES.UPCOMING).length

  let hostIndicator = 'empty'
  let floorStatus = 'available'
  let displayReservation = null

  switch (tablePhase) {
    case FLOOR_TABLE_OPERATIONAL_PHASES.SEATED:
      hostIndicator = 'seated'
      floorStatus = 'seated'
      displayReservation = activeReservation
      break
    case FLOOR_TABLE_OPERATIONAL_PHASES.WAITING:
      hostIndicator = 'waiting'
      floorStatus = 'arrived'
      displayReservation = activeReservation
      break
    case FLOOR_TABLE_OPERATIONAL_PHASES.UPCOMING:
      hostIndicator = 'confirmed'
      floorStatus = 'upcoming'
      displayReservation = nextReservation
      break
    default:
      hostIndicator = 'empty'
      floorStatus = 'available'
      displayReservation = null
      break
  }

  return {
    phase: tablePhase,
    hostIndicator,
    floorStatus,
    displayReservation,
    activeReservation,
    nextReservation,
    nextReservationTime,
    reservationCount: reservations.length,
    upcomingCount,
  }
}

export function getScheduleEntryActionKind(reservation, nowMinutes, todayKey) {
  const phase = getReservationOperationalPhase(reservation, nowMinutes, todayKey)
  if (phase === FLOOR_TABLE_OPERATIONAL_PHASES.SEATED) return 'seated'
  if (
    phase === FLOOR_TABLE_OPERATIONAL_PHASES.UPCOMING
    || phase === FLOOR_TABLE_OPERATIONAL_PHASES.WAITING
  ) {
    return 'upcoming'
  }
  return 'none'
}

export function isFloorTablePhysicallyOccupied(operationalState) {
  if (!operationalState) return false
  return operationalState.phase === FLOOR_TABLE_OPERATIONAL_PHASES.SEATED
    || operationalState.phase === FLOOR_TABLE_OPERATIONAL_PHASES.WAITING
    || operationalState.phase === FLOOR_TABLE_OPERATIONAL_PHASES.CLEANING
}
