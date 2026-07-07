import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  getTimeSelectOptions,
  normalizeTimeValue,
  snapTimeToQuarter,
} from '../lib/timeFormatUtils'

export function TimeSelect({
  value,
  onChange,
  options: optionsProp,
  required = false,
  className = 'time-select',
  id,
  placeholder = 'Select time',
  disabled = false,
}) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const normalizedValue = snapTimeToQuarter(normalizeTimeValue(value))
  const options = useMemo(() => {
    if (optionsProp) return optionsProp
    return getTimeSelectOptions(normalizedValue)
  }, [optionsProp, normalizedValue])
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

  useEffect(() => {
    if (disabled) {
      setIsOpen(false)
    }
  }, [disabled])

  const handleSelect = (time) => {
    onChange(snapTimeToQuarter(normalizeTimeValue(time)))
    setIsOpen(false)
  }

  const prefix = className

  return (
    <div className={`${prefix}-root${isOpen ? ' is-open' : ''}`} ref={rootRef}>
      <button
        id={fieldId}
        type="button"
        className={`${prefix}-trigger`}
        onClick={() => {
          if (disabled) return
          setIsOpen((current) => !current)
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
      >
        <span className={normalizedValue ? '' : `${prefix}-placeholder`}>
          {normalizedValue || placeholder}
        </span>
        <span className={`${prefix}-chevron`} aria-hidden="true">▾</span>
      </button>

      {isOpen ? (
        <ul className={`${prefix}-menu`} role="listbox" aria-labelledby={fieldId}>
          {!required ? (
            <li role="presentation">
              <button
                type="button"
                className={`${prefix}-option is-placeholder${!normalizedValue ? ' is-selected' : ''}`}
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
                className={`${prefix}-option${time === normalizedValue ? ' is-selected' : ''}`}
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
          className={`${prefix}-hidden`}
          value={normalizedValue}
          onChange={() => {}}
          required
        />
      ) : null}
    </div>
  )
}
