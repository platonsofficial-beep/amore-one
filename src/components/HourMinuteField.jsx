import { useEffect, useState } from 'react'
import { buildHourOptions, buildMinuteOptions, parseHourMinute } from '../lib/hourMinuteField'

const EMPTY_LABEL = '--'

/**
 * Locale-independent 24-hour time. The stored value stays HH:MM.
 * Native time inputs are not used: Chrome and iOS render those in 12-hour
 * form and clip the AM/PM segment.
 */
export function HourMinuteField({
  value = '',
  onChange,
  disabled = false,
  minuteStep = 15,
  ariaLabel = 'Time',
  className = '',
  allowEmpty = true,
}) {
  const parsed = parseHourMinute(value)
  const [draft, setDraft] = useState(parsed)

  useEffect(() => {
    setDraft(parseHourMinute(value))
  }, [value])

  const hours = buildHourOptions()
  const minutes = buildMinuteOptions(minuteStep, draft.minute)
  const empty = !draft.hour && !draft.minute
  const showBlank = allowEmpty || empty

  const update = (nextHour, nextMinute) => {
    setDraft({ hour: nextHour, minute: nextMinute })
    if (nextHour && nextMinute) {
      onChange?.(`${nextHour}:${nextMinute}`)
      return
    }
    if (allowEmpty && !nextHour && !nextMinute) onChange?.('')
  }

  return (
    <div
      className={`hour-minute-field${empty ? ' is-empty' : ''}${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={ariaLabel}
    >
      <select
        aria-label={`${ariaLabel} hour`}
        value={draft.hour}
        disabled={disabled}
        onChange={(event) => update(event.target.value, draft.minute)}
      >
        {showBlank ? <option value="">{EMPTY_LABEL}</option> : null}
        {hours.map((hour) => (
          <option key={hour} value={hour}>{hour}</option>
        ))}
      </select>
      <span className="hour-minute-sep" aria-hidden="true">:</span>
      <select
        aria-label={`${ariaLabel} minute`}
        value={draft.minute}
        disabled={disabled}
        onChange={(event) => update(draft.hour, event.target.value)}
      >
        {showBlank ? <option value="">{EMPTY_LABEL}</option> : null}
        {minutes.map((minute) => (
          <option key={minute} value={minute}>{minute}</option>
        ))}
      </select>
    </div>
  )
}
