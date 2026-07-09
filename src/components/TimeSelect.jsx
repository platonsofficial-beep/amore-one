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
  const suppressToggleRef = useRef(false)

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    if (disabled) {
      setIsOpen(false)
    }
  }, [disabled])

  const handleSelect = (time) => {
    onChange(snapTimeToQuarter(normalizeTimeValue(time)))
    suppressToggleRef.current = true
    setIsOpen(false)
    window.requestAnimationFrame(() => {
      suppressToggleRef.current = false
    })
  }

  const prefix = className

  return (
    <div className={`${prefix}-root${isOpen ? ' is-open' : ''}`} ref={rootRef}>
      <button
        id={fieldId}
        type="button"
        className={`${prefix}-trigger`}
        onClick={() => {
          if (disabled || suppressToggleRef.current) return
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
        <ul
          className={`${prefix}-menu`}
          role="listbox"
          aria-labelledby={fieldId}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {!required ? (
            <li role="presentation">
              <button
                type="button"
                className={`${prefix}-option is-placeholder${!normalizedValue ? ' is-selected' : ''}`}
                onPointerDown={(event) => {
                  event.preventDefault()
                  handleSelect('')
                }}
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
                onPointerDown={(event) => {
                  event.preventDefault()
                  handleSelect(time)
                }}
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
