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
import { t } from '../../i18n/i18n'

export function ReservationTimeSelect({
  value,
  onChange,
  required = false,
  className = 'reservation-time-select',
  id,
  placeholder = t("Select time"),
  seating = null,
  seatings = null,
  dateKey = '',
}) {
  const normalizedValue = normalizeReservationTimeValue(value)

  const options = useMemo(() => {
    const normalizedSeating = normalizeReservationSeating(seating) ?? seating
    const windowSeatings = Array.isArray(seatings) && seatings.length
      ? seatings
      : (normalizedSeating ? [normalizedSeating] : [])
    if (windowSeatings.length) {
      const windowOptions = [...new Set(windowSeatings.flatMap((item) => (
        getSeatingWindowTimeOptions(item, { dateKey })
      )))].sort((left, right) => left.localeCompare(right))
      if (normalizedValue && !windowOptions.includes(normalizedValue)) {
        return [...windowOptions, normalizedValue].sort(
          (left, right) => left.localeCompare(right),
        )
      }
      return windowOptions
    }

    return getReservationTimeSelectOptions(normalizedValue)
  }, [dateKey, normalizedValue, seating, seatings])

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
