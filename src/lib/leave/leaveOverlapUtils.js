import { LEAVE_STATUS } from './leaveConstants'
import { normalizeLeaveDateKey, readLeaveEndDate, readLeaveStartDate, readLeaveStatus } from './leaveDateUtils'

const OVERLAP_STATUSES = new Set([
  LEAVE_STATUS.PENDING,
  LEAVE_STATUS.APPROVED,
])

/**
 * Returns true when two inclusive calendar date ranges overlap.
 */
export function doLeaveDateRangesOverlap(startA, endA, startB, endB) {
  const normalizedStartA = normalizeLeaveDateKey(startA)
  const normalizedEndA = normalizeLeaveDateKey(endA)
  const normalizedStartB = normalizeLeaveDateKey(startB)
  const normalizedEndB = normalizeLeaveDateKey(endB)

  if (!normalizedStartA || !normalizedEndA || !normalizedStartB || !normalizedEndB) {
    return false
  }

  return normalizedStartA <= normalizedEndB && normalizedStartB <= normalizedEndA
}

function isOverlapParticipant(leave) {
  if (!leave || typeof leave !== 'object') return false
  return OVERLAP_STATUSES.has(readLeaveStatus(leave))
}

/**
 * Returns true when candidate range overlaps any existing pending or approved leave.
 * Rejected and cancelled records are ignored.
 */
export function hasLeaveOverlap(existingLeaves = [], candidate = {}, {
  excludeLeaveId = null,
} = {}) {
  const candidateStart = readLeaveStartDate(candidate)
  const candidateEnd = readLeaveEndDate(candidate)

  if (!candidateStart || !candidateEnd) {
    return false
  }

  const candidateId = `${candidate?.id ?? ''}`.trim()

  return (existingLeaves ?? []).some((leave) => {
    if (!isOverlapParticipant(leave)) return false

    const leaveId = `${leave?.id ?? ''}`.trim()
    if (excludeLeaveId && leaveId && String(leaveId) === String(excludeLeaveId)) {
      return false
    }

    if (candidateId && leaveId && candidateId === leaveId) {
      return false
    }

    return doLeaveDateRangesOverlap(
      candidateStart,
      candidateEnd,
      readLeaveStartDate(leave),
      readLeaveEndDate(leave),
    )
  })
}
