import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import {
  DEFAULT_RESERVATION_PHONE_COUNTRY_CODE,
  formatReservationPhone,
  getWorkspaceDefaultPhoneCountryCode,
  parseReservationPhone,
  resolveWorkspaceDefaultPhoneCountryCode,
  subscribeWorkspaceDefaultPhoneCountryCode,
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
  workspaceProfile = null,
}) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const storedDefault = useSyncExternalStore(
    subscribeWorkspaceDefaultPhoneCountryCode,
    getWorkspaceDefaultPhoneCountryCode,
    getWorkspaceDefaultPhoneCountryCode,
  )
  const fallbackCode = workspaceProfile
    ? resolveWorkspaceDefaultPhoneCountryCode(workspaceProfile)
    : (storedDefault || DEFAULT_RESERVATION_PHONE_COUNTRY_CODE)
  const parsed = parseReservationPhone(value, { fallbackCode })
  const [countryCode, setCountryCode] = useState(parsed.countryCode)
  const [localNumber, setLocalNumber] = useState(parsed.localNumber)
  const countryOverriddenRef = useRef(false)

  useEffect(() => {
    const next = parseReservationPhone(value, { fallbackCode })
    if (next.localNumber) {
      countryOverriddenRef.current = false
      setCountryCode(next.countryCode)
      setLocalNumber(next.localNumber)
      return
    }

    setLocalNumber('')
    if (!countryOverriddenRef.current) {
      setCountryCode(next.countryCode)
    }
  }, [value, fallbackCode])

  const emitChange = (nextCode, nextLocal) => {
    onChange?.(formatReservationPhone(nextCode, nextLocal))
  }

  const handleCountryChange = (nextCode) => {
    countryOverriddenRef.current = true
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
