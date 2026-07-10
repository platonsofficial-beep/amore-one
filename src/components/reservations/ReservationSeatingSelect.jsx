import { useMemo } from 'react'
import {
  CUSTOM_SEATING_VALUE,
  formatSeatingChipLabel,
  getActiveSeatingsForDate,
  matchReservationTimeToSeating,
} from '../../lib/reservationSeatings'

export function ReservationSeatingSelect({
  seatings = [],
  dateKey,
  seatingId = null,
  timeValue = '',
  onSeatingChange,
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
  }

  return (
    <label className={className}>
      <span>Seating</span>
      <select value={selectedValue} onChange={handleChange} required={required}>
        <option value="" disabled={required}>Select seating</option>
        {activeSeatings.map((seating) => (
          <option key={seating.id} value={seating.id}>
            {formatSeatingChipLabel(seating)}
          </option>
        ))}
        <option value={CUSTOM_SEATING_VALUE}>Custom time</option>
      </select>
      {selectedValue === CUSTOM_SEATING_VALUE ? (
        <small className="reservation-seating-select-hint">Choose a custom exact time below.</small>
      ) : (
        <small className="reservation-seating-select-hint">Exact reservation time is set separately below.</small>
      )}
    </label>
  )
}

export function resolveSeatingSelection({ seatingId, time, date, seatings = [] }) {
  if (seatingId) {
    const seating = seatings.find((entry) => entry.id === seatingId) ?? null
    return {
      seatingId: seating?.id ?? seatingId,
      time,
      isCustom: false,
    }
  }

  const matched = matchReservationTimeToSeating(time, date, seatings)
  if (matched) {
    return {
      seatingId: matched.id,
      time,
      isCustom: false,
    }
  }

  return {
    seatingId: null,
    time,
    isCustom: Boolean(time),
  }
}

export { formatSeatingChipLabel as formatSeatingOptionLabel }
