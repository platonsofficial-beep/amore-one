import { FLOOR_TABLE_OPERATIONAL_PHASES } from './floorTableOperationalState'
import { getConflictingUnitIds } from './reservationTableOptions'
import { resolveSeatingFloorStatus } from './tableAvailability'
import { isTerminalReservationStatus } from './reservationHostStatus'
import {
  getReservationAssignedUnitsForMatching,
  seatingUnitMatchesFloorUnit,
} from './seatingAssignment'
import {
  findAllReservationsForTableSeating,
  resolveTableDayViewRowState,
} from './tableDayView'
import { reservationMatchesTableDayViewSeating } from './reservationSeatings'
import { resolveHostFloorReservationRecord } from './hostFloorReservationState'

export const HOST_FLOOR_VISUAL_STATE_PRIORITY = [
  'has-conflict',
  'is-seated',
  'is-arrived',
  'is-reserved',
  'is-available',
]

const PROBLEM_HOST_INDICATORS = new Set(['problem', 'cleaning'])

export function resolveHostFloorSemanticClass(operational, { hasSeatingConflict = false } = {}) {
  if (hasSeatingConflict || PROBLEM_HOST_INDICATORS.has(operational?.hostIndicator)) {
    return 'has-conflict'
  }

  const hostIndicator = operational?.hostIndicator ?? 'empty'
  const phase = operational?.phase

  if (hostIndicator === 'seated' || phase === 'seated') return 'is-seated'
  if (hostIndicator === 'waiting' || phase === 'waiting') return 'is-arrived'
  if (hostIndicator === 'confirmed' || phase === 'upcoming') return 'is-reserved'

  return 'is-available'
}

export function resolveHostFloorVisualPresentation(
  operational,
  { hasSeatingConflict = false, isMultiLinked = false } = {},
) {
  const semanticClass = resolveHostFloorSemanticClass(operational, { hasSeatingConflict })
  const hostIndicator = operational?.hostIndicator ?? 'empty'

  let statusToken = 'available'
  if (semanticClass === 'has-conflict') statusToken = 'problem'
  else if (semanticClass === 'is-seated' || semanticClass === 'is-arrived') statusToken = 'seated'
  else if (semanticClass === 'is-reserved') statusToken = 'reserved'

  return {
    semanticClass,
    hostIndicatorClass: `host-indicator-${hostIndicator}`,
    statusToken,
    isCombined: Boolean(isMultiLinked),
  }
}

export function resolveHostFloorTableStatusClass(
  operational,
  { hasSeatingConflict = false, isMultiLinked = false } = {},
) {
  const presentation = resolveHostFloorVisualPresentation(operational, {
    hasSeatingConflict,
    isMultiLinked,
  })

  return `${presentation.hostIndicatorClass} ${presentation.semanticClass}`.trim()
}

export function applyHostFloorSelectedSeatingContext(
  tableStates,
  {
    selectedSeating,
    enrichedReservations,
    todayKey,
    seatingsById,
    layout,
    selectedReservation = null,
  },
) {
  if (!selectedSeating) return tableStates

  const selectedReservationRecord = resolveHostFloorReservationRecord(
    selectedReservation,
    enrichedReservations,
  )

  const seatingsList = seatingsById.size > 0
    ? [...seatingsById.values()]
    : [selectedSeating]

  const seatingConflicts = getConflictingUnitIds(
    enrichedReservations,
    todayKey,
    selectedSeating.startTime,
    {
      seatingId: selectedSeating.id,
      durationMinutes: selectedSeating.durationMinutes,
      seatingsById,
      layout,
    },
  )

  return tableStates.map((tableState) => {
    const seatingMatches = findAllReservationsForTableSeating(
      enrichedReservations,
      tableState.table,
      todayKey,
      selectedSeating,
      { layout, seatingsById },
    )
    const hasSeatingConflict = seatingMatches.length > 1

    if (hasSeatingConflict) {
      const rowState = resolveTableDayViewRowState(null, { hasConflict: true })
      return {
        ...tableState,
        reservation: null,
        status: rowState.state,
        operational: {
          ...tableState.operational,
          phase: FLOOR_TABLE_OPERATIONAL_PHASES.AVAILABLE,
          hostIndicator: rowState.hostIndicator,
          floorStatus: rowState.state,
          displayReservation: null,
          activeReservation: null,
          hasSeatingConflict: true,
        },
      }
    }

    const conflict = seatingConflicts.get(tableState.table.id)
    const isSelectedTable = selectedReservationRecord
      && getReservationAssignedUnitsForMatching(selectedReservationRecord).some((unit) => (
        seatingUnitMatchesFloorUnit(unit, tableState.table)
      ))
    const selectedReservationMatchesSeating = selectedReservationRecord
      ? reservationMatchesTableDayViewSeating(
        selectedReservationRecord,
        selectedSeating,
        todayKey,
        seatingsList,
      )
      : false

    if (isSelectedTable && selectedReservationMatchesSeating) {
      if (isTerminalReservationStatus(selectedReservationRecord?.status)) {
        return {
          ...tableState,
          reservation: null,
          status: 'available',
          operational: {
            ...tableState.operational,
            phase: FLOOR_TABLE_OPERATIONAL_PHASES.AVAILABLE,
            hostIndicator: 'empty',
            floorStatus: 'available',
            displayReservation: null,
            activeReservation: null,
            hasSeatingConflict: false,
          },
        }
      }

      const seatingStatus = resolveSeatingFloorStatus(conflict, selectedReservationRecord)
      const preserveOccupied = seatingStatus.hostIndicator === 'seated'
        || seatingStatus.hostIndicator === 'waiting'
      const nextPhase = preserveOccupied
        ? (seatingStatus.hostIndicator === 'seated'
          ? FLOOR_TABLE_OPERATIONAL_PHASES.SEATED
          : FLOOR_TABLE_OPERATIONAL_PHASES.WAITING)
        : FLOOR_TABLE_OPERATIONAL_PHASES.UPCOMING

      return {
        ...tableState,
        reservation: selectedReservationRecord,
        status: preserveOccupied ? seatingStatus.floorStatus : 'selected',
        operational: {
          ...tableState.operational,
          phase: nextPhase,
          hostIndicator: preserveOccupied ? seatingStatus.hostIndicator : 'confirmed',
          floorStatus: preserveOccupied ? seatingStatus.floorStatus : 'selected',
          displayReservation: selectedReservationRecord,
          activeReservation: selectedReservationRecord,
          hasSeatingConflict: false,
        },
      }
    }

    if (!conflict) {
      return {
        ...tableState,
        reservation: null,
        status: 'available',
        operational: {
          ...tableState.operational,
          phase: FLOOR_TABLE_OPERATIONAL_PHASES.AVAILABLE,
          hostIndicator: 'empty',
          floorStatus: 'available',
          displayReservation: null,
          activeReservation: null,
          hasSeatingConflict: false,
        },
      }
    }

    const conflictReservation = enrichedReservations.find((entry) => (
      String(entry.id) === String(conflict.reservationId)
    )) ?? tableState.reservation
    const seatingStatus = resolveSeatingFloorStatus(conflict, conflictReservation)
    const nextPhase = seatingStatus.hostIndicator === 'seated'
      ? FLOOR_TABLE_OPERATIONAL_PHASES.SEATED
      : seatingStatus.hostIndicator === 'waiting'
        ? FLOOR_TABLE_OPERATIONAL_PHASES.WAITING
        : FLOOR_TABLE_OPERATIONAL_PHASES.UPCOMING

    return {
      ...tableState,
      reservation: conflictReservation ?? tableState.reservation,
      status: seatingStatus.floorStatus,
      operational: {
        ...tableState.operational,
        phase: nextPhase,
        hostIndicator: seatingStatus.hostIndicator,
        floorStatus: seatingStatus.floorStatus,
        displayReservation: conflictReservation ?? tableState.operational?.displayReservation,
        hasSeatingConflict: false,
      },
    }
  })
}
