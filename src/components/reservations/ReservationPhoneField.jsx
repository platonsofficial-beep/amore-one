import { useEffect, useId, useState } from 'react'
import {
  DEFAULT_RESERVATION_PHONE_COUNTRY_CODE,
  formatReservationPhone,
  parseReservationPhone,
  RESERVATION_PHONE_COUNTRIES,
} from '../../lib/reservationPhoneUtils'

export function ReservationPhoneField({
  value = '',
  onChange,
  disabled = false,
  className = 'reservation-phone-field',
  inputClassName = '',
  selectClassName = '',
  id,
  placeholder = 'Local number',
  autoComplete = 'tel-national',
}) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const parsed = parseReservationPhone(value)
  const [countryCode, setCountryCode] = useState(parsed.countryCode || DEFAULT_RESERVATION_PHONE_COUNTRY_CODE)
  const [localNumber, setLocalNumber] = useState(parsed.localNumber)

  useEffect(() => {
    const next = parseReservationPhone(value)
    setCountryCode(next.countryCode || DEFAULT_RESERVATION_PHONE_COUNTRY_CODE)
    setLocalNumber(next.localNumber)
  }, [value])

  const emitChange = (nextCode, nextLocal) => {
    onChange?.(formatReservationPhone(nextCode, nextLocal))
  }

  const handleCountryChange = (event) => {
    const nextCode = event.target.value
    setCountryCode(nextCode)
    emitChange(nextCode, localNumber)
  }

  const handleLocalChange = (event) => {
    const nextLocal = event.target.value.replace(/[^\d\s()-]/g, '')
    setLocalNumber(nextLocal)
    emitChange(countryCode, nextLocal)
  }

  return (
    <div className={className}>
      <select
        className={`${className}-country ${selectClassName}`.trim()}
        value={countryCode}
        onChange={handleCountryChange}
        disabled={disabled}
        aria-label="Phone country code"
      >
        {RESERVATION_PHONE_COUNTRIES.map((country) => (
          <option key={country.code} value={country.code}>
            {country.shortLabel} {country.code}
          </option>
        ))}
      </select>
      <input
        id={fieldId}
        type="tel"
        className={`${className}-input ${inputClassName}`.trim()}
        value={localNumber}
        onChange={handleLocalChange}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        inputMode="tel"
      />
    </div>
  )
}
