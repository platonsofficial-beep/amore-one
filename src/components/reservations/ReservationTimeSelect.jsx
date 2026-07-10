import { useMemo } from 'react'
import { TimeSelect } from '../TimeSelect'
import {
  getReservationTimeSelectOptions,
  normalizeReservationTimeValue,
} from '../../lib/timeFormatUtils'
import {
  getSeatingWindowTimeOptions,
  normalizeReservationSeating,
} from '../../lib/reservationSeatings'

export function ReservationTimeSelect({
  value,
  onChange,
  required = false,
  className = 'reservation-time-select',
  id,
  placeholder = 'Select time',
  seating = null,
}) {
  const normalizedValue = normalizeReservationTimeValue(value)
  const normalizedSeating = normalizeReservationSeating(seating) ?? seating

  const options = useMemo(() => {
    if (normalizedSeating) {
      const windowOptions = getSeatingWindowTimeOptions(normalizedSeating)
      if (normalizedValue && !windowOptions.includes(normalizedValue)) {
        return [...windowOptions, normalizedValue].sort(
          (left, right) => left.localeCompare(right),
        )
      }
      return windowOptions
    }

    return getReservationTimeSelectOptions(normalizedValue)
  }, [normalizedSeating, normalizedValue])

  return (
    <TimeSelect
      id={id}
      value={normalizedValue}
      onChange={(time) => onChange(normalizeReservationTimeValue(time))}
      options={options}
      required={required}
      className={className}
      placeholder={placeholder}
    />
  )
}
