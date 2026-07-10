import { useMemo } from 'react'
import {
  CUSTOM_SEATING_VALUE,
  getActiveSeatingsForDate,
  matchReservationTimeToSeating,
  normalizeReservationSeating,
} from '../../lib/reservationSeatings'
import { formatTime24 } from '../../lib/timeFormatUtils'

export function ReservationSeatingSelect({
  seatings = [],
  dateKey,
  seatingId = null,
  timeValue = '',
  onSeatingChange,
  onTimeChange,
  required = false,
  className = 'reservation-seating-select',
}) {
  const activeSeatings = useMemo(
    () => getActiveSeatingsForDate(seatings, dateKey),
    [dateKey, seatings],
  )

  const selectedValue = seatingId || (
    timeValue && !matchReservationTimeToSeating(timeValue, dateKey, seatings)
      ? CUSTOM_SEATING_VALUE
      : (matchReservationTimeToSeating(timeValue, dateKey, seatings)?.id ?? '')
  )

  const handleChange = (event) => {
    const nextValue = event.target.value

    if (nextValue === CUSTOM_SEATING_VALUE) {
      onSeatingChange?.(null, { isCustom: true })
      return
    }

    const seating = activeSeatings.find((entry) => entry.id === nextValue) ?? null
    onSeatingChange?.(seating?.id ?? null, { seating, isCustom: false })
    if (seating?.startTime) {
      onTimeChange?.(seating.startTime)
    }
  }

  return (
    <label className={className}>
      <span>Seating</span>
      <select value={selectedValue} onChange={handleChange} required={required}>
        <option value="" disabled={required}>Select seating</option>
        {activeSeatings.map((seating) => (
          <option key={seating.id} value={seating.id}>
            {seating.name} — {formatTime24(seating.startTime)}
          </option>
        ))}
        <option value={CUSTOM_SEATING_VALUE}>Custom time</option>
      </select>
      {selectedValue === CUSTOM_SEATING_VALUE ? (
        <small className="reservation-seating-select-hint">Choose a custom time below.</small>
      ) : null}
    </label>
  )
}

export function resolveSeatingSelection({ seatingId, time, date, seatings = [] }) {
  if (seatingId) {
    const seating = seatings.find((entry) => entry.id === seatingId) ?? null
    return {
      seatingId: seating?.id ?? seatingId,
      time: seating?.startTime ?? time,
      isCustom: false,
    }
  }

  const matched = matchReservationTimeToSeating(time, date, seatings)
  if (matched) {
    return {
      seatingId: matched.id,
      time: matched.startTime,
      isCustom: false,
    }
  }

  return {
    seatingId: null,
    time,
    isCustom: Boolean(time),
  }
}

export function formatSeatingOptionLabel(seating) {
  const normalized = normalizeReservationSeating(seating)
  if (!normalized) return ''
  return `${normalized.name} — ${formatTime24(normalized.startTime)}`
}
