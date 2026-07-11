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
import { resolveHostFloorReservationRecord } from './hostFloorReservationState'

export const HOST_FLOOR_VISUAL_STATE_PRIORITY = [
  'has-conflict',
  'is-seated',
  'is-arrived',
  'is-reserved',
  'is-available',
]

const CONFLICT_HOST_INDICATORS = new Set(['problem', 'cleaning', 'late'])

export function resolveHostFloorSemanticClass(operational, { hasSeatingConflict = false } = {}) {
  if (hasSeatingConflict || CONFLICT_HOST_INDICATORS.has(operational?.hostIndicator)) {
    return 'has-conflict'
  }

  const hostIndicator = operational?.hostIndicator ?? 'empty'
  const phase = operational?.phase

  if (hostIndicator === 'seated' || phase === 'seated') return 'is-seated'
  if (hostIndicator === 'waiting' || phase === 'waiting') return 'is-arrived'
  if (hostIndicator === 'confirmed' || phase === 'upcoming') return 'is-reserved'

  return 'is-available'
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

    if (isSelectedTable) {
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
