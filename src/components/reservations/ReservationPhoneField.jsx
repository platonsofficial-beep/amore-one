import { useEffect, useId, useState } from 'react'
import {
  formatReservationPhone,
  getDefaultReservationPhoneCountryCode,
  parseReservationPhone,
} from '../../lib/reservationPhoneUtils'
import { PhoneCountryPicker } from './PhoneCountryPicker'

export function ReservationPhoneField({
  value = '',
  onChange,
  disabled = false,
  className = 'reservation-phone-field',
  inputClassName = '',
  id,
  placeholder = 'Local number',
  autoComplete = 'tel-national',
}) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const parsed = parseReservationPhone(value, { fallbackCode: getDefaultReservationPhoneCountryCode() })
  const [countryCode, setCountryCode] = useState(parsed.countryCode)
  const [localNumber, setLocalNumber] = useState(parsed.localNumber)

  useEffect(() => {
    const next = parseReservationPhone(value, { fallbackCode: getDefaultReservationPhoneCountryCode() })
    setCountryCode(next.countryCode)
    setLocalNumber(next.localNumber)
  }, [value])

  const emitChange = (nextCode, nextLocal) => {
    onChange?.(formatReservationPhone(nextCode, nextLocal))
  }

  const handleCountryChange = (nextCode) => {
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
      <PhoneCountryPicker
        className={`${className}-country-picker`}
        value={countryCode}
        onChange={handleCountryChange}
        disabled={disabled}
      />
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
