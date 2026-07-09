import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  getTimeSelectOptions,
  normalizeTimeValue,
  snapTimeToQuarter,
} from '../lib/timeFormatUtils'

const SCROLL_GESTURE_THRESHOLD_PX = 8

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
  const menuRef = useRef(null)
  const suppressToggleRef = useRef(false)
  const pointerGestureRef = useRef({ active: false, moved: false, x: 0, y: 0 })

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

  const resetPointerGesture = () => {
    pointerGestureRef.current = {
      active: false,
      moved: false,
      x: 0,
      y: 0,
    }
  }

  const handleMenuPointerDown = (event) => {
    pointerGestureRef.current = {
      active: true,
      moved: false,
      x: event.clientX,
      y: event.clientY,
    }
  }

  const handleMenuPointerMove = (event) => {
    const gesture = pointerGestureRef.current
    if (!gesture.active) return

    const deltaX = Math.abs(event.clientX - gesture.x)
    const deltaY = Math.abs(event.clientY - gesture.y)
    if (deltaX > SCROLL_GESTURE_THRESHOLD_PX || deltaY > SCROLL_GESTURE_THRESHOLD_PX) {
      gesture.moved = true
    }
  }

  const handleOptionClick = (event, time) => {
    if (pointerGestureRef.current.moved) {
      resetPointerGesture()
      return
    }

    event.stopPropagation()
    resetPointerGesture()
    handleSelect(time)
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
          ref={menuRef}
          className={`${prefix}-menu`}
          role="listbox"
          aria-labelledby={fieldId}
          onPointerDown={handleMenuPointerDown}
          onPointerMove={handleMenuPointerMove}
          onPointerUp={resetPointerGesture}
          onPointerCancel={resetPointerGesture}
        >
          {!required ? (
            <li role="presentation">
              <button
                type="button"
                className={`${prefix}-option is-placeholder${!normalizedValue ? ' is-selected' : ''}`}
                onClick={(event) => handleOptionClick(event, '')}
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
                onClick={(event) => handleOptionClick(event, time)}
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
