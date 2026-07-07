import { useMemo } from 'react'
import { TimeSelect } from '../TimeSelect'
import {
  getReservationTimeSelectOptions,
  normalizeReservationTimeValue,
} from '../../lib/timeFormatUtils'

export function ReservationTimeSelect({
  value,
  onChange,
  required = false,
  className = 'reservation-time-select',
  id,
  placeholder = 'Select time',
}) {
  const normalizedValue = normalizeReservationTimeValue(value)
  const options = useMemo(
    () => getReservationTimeSelectOptions(normalizedValue),
    [normalizedValue],
  )

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
