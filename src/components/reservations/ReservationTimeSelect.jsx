import { useEffect, useId, useMemo, useRef, useState } from 'react'
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
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const normalizedValue = normalizeReservationTimeValue(value)
  const options = useMemo(
    () => getReservationTimeSelectOptions(normalizedValue),
    [normalizedValue],
  )
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const handleSelect = (time) => {
    onChange(normalizeReservationTimeValue(time))
    setIsOpen(false)
  }

  return (
    <div className={`reservation-time-select-root${isOpen ? ' is-open' : ''}`} ref={rootRef}>
      <button
        id={fieldId}
        type="button"
        className={`${className} reservation-time-select-trigger`}
        onClick={() => setIsOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={normalizedValue ? '' : 'reservation-time-select-placeholder'}>
          {normalizedValue || placeholder}
        </span>
        <span className="reservation-time-select-chevron" aria-hidden="true">▾</span>
      </button>

      {isOpen ? (
        <ul className="reservation-time-select-menu" role="listbox" aria-labelledby={fieldId}>
          {!normalizedValue ? (
            <li role="presentation">
              <button
                type="button"
                className="reservation-time-select-option is-placeholder"
                onClick={() => handleSelect('')}
              >
                {placeholder}
              </button>
            </li>
          ) : null}
          {options.map((time) => (
            <li key={time} role="presentation">
              <button
                type="button"
                role="option"
                className={`reservation-time-select-option${time === normalizedValue ? ' is-selected' : ''}`}
                aria-selected={time === normalizedValue}
                onClick={() => handleSelect(time)}
              >
                {time}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {required ? (
        <input
          tabIndex={-1}
          aria-hidden="true"
          className="reservation-time-select-hidden"
          value={normalizedValue}
          onChange={() => {}}
          required
        />
      ) : null}
    </div>
  )
}
