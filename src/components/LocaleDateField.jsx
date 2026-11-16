import { useState } from 'react'
import { useLocale } from '../i18n/i18n'
import { dayMonthYearToIso, isoToDayMonthYear } from '../lib/localeDate'

/**
 * English keeps the native date control. Greek shows dd/mm/yyyy, because the
 * native control follows the device language and was showing mm/dd/yyyy.
 */
export function LocaleDateField({
  value = '',
  onChange,
  disabled = false,
  id,
  'aria-invalid': ariaInvalid,
}) {
  const locale = useLocale()
  const [draft, setDraft] = useState(null)

  if (locale !== 'el') {
    return (
      <input
        type="date"
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        onChange={(event) => onChange?.(event.target.value)}
      />
    )
  }

  const shown = draft == null ? isoToDayMonthYear(value) : draft

  return (
    <input
      type="text"
      inputMode="numeric"
      lang="el-GR"
      placeholder="dd/mm/yyyy"
      autoComplete="off"
      id={id}
      value={shown}
      disabled={disabled}
      aria-invalid={ariaInvalid}
      onChange={(event) => {
        const next = event.target.value
        setDraft(next)
        if (next.trim() === '') {
          onChange?.('')
          return
        }
        const iso = dayMonthYearToIso(next)
        if (iso) onChange?.(iso)
      }}
      onBlur={() => setDraft(null)}
    />
  )
}
